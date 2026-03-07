package com.limonpos.app.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.repository.ApiSyncRepository
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

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val apiSyncRepository: ApiSyncRepository
) : ViewModel() {

    val userRole: StateFlow<String?> = authRepository.getCurrentUserRole()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val isManager: StateFlow<Boolean> = authRepository.getCurrentUserRole()
        .map { it in listOf("manager", "admin", "supervisor") }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

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
