package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Tombstone for items deleted locally but not yet deleted on API (offline). Prevents resurrection on sync. */
@Entity(tableName = "pending_order_item_deletes")
data class PendingOrderItemDeleteEntity(
    @PrimaryKey val id: String,
    val orderId: String,
    val apiItemId: String,
    val createdAt: Long = System.currentTimeMillis()
)
