package com.limonpos.app.ui.screens.serversettings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.prefs.ServerPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ServerSettingsViewModel @Inject constructor(
    private val serverPreferences: ServerPreferences
) : ViewModel() {

    val baseUrl = serverPreferences.baseUrl.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        ServerPreferences.DEFAULT_BASE_URL
    )

    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()

    fun saveUrl(url: String) {
        viewModelScope.launch {
            try {
                serverPreferences.setBaseUrl(url)
                _message.update { "Saved. Restart app to apply." }
            } catch (e: Exception) {
                _message.update { "Error: ${e.message}" }
            }
        }
    }

    fun clearMessage() {
        _message.update { null }
    }
}
