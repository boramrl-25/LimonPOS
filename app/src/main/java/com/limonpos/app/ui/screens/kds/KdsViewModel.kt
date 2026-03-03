package com.limonpos.app.ui.screens.kds

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.repository.VoidRequestRepository
import com.limonpos.app.service.KdsServer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class KdsViewModel @Inject constructor(
    private val kdsServer: KdsServer,
    private val voidRequestRepository: VoidRequestRepository
) : ViewModel() {

    private val _kdsUrl = MutableStateFlow<String?>(null)

    val pendingVoidRequestCount: StateFlow<Int> = voidRequestRepository.getPendingRequests()
        .map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
    val kdsUrl: StateFlow<String?> = _kdsUrl.asStateFlow()

    init {
        viewModelScope.launch {
            val port = 8080
            if (kdsServer.start(port)) {
                _kdsUrl.value = "http://127.0.0.1:$port/"
            }
        }
    }

    override fun onCleared() {
        kdsServer.stop()
        super.onCleared()
    }
}
