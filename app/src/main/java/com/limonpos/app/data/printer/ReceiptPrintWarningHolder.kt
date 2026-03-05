package com.limonpos.app.data.printer

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReceiptPrintWarningHolder @Inject constructor() {
    private val _state = MutableStateFlow<ReceiptPrintWarningState?>(null)
    val state: StateFlow<ReceiptPrintWarningState?> = _state.asStateFlow()

    /** Kaç kez olursa olsun her fiş hatasında diyalog gösterilsin diye önce null, sonra yeni uyarı set edilir. */
    fun setWarning(warning: ReceiptPrintWarningState) {
        _state.value = null
        _state.value = warning
    }

    fun clear() {
        _state.value = null
    }
}
