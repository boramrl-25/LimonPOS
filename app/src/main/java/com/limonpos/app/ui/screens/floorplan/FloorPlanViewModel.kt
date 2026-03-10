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
import com.limonpos.app.data.repository.OverdueWarningHolder
import com.limonpos.app.data.repository.ReservationReminderHolder
import com.limonpos.app.data.repository.UpcomingReservationAlert
import com.limonpos.app.data.repository.TableRepository
import com.limonpos.app.data.prefs.CurrencyPreferences
import com.limonpos.app.data.prefs.ServerPreferences
import com.limonpos.app.data.repository.OverdueUndelivered
import com.limonpos.app.data.repository.VoidRequestRepository
import com.limonpos.app.data.local.dao.ClosedBillAccessRequestDao
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
    val showReserveTableDialog: TableEntity? = null,
    val showReservationInfoDialog: TableEntity? = null,
    val reserveTableLoading: Boolean = false,
    val reserveTableError: String? = null,
    val showCashDrawerDialog: Boolean = false,
    val showMenu: Boolean = false,
    val cashDrawerError: String? = null,
    val isLocked: Boolean = false,
    val showLockDialog: Boolean = false,
    val lockError: String? = null,
    val closeTableError: String? = null,
    val showOtherTablePinDialog: Boolean = false,
    val pendingOtherTableId: String? = null,
    val otherTablePinError: String? = null,
    val navigateToTableId: String? = null
)

