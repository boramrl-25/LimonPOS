package com.limonpos.app.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Global holder for overdue undelivered items. Updated by app-wide check; observed by Order/FloorPlan UI. */
@Singleton
class OverdueWarningHolder @Inject constructor() {
    private val _overdue = MutableStateFlow<List<OverdueUndelivered>?>(null)
    val overdue: StateFlow<List<OverdueUndelivered>?> = _overdue.asStateFlow()

    private var lastNotifiedItemIds: Set<String> = emptySet()
    private var lastNotifiedAt: Long = 0L
    private val NOTIFICATION_COOLDOWN_MS = 2 * 60 * 1000L

    /** When user taps OK, suppress showing again for 2 min; then re-show if items still overdue. */
    private var dismissedAt: Long = 0L
    private val DISMISS_COOLDOWN_MS = 2 * 60 * 1000L

    fun update(list: List<OverdueUndelivered>?) {
        if (list.isNullOrEmpty()) {
            _overdue.value = null
            return
        }
        val now = System.currentTimeMillis()
        if (dismissedAt > 0 && (now - dismissedAt) < DISMISS_COOLDOWN_MS) {
            return
        }
        dismissedAt = 0L
        _overdue.value = list
    }

    /** Call when user taps OK/Tamam. Clears dialog; next update (if items still overdue) will be suppressed for 2 min. */
    fun dismiss() {
        _overdue.value = null
        dismissedAt = System.currentTimeMillis()
    }

    /**
     * Returns true if we should show notification/sound for this list (avoids repeating for same items within cooldown).
     * Call this before showing notification; when it returns true, the holder updates internal cooldown state.
     */
    fun shouldShowNotification(list: List<OverdueUndelivered>): Boolean {
        if (list.isEmpty()) return false
        val itemIds = list.flatMap { it.items }.map { it.id }.toSet()
        val now = System.currentTimeMillis()
        if (itemIds == lastNotifiedItemIds && (now - lastNotifiedAt) < NOTIFICATION_COOLDOWN_MS) {
            return false
        }
        lastNotifiedItemIds = itemIds
        lastNotifiedAt = now
        return true
    }
}
