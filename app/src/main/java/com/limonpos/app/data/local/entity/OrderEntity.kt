package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "orders",
    indices = [
        Index(value = ["tableId", "status"]),
        Index(value = ["status", "paidAt"])
    ]
)
data class OrderEntity(
    @PrimaryKey
    val id: String,
    val tableId: String,
    val tableNumber: String,
    val waiterId: String,
    val waiterName: String,
    val status: String, // open, sent, paid, closed
    val subtotal: Double = 0.0,
    val taxAmount: Double = 0.0,
    val discountPercent: Double = 0.0,
    val discountAmount: Double = 0.0,
    val total: Double = 0.0,
    val createdAt: Long,
    val paidAt: Long? = null,
    val syncStatus: String = "SYNCED"
)
