package com.limonpos.app.ui.screens.kds

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.service.KdsServer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class KdsViewModel @Inject constructor(
    private val kdsServer: KdsServer,
    private val apiSyncRepository: ApiSyncRepository
) : ViewModel() {

    private val _kdsUrl = MutableStateFlow<String?>(null)

    val kdsUrl: StateFlow<String?> = _kdsUrl.asStateFlow()

    init {
        viewModelScope.launch {
            val port = 8080
            if (kdsServer.start(port)) {
                _kdsUrl.value = "http://127.0.0.1:$port/"
            }
            // Light sync in background: tables + orders. KDS polls every 2s, so data appears quickly.
            if (apiSyncRepository.isOnline()) {
                apiSyncRepository.syncTablesAndOrdersForKds()
            }
        }
    }

    override fun onCleared() {
        kdsServer.stop()
        super.onCleared()
    }
}