@HiltViewModel
class FloorPlanViewModel @Inject constructor(
    private val tableRepository: TableRepository,
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository,
    private val apiSyncRepository: ApiSyncRepository,
    private val printerWarningHolder: PrinterWarningHolder,
    private val kitchenPrintHelper: KitchenPrintHelper,
    private val voidRequestRepository: VoidRequestRepository,
    private val closedBillAccessRequestDao: ClosedBillAccessRequestDao,
    private val overdueWarningHolder: OverdueWarningHolder,
    private val reservationReminderHolder: ReservationReminderHolder,
    private val serverPreferences: ServerPreferences,
    private val currencyPreferences: CurrencyPreferences
) : ViewModel() {

    private val _uiState = MutableStateFlow(FloorPlanUiState())
    val uiState: StateFlow<FloorPlanUiState> = _uiState.asStateFlow()

    val printerWarningState: StateFlow<PrinterWarningState?> = printerWarningHolder.state

    val waiterName: StateFlow<String?> = authRepository.getCurrentUserName()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val currentUserId: StateFlow<String?> = authRepository.getCurrentUserId()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val viewAllOrders: StateFlow<Boolean> = authRepository.hasViewAllOrdersFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    val pendingVoidRequestCount: StateFlow<Int> = voidRequestRepository.getPendingRequests()
        .map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val pendingClosedBillAccessRequestCount: StateFlow<Int> = closedBillAccessRequestDao.getPendingRequests()
        .map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val floorPlanSections: StateFlow<Map<String, List<Int>>> = apiSyncRepository.getFloorPlanSections()
        .map { if (it.isEmpty()) DEFAULT_FLOOR_PLAN_SECTIONS else it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DEFAULT_FLOOR_PLAN_SECTIONS)

    val apiBaseUrl: StateFlow<String> = serverPreferences.baseUrl
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    val currencySymbol: StateFlow<String> = currencyPreferences.currencySymbolFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "AED")

    val overdueWarning: StateFlow<List<OverdueUndelivered>?> = overdueWarningHolder.overdue

    val reservationUpcoming: StateFlow<List<UpcomingReservationAlert>> = reservationReminderHolder.upcoming

    private val _canCancelReservation = MutableStateFlow(false)
    val canCancelReservation: StateFlow<Boolean> = _canCancelReservation.asStateFlow()

    companion object {
        private const val POLL_INTERVAL_MS = 25_000L
    }

    init {
        viewModelScope.launch { _canCancelReservation.value = authRepository.isSupervisorRole() }
        loadTables()
        syncFromApi()
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

    fun dismissOverdueWarning() {
        overdueWarningHolder.dismiss()
    }

    fun dismissReservationReminder() {
        reservationReminderHolder.dismiss()
    }

    /** Returns true if we should play notification sound for this list (first time only per reservation). */
    fun shouldPlayReservationNotification(list: List<UpcomingReservationAlert>): Boolean =
        reservationReminderHolder.shouldShowNotification(list)

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
            _canCancelReservation.value = authRepository.isSupervisorRole()
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
            "reserved" -> _uiState.update { it.copy(showReservationInfoDialog = table) }
            "occupied", "bill" -> {
                viewModelScope.launch {
                    val uid = authRepository.getCurrentUserIdSync()
                    val viewAll = authRepository.hasViewAllOrders()
                    val isOwnTable = uid != null && table.waiterId == uid
                    if (viewAll && !isOwnTable) {
                        _uiState.update {
                            it.copy(
                                showOtherTablePinDialog = true,
                                pendingOtherTableId = table.id,
                                otherTablePinError = null
                            )
                        }
                    } else {
                        onNavigateToOrder(table.id)
                    }
                }
            }
            else -> onNavigateToOrder(table.id)
        }
    }

    fun verifyOtherTableAccess(pin: String) {
        viewModelScope.launch {
            val tableId = _uiState.value.pendingOtherTableId ?: return@launch
            authRepository.verifyPin(pin)
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            showOtherTablePinDialog = false,
                            pendingOtherTableId = null,
                            otherTablePinError = null,
                            navigateToTableId = tableId
                        )
                    }
                }
                .onFailure { ex ->
                    _uiState.update { s ->
                        s.copy(otherTablePinError = ex.message ?: "Invalid PIN")
                    }
                }
        }
    }

    fun dismissOtherTablePinDialog() {
        _uiState.update {
            it.copy(
                showOtherTablePinDialog = false,
                pendingOtherTableId = null,
                otherTablePinError = null
            )
        }
    }

    fun clearNavigateToTableId() {
        _uiState.update { it.copy(navigateToTableId = null) }
    }

    fun dismissOpenTableDialog() {
        _uiState.update { it.copy(showOpenTableDialog = null) }
    }

    fun showReserveTableDialog(table: TableEntity) {
        _uiState.update { it.copy(showOpenTableDialog = null, showReserveTableDialog = table, reserveTableError = null) }
    }

    fun dismissReserveTableDialog() {
        _uiState.update { it.copy(showReserveTableDialog = null, reserveTableError = null) }
    }

    fun dismissReservationInfoDialog() {
        _uiState.update { it.copy(showReservationInfoDialog = null) }
    }

    /** Show open table dialog for a table (e.g. from reservation info). */
    fun openTableFromReservation(table: TableEntity) {
        _uiState.update { it.copy(showReservationInfoDialog = null, showOpenTableDialog = table) }
    }

    fun reserveTable(tableId: String, guestName: String, guestPhone: String, fromTimeMs: Long, toTimeMs: Long) {
        viewModelScope.launch {
            _uiState.update { it.copy(reserveTableLoading = true, reserveTableError = null) }
            val ok = apiSyncRepository.reserveTable(tableId, guestName.trim(), guestPhone.trim(), fromTimeMs, toTimeMs)
            _uiState.update {
                it.copy(
                    reserveTableLoading = false,
                    showReserveTableDialog = null,
                    reserveTableError = if (ok) null else "Failed to reserve. Check connection and try again."
                )
            }
            if (ok) loadTables()
        }
    }

    fun cancelReservation(tableId: String) {
        viewModelScope.launch {
            if (!authRepository.isSupervisorRole()) {
                _uiState.update {
                    it.copy(reserveTableError = "Only supervisor or manager can cancel reservations.")
                }
                return@launch
            }
            _uiState.update { it.copy(reserveTableLoading = true, reserveTableError = null) }
            val ok = apiSyncRepository.cancelTableReservation(tableId)
            _uiState.update {
                it.copy(
                    reserveTableLoading = false,
                    showReservationInfoDialog = null,
                    reserveTableError = if (ok) null else "Failed to cancel reservation."
                )
            }
            if (ok) loadTables()
        }
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
                .onSuccess { _ ->
                    val targetTable = tableRepository.getTableById(targetTableId)
                    val orderId = targetTable?.currentOrderId
                    if (orderId != null && targetTable != null) {
                        apiSyncRepository.pushTableTransfer(
                            sourceTableId,
                            targetTableId,
                            orderId,
                            targetTable.number
                        )
                    }
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
                apiSyncRepository.pushTableStatesNow()
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
