package com.limonpos.app.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.prefs.AppSettingsPreferences
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val apiSyncRepository: ApiSyncRepository,
    private val appSettingsPreferences: AppSettingsPreferences
) : ViewModel() {

    val userRole: StateFlow<String?> = authRepository.getCurrentUserRole()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val isManager: StateFlow<Boolean> = authRepository.getCurrentUserRole()
        .map { it in listOf("manager", "admin", "supervisor") }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    val overdueDefaultMinutesFromPrefs: StateFlow<Int> = appSettingsPreferences.overdueUndeliveredDefaultMinutesFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), AppSettingsPreferences.DEFAULT_MINUTES)

    private val _overdueDefaultMinutesInput = MutableStateFlow("")
    val overdueDefaultMinutesInput: StateFlow<String> = _overdueDefaultMinutesInput.asStateFlow()

    private val _isSavingOverdueDefault = MutableStateFlow(false)
    val isSavingOverdueDefault: StateFlow<Boolean> = _isSavingOverdueDefault.asStateFlow()

    private val _overdueDefaultError = MutableStateFlow<String?>(null)
    val overdueDefaultError: StateFlow<String?> = _overdueDefaultError.asStateFlow()

    private val _overdueDefaultSavedMessage = MutableStateFlow<String?>(null)
    val overdueDefaultSavedMessage: StateFlow<String?> = _overdueDefaultSavedMessage.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun setOverdueDefaultMinutesInput(value: String) {
        _overdueDefaultMinutesInput.value = value
        _overdueDefaultError.value = null
    }

    fun loadOverdueDefaultIntoInput(current: Int) {
        val cur = _overdueDefaultMinutesInput.value
        if (cur.isEmpty() || cur.toIntOrNull() !in AppSettingsPreferences.MIN_MINUTES..AppSettingsPreferences.MAX_MINUTES) {
            _overdueDefaultMinutesInput.value = current.toString()
        }
    }

    fun saveOverdueDefaultMinutes() {
        viewModelScope.launch {
            _overdueDefaultError.value = null
            _overdueDefaultSavedMessage.value = null
            val raw = _overdueDefaultMinutesInput.value.trim()
            val value = raw.toIntOrNull()
            if (value == null || value !in AppSettingsPreferences.MIN_MINUTES..AppSettingsPreferences.MAX_MINUTES) {
                _overdueDefaultError.value = "Enter a number between ${AppSettingsPreferences.MIN_MINUTES} and ${AppSettingsPreferences.MAX_MINUTES}"
                return@launch
            }
            _isSavingOverdueDefault.value = true
            try {
                appSettingsPreferences.setOverdueUndeliveredDefaultMinutes(value)
                apiSyncRepository.clearOverdueMinutesCache()
                _overdueDefaultMinutesInput.value = value.toString()
                _overdueDefaultSavedMessage.value = "Saved"
            } catch (e: Exception) {
                _overdueDefaultError.value = e.message ?: "Save failed"
            } finally {
                _isSavingOverdueDefault.value = false
            }
        }
    }

    fun clearOverdueDefaultSavedMessage() {
        _overdueDefaultSavedMessage.value = null
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
