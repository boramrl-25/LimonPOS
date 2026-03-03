package com.limonpos.app.ui.screens.kds

import androidx.lifecycle.ViewModel
import com.limonpos.app.service.KdsServer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import androidx.lifecycle.viewModelScope
import javax.inject.Inject

@HiltViewModel
class BackOfficeSettingsViewModel @Inject constructor(
    private val kdsServer: KdsServer
) : ViewModel() {

    private val _backOfficeUrl = MutableStateFlow<String?>(null)
    val backOfficeUrl: StateFlow<String?> = _backOfficeUrl.asStateFlow()

    init {
        viewModelScope.launch {
            val port = 8080
            if (kdsServer.start(port)) {
                _backOfficeUrl.value = "http://127.0.0.1:$port/?page=settings"
            }
        }
    }

    override fun onCleared() {
        kdsServer.stop()
        super.onCleared()
    }
}
