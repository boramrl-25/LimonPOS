package com.limonpos.app.ui.screens.kds

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.service.KdsServer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class KdsViewModel @Inject constructor(
    private val kdsServer: KdsServer
) : ViewModel() {

    private val _kdsUrl = MutableStateFlow<String?>(null)

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
