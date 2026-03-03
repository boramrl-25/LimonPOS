package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val pin: String,
    val role: String, // admin, manager, waiter, cashier
    val active: Boolean = true,
    val permissions: String = "[]", // JSON array
    val cashDrawerPermission: Boolean = false,
    val syncStatus: String = "SYNCED" // SYNCED, PENDING
)
