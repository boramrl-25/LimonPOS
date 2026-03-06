package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "products",
    indices = [Index(value = ["categoryId", "active"]), Index(value = ["showInTill"])]
)
data class ProductEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val nameArabic: String = "",
    val nameTurkish: String = "",
    val categoryId: String,
    val price: Double,
    val taxRate: Double = 0.05,
    val printers: String = "[]", // JSON array of printer IDs
    val modifierGroups: String = "[]", // JSON array of modifier group IDs
    val active: Boolean = true,
    val showInTill: Boolean = true, // pos_enabled from web - show in till/POS
    val syncStatus: String = "SYNCED",
    /** Masaya gitmeyen ürün uyarı süresi (dakika). null = kategori/global ayarı kullan. */
    @androidx.room.ColumnInfo(name = "overdueUndeliveredMinutes")
    val overdueUndeliveredMinutes: Int? = null
)
