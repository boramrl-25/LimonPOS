package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val color: String,
    val sortOrder: Int = 0,
    val active: Boolean = true,
    val syncStatus: String = "SYNCED",
    val printers: String = "[]" // JSON array of printer IDs
)
