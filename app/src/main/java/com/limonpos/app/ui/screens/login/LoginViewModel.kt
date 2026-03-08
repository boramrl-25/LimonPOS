package com.limonpos.app.ui.screens.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _pin = MutableStateFlow("")
    val pin: StateFlow<String> = _pin.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _loginSuccess = MutableStateFlow(false)
    val loginSuccess: StateFlow<Boolean> = _loginSuccess.asStateFlow()

    private val _maintenanceAccessGranted = MutableStateFlow(false)
    val maintenanceAccessGranted: StateFlow<Boolean> = _maintenanceAccessGranted.asStateFlow()

    fun consumeMaintenanceAccess() {
        _maintenanceAccessGranted.value = false
    }

    fun addDigit(digit: String) {
        if (_pin.value.length < 4) {
            _pin.value += digit
            _error.value = null
            if (_pin.value.length == 4) {
                login()
            }
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
        // 1234 = sadece Server URL ekranı, session/login yok, hata gösterme
        if (_pin.value == "1234") {
            _maintenanceAccessGranted.value = true
            clearPin()
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
