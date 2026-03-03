package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "sync_queue",
    indices = [Index(value = ["status", "createdAt"])]
)
data class SyncQueueEntity(
    @PrimaryKey
    val id: String,
    val tableName: String,
    val recordId: String,
    val action: String, // create, update, delete
    val data: String, // JSON
    val createdAt: Long,
    val syncedAt: Long? = null,
    val status: String = "PENDING" // PENDING, SYNCED, FAILED
)
