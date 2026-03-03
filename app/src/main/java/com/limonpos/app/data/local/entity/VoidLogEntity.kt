package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "void_logs")
data class VoidLogEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val type: String, // pre_void | post_void | table_transfer_void
    val orderId: String? = null,
    val orderItemId: String? = null,
    val productName: String = "",
    val quantity: Int = 0,
    val price: Double = 0.0,
    val amount: Double = 0.0,
    val sourceTableId: String? = null,
    val sourceTableNumber: String? = null,
    val targetTableId: String? = null,
    val targetTableNumber: String? = null,
    val userId: String,
    val userName: String,
    val details: String = "",
    val syncStatus: String = "PENDING",
    val createdAt: Long = System.currentTimeMillis()
)
