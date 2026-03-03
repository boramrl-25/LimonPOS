package com.limonpos.app.data.printer

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PrinterWarningHolder @Inject constructor() {
    private val _state = MutableStateFlow<PrinterWarningState?>(null)
    val state: StateFlow<PrinterWarningState?> = _state.asStateFlow()

    fun setWarning(warning: PrinterWarningState) {
        _state.value = warning
    }

    fun clear() {
        _state.value = null
    }
}
