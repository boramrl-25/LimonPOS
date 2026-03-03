package com.limonpos.app.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.local.entity.UserEntity
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.TableRepository
import com.limonpos.app.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val tableRepository: TableRepository,
    private val userRepository: UserRepository,
    private val apiSyncRepository: ApiSyncRepository
) : ViewModel() {

    val userRole: StateFlow<String?> = authRepository.getCurrentUserRole()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val isManager: StateFlow<Boolean> = authRepository.getCurrentUserRole()
        .map { it in listOf("manager", "admin", "supervisor") }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _occupiedTables = MutableStateFlow<List<TableEntity>>(emptyList())
    val occupiedTables: StateFlow<List<TableEntity>> = _occupiedTables.asStateFlow()

    private val _freeTables = MutableStateFlow<List<TableEntity>>(emptyList())
    val freeTables: StateFlow<List<TableEntity>> = _freeTables.asStateFlow()

    private val _waiters = MutableStateFlow<List<UserEntity>>(emptyList())
    val waiters: StateFlow<List<UserEntity>> = _waiters.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _showTransferTableDialog = MutableStateFlow(false)
    val showTransferTableDialog: StateFlow<Boolean> = _showTransferTableDialog.asStateFlow()

    private val _showTransferWaiterDialog = MutableStateFlow(false)
    val showTransferWaiterDialog: StateFlow<Boolean> = _showTransferWaiterDialog.asStateFlow()

    fun openTransferTable() {
        viewModelScope.launch {
            _occupiedTables.value = tableRepository.getOccupiedTables()
            _freeTables.value = tableRepository.getAllTables().first().filter { it.status == "free" }
            _showTransferTableDialog.value = true
        }
    }

    fun openTransferWaiter() {
        viewModelScope.launch {
            _occupiedTables.value = tableRepository.getOccupiedTables()
            _waiters.value = userRepository.getAllUsers().first()
            _showTransferWaiterDialog.value = true
        }
    }

    fun closeTransferTableDialog() { _showTransferTableDialog.value = false }
    fun closeTransferWaiterDialog() { _showTransferWaiterDialog.value = false }

    fun transferTable(sourceTableId: String, targetTableId: String) {
        viewModelScope.launch {
            val mid = authRepository.getCurrentUserIdSync() ?: return@launch
            val mname = authRepository.getCurrentUserNameSync() ?: "Manager"
            tableRepository.transferTable(sourceTableId, targetTableId, mid, mname)
                .onSuccess { msg ->
                    _message.value = msg
                    closeTransferTableDialog()
                }
                .onFailure { _message.value = it.message ?: "Transfer failed" }
        }
    }

    fun transferWaiter(tableId: String, waiterId: String, waiterName: String) {
        viewModelScope.launch {
            tableRepository.transferWaiter(tableId, waiterId, waiterName)
                .onSuccess {
                    _message.value = "Waiter transferred"
                    closeTransferWaiterDialog()
                }
                .onFailure { _message.value = it.message ?: "Transfer failed" }
        }
    }

    fun closeEmptyTables() {
        viewModelScope.launch {
            val count = tableRepository.closeEmptyTables()
            _message.value = if (count > 0) "Closed $count table(s)" else "No tables to close"
        }
    }

    fun clearMessage() { _message.value = null }

    fun clearLocalSales() {
        viewModelScope.launch {
            apiSyncRepository.clearLocalSales()
            _message.value = "Local sales cleared"
        }
    }

    fun logout() {
        viewModelScope.launch { authRepository.logout() }
    }
}
