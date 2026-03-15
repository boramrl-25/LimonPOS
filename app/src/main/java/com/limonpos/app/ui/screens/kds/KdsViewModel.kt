package com.limonpos.app.ui.screens.kds

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.service.KdsRefreshHolder
import com.limonpos.app.service.KdsServer
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class KdsViewModel @Inject constructor(
    private val kdsServer: KdsServer,
    private val apiSyncRepository: ApiSyncRepository,
    private val kdsRefreshHolder: KdsRefreshHolder
) : ViewModel() {

    private val _kdsUrl = MutableStateFlow<String?>(null)

    val kdsUrl: StateFlow<String?> = _kdsUrl.asStateFlow()

    val refreshRequests = kdsRefreshHolder.refreshRequests

    init {
        viewModelScope.launch {
            val port = 8080
            if (kdsServer.start(port)) {
                _kdsUrl.value = "http://127.0.0.1:$port/"
            }
            // Initial sync
            if (apiSyncRepository.isOnline()) {
                apiSyncRepository.syncTablesAndOrdersForKds()
            }
        }
        // Force sync every 1.5s so B (KDS) gets A's orders quickly; also pushes Ready/Delivered
        viewModelScope.launch {
            while (true) {
                delay(1500)
                if (apiSyncRepository.isOnline()) {
                    apiSyncRepository.syncTablesAndOrdersForKds()
                }
            }
        }
    }

    override fun onCleared() {
        kdsServer.stop()
        super.onCleared()
    }
}
