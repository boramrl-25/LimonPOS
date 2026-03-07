package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "order_items",
    indices = [Index(value = ["orderId"]), Index(value = ["orderId", "clientLineId"])]
)
data class OrderItemEntity(
    @PrimaryKey
    val id: String,
    val orderId: String,
    val productId: String,
    val productName: String,
    val quantity: Int,
    val price: Double,
    val notes: String = "",
    val status: String = "pending",
    val sentAt: Long? = null,
    val deliveredAt: Long? = null,
    /** Client-generated UUID for line identity. Used for sync reconciliation instead of fuzzy key. */
    val clientLineId: String? = null,
    /** Backend-assigned line id (apiLineId). Stored in apiId field. */
    val apiId: String? = null,
    val syncStatus: String = "SYNCED"
)
