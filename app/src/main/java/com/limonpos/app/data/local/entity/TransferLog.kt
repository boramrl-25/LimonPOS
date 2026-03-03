package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "transfer_logs")
data class TransferLog(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val type: String, // table_transfer | waiter_transfer
    val sourceTableId: String? = null,
    val sourceTableNumber: String? = null,
    val targetTableId: String? = null,
    val targetTableNumber: String? = null,
    val orderId: String? = null,
    val oldWaiterId: String? = null,
    val oldWaiterName: String? = null,
    val newWaiterId: String? = null,
    val newWaiterName: String? = null,
    val transferredById: String,
    val transferredByName: String,
    val createdAt: Long = System.currentTimeMillis()
)

