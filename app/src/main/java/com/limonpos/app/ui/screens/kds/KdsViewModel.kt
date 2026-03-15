package com.limonpos.app.ui.screens.kds

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.prefs.ServerPreferences
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
    private val kdsRefreshHolder: KdsRefreshHolder,
    private val serverPreferences: ServerPreferences
) : ViewModel() {

    private val _kdsUrl = MutableStateFlow<String?>(null)
    val kdsUrl: StateFlow<String?> = _kdsUrl.asStateFlow()

    /** B cihazında neden sipariş gelmiyor görmek için: sunucu adresi + sipariş sayısı veya hata */
    private val _kdsDiagnostic = MutableStateFlow<String>("")
    val kdsDiagnostic: StateFlow<String> = _kdsDiagnostic.asStateFlow()

    val refreshRequests = kdsRefreshHolder.refreshRequests

    init {
        viewModelScope.launch {
            val port = 8080
            if (kdsServer.start(port)) {
                _kdsUrl.value = "http://127.0.0.1:$port/"
            }
            if (apiSyncRepository.isOnline()) {
                apiSyncRepository.syncTablesAndOrdersForKds()
            }
        }
        viewModelScope.launch {
            while (true) {
                delay(800)
                if (apiSyncRepository.isOnline()) {
                    apiSyncRepository.syncTablesAndOrdersForKds()
                }
            }
        }
        viewModelScope.launch {
            delay(2000)
            while (true) {
                try {
                    val url = serverPreferences.getBaseUrl()
                    val list = apiSyncRepository.fetchKitchenOrdersFromApi(null)
                    val n = list?.size ?: 0
                    _kdsDiagnostic.value = "Sunucu: $url | Sipariş: $n"
                } catch (e: Exception) {
                    _kdsDiagnostic.value = "Hata: ${e.message ?: "baglanti yok"}"
                }
                delay(4000)
            }
        }
    }

    override fun onCleared() {
        kdsServer.stop()
        super.onCleared()
    }
}
