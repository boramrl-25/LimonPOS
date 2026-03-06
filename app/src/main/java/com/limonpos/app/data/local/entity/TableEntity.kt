package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "tables",
    indices = [Index(value = ["floor", "status"])]
)
data class TableEntity(
    @PrimaryKey
    val id: String,
    val number: String,
    val name: String,
    val capacity: Int,
    val floor: String, // Main, Terrace, VIP
    val status: String, // free, occupied, reserved, bill
    val currentOrderId: String? = null,
    val guestCount: Int = 0,
    val waiterId: String? = null,
    val waiterName: String? = null,
    val openedAt: Long? = null,
    val syncStatus: String = "SYNCED",
    val x: Double = 0.0,
    val y: Double = 0.0,
    val width: Double = 120.0,
    val height: Double = 100.0,
    val shape: String = "square",
    val reservationGuestName: String? = null,
    val reservationFrom: Long? = null,
    val reservationTo: Long? = null
)
