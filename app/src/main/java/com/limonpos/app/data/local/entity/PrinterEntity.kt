package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "printers")
data class PrinterEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val printerType: String,
    val ipAddress: String = "",
    val port: Int = 9100,
    val connectionType: String = "network",
    val status: String = "offline",
    val isDefault: Boolean = false,
    val kdsEnabled: Boolean = true,
    /** User-controlled ON/OFF. When false, printer is excluded from all print jobs. */
    val enabled: Boolean = true,
    val syncStatus: String = "SYNCED"
)
