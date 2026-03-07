package com.limonpos.app.data.printer

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.ArrayDeque
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single source of truth for printer warnings. Uses a queue so that when a new warning
 * arrives while one is already showing, it is queued and shown only after the user
 * dismisses or retries the current one. Prevents overwrite where the first warning
 * disappears before the user can act.
 */
@Singleton
class PrinterWarningHolder @Inject constructor() {
    private val _state = MutableStateFlow<PrinterWarningState?>(null)
    val state: StateFlow<PrinterWarningState?> = _state.asStateFlow()

    private val queue = ArrayDeque<PrinterWarningState>()
    private val lock = Any()

    /** Enqueue or show warning. If a warning is already visible, the new one is queued. */
    fun setWarning(warning: PrinterWarningState) {
        synchronized(lock) {
            if (_state.value == null) {
                _state.value = warning
            } else {
                queue.addLast(warning)
            }
        }
    }

    /** Dismiss current warning and show next from queue if any. */
    fun clear() {
        synchronized(lock) {
            if (queue.isNotEmpty()) {
                _state.value = queue.removeFirst()
            } else {
                _state.value = null
            }
        }
    }
}
