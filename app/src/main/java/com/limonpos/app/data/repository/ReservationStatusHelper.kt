package com.limonpos.app.data.repository

import com.limonpos.app.data.local.entity.TableEntity

/**
 * Pure helper for reservation time-window logic.
 * reservationFrom / reservationTo null → all functions return false.
 */
object ReservationStatusHelper {

    private const val DEFAULT_LEAD_MINUTES = 30

    /**
     * True if reservation start is within the next [leadMinutes] (e.g. 30 min).
     * Window: reservationFrom - leadMinutes <= now < reservationTo.
     */
    fun isReservationUpcoming(
        table: TableEntity,
        nowMs: Long,
        leadMinutes: Int = DEFAULT_LEAD_MINUTES
    ): Boolean {
        val from = table.reservationFrom ?: return false
        val to = table.reservationTo ?: return false
        val leadMs = leadMinutes * 60 * 1000L
        return nowMs >= (from - leadMs) && nowMs < to
    }

    /**
     * True if now is inside the reservation window [reservationFrom, reservationTo].
     */
    fun isReservationActive(table: TableEntity, nowMs: Long): Boolean {
        val from = table.reservationFrom ?: return false
        val to = table.reservationTo ?: return false
        return nowMs >= from && nowMs < to
    }

    /**
     * When closing the table, should it become "reserved" instead of "free"?
     * True if reservation window is still valid (now < reservationTo and we're in or after reservation start - optional:
     * actually "still valid" means the slot hasn't ended yet, so now < reservationTo is enough; we don't require now >= from
     * because the guest might leave early and we still want to show reserved until the slot ends).
     */
    fun shouldReturnToReservedAfterClose(table: TableEntity, nowMs: Long): Boolean {
        table.reservationFrom ?: return false
        val to = table.reservationTo ?: return false
        return nowMs < to
    }

    /** Unique key for spam prevention: same reservation = same notification once. */
    fun reservationKey(table: TableEntity): String? {
        val from = table.reservationFrom ?: return null
        return "${table.id}_$from"
    }
}
