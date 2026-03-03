package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "void_requests")
data class VoidRequestEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val orderId: String,
    val orderItemId: String,
    val productName: String,
    val quantity: Int,
    val price: Double,
    val tableNumber: String,
    val requestedByUserId: String,
    val requestedByUserName: String,
    val requestedAt: Long = System.currentTimeMillis(),
    val status: String = "pending", // pending | approved | rejected
    val approvedBySupervisorUserId: String? = null,
    val approvedBySupervisorUserName: String? = null,
    val approvedBySupervisorAt: Long? = null,
    val approvedByKdsUserId: String? = null,
    val approvedByKdsUserName: String? = null,
    val approvedByKdsAt: Long? = null
)
