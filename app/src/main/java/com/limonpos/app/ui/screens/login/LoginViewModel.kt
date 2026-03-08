package com.limonpos.app.ui.screens.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.ServerSettingsAccessRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val serverSettingsAccessRepository: ServerSettingsAccessRepository
) : ViewModel() {

    private val _pin = MutableStateFlow("")
    val pin: StateFlow<String> = _pin.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _loginSuccess = MutableStateFlow(false)
    val loginSuccess: StateFlow<Boolean> = _loginSuccess.asStateFlow()

    // Maintenance PIN: sadece Server URL ekranı için, session/login yok
    private val _maintenancePin = MutableStateFlow("")
    val maintenancePin: StateFlow<String> = _maintenancePin.asStateFlow()

    private val _maintenanceError = MutableStateFlow<String?>(null)
    val maintenanceError: StateFlow<String?> = _maintenanceError.asStateFlow()

    private val _showMaintenanceDialog = MutableStateFlow(false)
    val showMaintenanceDialog: StateFlow<Boolean> = _showMaintenanceDialog.asStateFlow()

    private val _maintenanceAccessGranted = MutableStateFlow(false)
    val maintenanceAccessGranted: StateFlow<Boolean> = _maintenanceAccessGranted.asStateFlow()

    fun openMaintenanceDialog() {
        _showMaintenanceDialog.value = true
        _maintenancePin.value = ""
        _maintenanceError.value = null
    }

    fun dismissMaintenanceDialog() {
        _showMaintenanceDialog.value = false
        _maintenancePin.value = ""
        _maintenanceError.value = null
    }

    fun addMaintenanceDigit(digit: String) {
        if (_maintenancePin.value.length < 4) {
            _maintenancePin.value += digit
            _maintenanceError.value = null
        }
    }

    fun backspaceMaintenance() {
        if (_maintenancePin.value.isNotEmpty()) {
            _maintenancePin.value = _maintenancePin.value.dropLast(1)
        }
    }

    fun validateMaintenancePin(): Boolean {
        if (_maintenancePin.value.length != 4) {
            _maintenanceError.value = "4 haneli PIN girin"
            return false
        }
        if (!serverSettingsAccessRepository.isValidMaintenancePin(_maintenancePin.value)) {
            _maintenanceError.value = "Geçersiz PIN"
            return false
        }
        _maintenanceAccessGranted.value = true
        dismissMaintenanceDialog()
        return true
    }

    fun consumeMaintenanceAccess() {
        _maintenanceAccessGranted.value = false
    }

    fun addDigit(digit: String) {
        if (_pin.value.length < 4) {
            _pin.value += digit
            _error.value = null
        }
    }

    fun backspace() {
        if (_pin.value.isNotEmpty()) {
            _pin.value = _pin.value.dropLast(1)
        }
    }

    fun clearPin() {
        _pin.value = ""
        _error.value = null
    }

    fun login() {
        if (_pin.value.length != 4) {
            _error.value = "Please enter 4 digits"
            return
        }
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            authRepository.login(_pin.value)
                .onSuccess {
                    _loginSuccess.value = true
                }
                .onFailure {
                    _error.value = it.message ?: "Invalid PIN"
                }
            _isLoading.value = false
        }
    }
}
