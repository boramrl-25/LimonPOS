package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class PrinterDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("printer_type") val printerType: String,
    @SerializedName("ip_address") val ipAddress: String = "",
    @SerializedName("port") val port: Int = 9100,
    @SerializedName("connection_type") val connectionType: String = "network",
    @SerializedName("status") val status: String = "offline",
    @SerializedName("is_backup") val isBackup: Boolean = false,
    @SerializedName("kds_enabled") val kdsEnabled: Int = 1
)
