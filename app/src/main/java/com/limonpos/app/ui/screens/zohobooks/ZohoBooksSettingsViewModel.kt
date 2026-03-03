package com.limonpos.app.ui.screens.zohobooks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.zoho.ZohoBooksPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ZohoBooksSettingsViewModel @Inject constructor(
    private val zohoPreferences: ZohoBooksPreferences
) : ViewModel() {

    val isEnabled: StateFlow<Boolean> = zohoPreferences.isEnabled
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    val accessToken: StateFlow<String> = zohoPreferences.accessToken
        .map { it ?: "" }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    val organizationId: StateFlow<String> = zohoPreferences.organizationId
        .map { it ?: "" }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    val customerId: StateFlow<String> = zohoPreferences.customerId
        .map { it ?: "" }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun setEnabled(enabled: Boolean) {
        viewModelScope.launch {
            zohoPreferences.setEnabled(enabled)
            _message.value = if (enabled) "Zoho Books enabled" else "Zoho Books disabled"
        }
    }

    fun saveCredentials(accessToken: String, organizationId: String, customerId: String) {
        viewModelScope.launch {
            if (accessToken.isBlank() || organizationId.isBlank() || customerId.isBlank()) {
                _message.value = "All fields required"
                return@launch
            }
            zohoPreferences.setCredentials(accessToken.trim(), organizationId.trim(), customerId.trim())
            _message.value = "Saved. Sales will sync to Zoho Books."
        }
    }

    fun clearMessage() { _message.value = null }
}
