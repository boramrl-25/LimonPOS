package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "payments")
data class PaymentEntity(
    @PrimaryKey
    val id: String,
    val orderId: String,
    val amount: Double,
    val method: String, // cash, card
    val receivedAmount: Double = 0.0,
    val changeAmount: Double = 0.0,
    val userId: String,
    val createdAt: Long,
    val syncStatus: String = "SYNCED"
)
