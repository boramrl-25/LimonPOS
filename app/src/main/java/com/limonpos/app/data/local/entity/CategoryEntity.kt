package com.limonpos.app.data.local.entity

import androidx.room.ColumnInfo
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
    /** Whether this category should be shown on the Till (order) screen. Stored as INTEGER 0/1. */
    @ColumnInfo(name = "showTill")
    val showTill: Boolean = true,
    val syncStatus: String = "SYNCED",
    val printers: String = "[]", // JSON array of printer IDs
    /** Masaya gitmeyen ürün uyarı süresi (dakika). null = global ayarı kullan. */
    @ColumnInfo(name = "overdueUndeliveredMinutes")
    val overdueUndeliveredMinutes: Int? = null
)
