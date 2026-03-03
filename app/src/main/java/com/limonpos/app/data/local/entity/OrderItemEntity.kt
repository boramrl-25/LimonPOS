package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "order_items",
    indices = [Index(value = ["orderId"])]
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
    val apiId: String? = null,
    val syncStatus: String = "SYNCED"
)
