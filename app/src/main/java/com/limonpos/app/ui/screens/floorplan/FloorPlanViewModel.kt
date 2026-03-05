package com.limonpos.app.ui.screens.floorplan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.printer.KitchenPrintHelper
import com.limonpos.app.data.printer.KitchenPrintResult
import com.limonpos.app.data.printer.PrinterWarningHolder
import com.limonpos.app.data.printer.PrinterWarningState
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.TableRepository
import com.limonpos.app.data.repository.OverdueUndelivered
import com.limonpos.app.data.repository.VoidRequestRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.map
import javax.inject.Inject

private val DEFAULT_FLOOR_PLAN_SECTIONS = mapOf(
    "A" to listOf(29, 30, 31, 32, 33, 34, 35, 40),
    "B" to listOf(24, 25, 26, 27, 28, 29, 36, 37, 38, 39),
    "C" to listOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    "D" to listOf(11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21),
    "E" to listOf(41, 42, 43),
)

data class FloorPlanUiState(
    val tablesByFloor: Map<String, List<TableEntity>> = emptyMap(),
    val floors: List<String> = emptyList(),
    val selectedFloor: String = "Main",
    val selectedSection: String = "Main",
    val tableSearchQuery: String = "",
    val waiterName: String? = null,
    val freeCount: Int = 0,
    val occupiedCount: Int = 0,
    val showOpenTableDialog: TableEntity? = null,
    val showCashDrawerDialog: Boolean = false,
    val showMenu: Boolean = false,
    val cashDrawerError: String? = null,
    val isLocked: Boolean = false,
    val showLockDialog: Boolean = false,
    val lockError: String? = null,
    val closeTableError: String? = null
)

