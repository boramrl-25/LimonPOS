package com.limonpos.app.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.prefs.PrinterPreferences
import com.limonpos.app.data.prefs.ReceiptItemSize
import com.limonpos.app.data.prefs.ServerPreferences
import com.limonpos.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val showEndOfShiftPinDialog: Boolean = false,
    val endOfShiftPinError: String? = null
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val apiSyncRepository: ApiSyncRepository,
    private val serverPreferences: ServerPreferences,
    private val printerPreferences: PrinterPreferences
) : ViewModel() {

    val userRole: StateFlow<String?> = authRepository.getCurrentUserRole()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val isManager: StateFlow<Boolean> = authRepository.getCurrentUserRole()
        .map { it in listOf("manager", "admin", "supervisor") }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    val canAccessKds: StateFlow<Boolean> = authRepository.canAccessKds()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    val apiBaseUrl: StateFlow<String> = serverPreferences.baseUrl
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    val receiptItemSize: StateFlow<Int> = printerPreferences.receiptItemSize
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ReceiptItemSize.NORMAL)

    fun setReceiptItemSize(size: Int) {
        viewModelScope.launch {
            printerPreferences.setReceiptItemSize(size)
        }
    }

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _settingsUiState = MutableStateFlow(SettingsUiState())
    val settingsUiState: StateFlow<SettingsUiState> = _settingsUiState.asStateFlow()

    fun clearMessage() { _message.value = null }

    /** Logout: leave app only (no PIN, no backend sign-out). */
    fun logout() {
        viewModelScope.launch { authRepository.logoutLocalOnly() }
    }

    fun requestEndOfShift() {
        _settingsUiState.value = SettingsUiState(showEndOfShiftPinDialog = true, endOfShiftPinError = null)
    }

    fun dismissEndOfShiftPinDialog() {
        _settingsUiState.value = SettingsUiState(showEndOfShiftPinDialog = false, endOfShiftPinError = null)
    }

    fun submitEndOfShiftPin(pin: String) {
        viewModelScope.launch {
            val r = authRepository.verifyPin(pin)
            if (r.isSuccess) {
                authRepository.logout()
            } else {
                _settingsUiState.value = _settingsUiState.value.copy(
                    endOfShiftPinError = r.exceptionOrNull()?.message ?: "Invalid PIN"
                )
            }
        }
    }
}
