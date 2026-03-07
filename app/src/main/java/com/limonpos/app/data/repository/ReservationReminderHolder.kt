package com.limonpos.app.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** One upcoming reservation to show in reminder / notification. */
data class UpcomingReservationAlert(
    val tableId: String,
    val tableNumber: String,
    val reservationFrom: Long,
    val reservationTo: Long,
    val guestName: String?,
    val guestPhone: String?
) {
    fun reservationKey(): String = "${tableId}_$reservationFrom"
}

/**
 * Global holder for upcoming reservation reminders (e.g. 30 min before).
 * Prevents spam: same reservation (tableId + reservationFrom) notified only once.
 */
@Singleton
class ReservationReminderHolder @Inject constructor() {
    private val _upcoming = MutableStateFlow<List<UpcomingReservationAlert>>(emptyList())
    val upcoming: StateFlow<List<UpcomingReservationAlert>> = _upcoming.asStateFlow()

    private val announcedKeys = mutableSetOf<String>()

    fun update(list: List<UpcomingReservationAlert>) {
        _upcoming.value = list
    }

    /**
     * Call before showing notification. Returns true if we should show (there are new reservations
     * not yet announced). Marks those keys as announced so we don't show again for same reservation.
     */
    fun shouldShowNotification(list: List<UpcomingReservationAlert>): Boolean {
        if (list.isEmpty()) return false
        val newKeys = list.map { it.reservationKey() }.filter { it !in announcedKeys }
        if (newKeys.isEmpty()) return false
        announcedKeys.addAll(newKeys)
        return true
    }

    fun dismiss() {
        _upcoming.value = emptyList()
    }

    /** Clear announced key when reservation has passed (optional cleanup). */
    fun clearAnnouncedKey(key: String) {
        announcedKeys.remove(key)
    }
}