@HiltViewModel
class FloorPlanViewModel @Inject constructor(
    private val tableRepository: TableRepository,
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository,
    private val apiSyncRepository: ApiSyncRepository,
    private val printerWarningHolder: PrinterWarningHolder,
    private val kitchenPrintHelper: KitchenPrintHelper,
    private val voidRequestRepository: VoidRequestRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(FloorPlanUiState())
    val uiState: StateFlow<FloorPlanUiState> = _uiState.asStateFlow()

    val printerWarningState: StateFlow<PrinterWarningState?> = printerWarningHolder.state

    val waiterName: StateFlow<String?> = authRepository.getCurrentUserName()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val currentUserId: StateFlow<String?> = authRepository.getCurrentUserId()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val pendingVoidRequestCount: StateFlow<Int> = voidRequestRepository.getPendingRequests()
        .map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val floorPlanSections: StateFlow<Map<String, List<Int>>> = apiSyncRepository.getFloorPlanSections()
        .map { if (it.isEmpty()) DEFAULT_FLOOR_PLAN_SECTIONS else it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DEFAULT_FLOOR_PLAN_SECTIONS)

    private val _overdueWarning = MutableStateFlow<List<OverdueUndelivered>?>(null)
    val overdueWarning: StateFlow<List<OverdueUndelivered>?> = _overdueWarning.asStateFlow()

    companion object {
        private const val POLL_INTERVAL_MS = 25_000L
    }

    init {
        loadTables()
        syncFromApi()
        startOverdueCheckLoop()
        startPeriodicSync()
    }

    private fun startPeriodicSync() {
        viewModelScope.launch {
            while (true) {
                delay(POLL_INTERVAL_MS)
                if (apiSyncRepository.isOnline()) {
                    apiSyncRepository.syncFromApi()
                }
            }
        }
    }

    private fun startOverdueCheckLoop() {
        viewModelScope.launch {
            while (true) {
                val list = orderRepository.getOverdueUndelivered(10 * 60 * 1000L)
                if (list.isNotEmpty()) _overdueWarning.value = list
                delay(60 * 1000L) // re-check every 1 minute
            }
        }
    }

    fun dismissOverdueWarning() {
        _overdueWarning.value = null
    }

    private fun syncFromApi() {
        viewModelScope.launch {
            if (apiSyncRepository.isOnline()) {
                apiSyncRepository.syncFromApi()
            }
        }
    }

    fun refreshFromApi() {
        syncFromApi()
    }

    private fun loadTables() {
        viewModelScope.launch {
            tableRepository.getAllTables().collect { allTables ->
                val floors = allTables.map { it.floor }.distinct().sorted()
                val byFloor = allTables.groupBy { it.floor }
                _uiState.update { state ->
                    val floor = state.selectedFloor.takeIf { floors.contains(it) } ?: floors.firstOrNull() ?: "Main"
                    val tablesOnFloor = byFloor[floor].orEmpty()
                    val free = tablesOnFloor.count { it.status == "free" }
                    val occupied = tablesOnFloor.count { it.status == "occupied" || it.status == "bill" }
                    state.copy(
                        tablesByFloor = byFloor,
                        floors = if (floors.isEmpty()) listOf("Main") else floors,
                        selectedFloor = floor,
                        freeCount = free,
                        occupiedCount = occupied
                    )
                }
            }
        }
    }

    fun setTableSearchQuery(query: String) {
        _uiState.update { it.copy(tableSearchQuery = query) }
    }

    fun selectFloor(floor: String) {
        _uiState.update { state ->
            val tablesOnFloor = state.tablesByFloor[floor].orEmpty()
            state.copy(
                selectedFloor = floor,
                freeCount = tablesOnFloor.count { it.status == "free" },
                occupiedCount = tablesOnFloor.count { it.status == "occupied" || it.status == "bill" }
            )
        }
    }

    fun selectSection(section: String) {
        _uiState.update { it.copy(selectedSection = section) }
    }

    fun onTableClick(table: TableEntity, onNavigateToOrder: (String) -> Unit) {
        when (table.status) {
            "free" -> _uiState.update { it.copy(showOpenTableDialog = table) }
            else -> onNavigateToOrder(table.id)
        }
    }

    fun dismissOpenTableDialog() {
        _uiState.update { it.copy(showOpenTableDialog = null) }
    }

    fun openTable(tableId: String, guestCount: Int, onNavigateToOrder: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val uid = authRepository.getCurrentUserIdSync() ?: return@launch
                val uname = authRepository.getCurrentUserNameSync() ?: "Waiter"
                val order = orderRepository.createOrder(tableId, guestCount, uid, uname)
                tableRepository.occupyTable(tableId, order.id, guestCount, uid, uname)
                _uiState.update { it.copy(showOpenTableDialog = null) }
                onNavigateToOrder(tableId)
                if (apiSyncRepository.isOnline()) {
                    apiSyncRepository.pushTableStatesNow()
                    apiSyncRepository.syncFromApi()
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(showOpenTableDialog = null) }
            }
        }
    }

    fun showCashDrawerDialog() {
        _uiState.update { it.copy(showCashDrawerDialog = true, showMenu = false, cashDrawerError = null) }
    }

    fun dismissCashDrawerDialog() {
        _uiState.update { it.copy(showCashDrawerDialog = false, cashDrawerError = null) }
    }

    fun verifyCashDrawer(pin: String) {
        viewModelScope.launch {
            authRepository.verifyCashDrawer(pin)
                .onSuccess {
                    _uiState.update { it.copy(showCashDrawerDialog = false, cashDrawerError = null) }
                }
                .onFailure { ex ->
                    _uiState.update { it.copy(cashDrawerError = ex.message ?: "Invalid PIN") }
                }
        }
    }

    fun toggleMenu() {
        _uiState.update { it.copy(showMenu = !it.showMenu) }
    }

    fun dismissMenu() {
        _uiState.update { it.copy(showMenu = false) }
    }

    fun unlockFloor(pin: String) {
        viewModelScope.launch {
            authRepository.verifyPin(pin)
                .onSuccess {
                    _uiState.update { it.copy(isLocked = false, showLockDialog = false, lockError = null) }
                }
                .onFailure { ex ->
                    _uiState.update { it.copy(lockError = ex.message ?: "Invalid PIN") }
                }
        }
    }

    fun lockFloor() {
        _uiState.update { it.copy(isLocked = true, showLockDialog = true, lockError = null) }
    }

    fun dismissLockError() {
        _uiState.update { it.copy(lockError = null) }
    }

    private val _occupiedTables = MutableStateFlow<List<TableEntity>>(emptyList())
    val occupiedTables: StateFlow<List<TableEntity>> = _occupiedTables.asStateFlow()

    private val _freeTables = MutableStateFlow<List<TableEntity>>(emptyList())
    val freeTables: StateFlow<List<TableEntity>> = _freeTables.asStateFlow()

    private val _showTransferTableDialog = MutableStateFlow(false)
    val showTransferTableDialog: StateFlow<Boolean> = _showTransferTableDialog.asStateFlow()

    private val _transferSourceTable = MutableStateFlow<TableEntity?>(null)
    val transferSourceTable: StateFlow<TableEntity?> = _transferSourceTable.asStateFlow()

    fun openTransferTableFromTable(table: TableEntity) {
        viewModelScope.launch {
            _occupiedTables.value = tableRepository.getOccupiedTables()
            _freeTables.value = tableRepository.getAllTables().first().filter { it.status == "free" }
            _transferSourceTable.value = table
            _showTransferTableDialog.value = true
        }
    }

    fun closeTransferTableDialog() {
        _showTransferTableDialog.value = false
        _transferSourceTable.value = null
    }

    fun transferTable(sourceTableId: String, targetTableId: String) {
        viewModelScope.launch {
            val mid = authRepository.getCurrentUserIdSync() ?: return@launch
            val mname = authRepository.getCurrentUserNameSync() ?: "Manager"
            tableRepository.transferTable(sourceTableId, targetTableId, mid, mname)
                .onSuccess {
                    closeTransferTableDialog()
                }
                .onFailure { /* ignore */ }
        }
    }

    fun closeTable(tableId: String) {
        viewModelScope.launch {
            val blockReason = orderRepository.getCloseTableBlockReason(tableId)
            if (blockReason != null) {
                _uiState.update { it.copy(closeTableError = blockReason) }
                return@launch
            }
            _uiState.update { it.copy(closeTableError = null) }
            orderRepository.closeTableManually(tableId)
            if (apiSyncRepository.isOnline()) {
                apiSyncRepository.pushCloseTable(tableId)
            }
        }
    }

    fun clearCloseTableError() {
        _uiState.update { it.copy(closeTableError = null) }
    }

    fun retryKitchenPrint() {
        viewModelScope.launch {
            val s = printerWarningHolder.state.value ?: return@launch
            printerWarningHolder.clear()
            val result = if (s.pendingItemIds.isNotEmpty()) {
                kitchenPrintHelper.retryPrint(s.orderId, s.pendingItemIds)
            } else {
                kitchenPrintHelper.sendToKitchen(s.orderId)
            }
            when (result) {
                is KitchenPrintResult.Success -> { }
                is KitchenPrintResult.Failure -> {
                    val msg = if (result.tableNumber.isNotBlank()) "Table ${result.tableNumber}: ${result.message}" else result.message
                    printerWarningHolder.setWarning(PrinterWarningState(msg, result.orderId, result.tableId, result.pendingItemIds))
                }
            }
        }
    }

    /** Dismiss: Uyarıyı kapat. Ürünler zaten KDS'de (sent). */
    fun dismissPrinterWarning() {
        printerWarningHolder.clear()
    }
}
