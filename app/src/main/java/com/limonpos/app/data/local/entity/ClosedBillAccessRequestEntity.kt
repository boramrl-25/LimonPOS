package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "closed_bill_access_requests")
data class ClosedBillAccessRequestEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val requestedByUserId: String,
    val requestedByUserName: String,
    val requestedAt: Long = System.currentTimeMillis(),
    val status: String = "pending", // pending | approved | rejected
    val approvedByUserId: String? = null,
    val approvedByUserName: String? = null,
    val approvedAt: Long? = null,
    val expiresAt: Long? = null
)
