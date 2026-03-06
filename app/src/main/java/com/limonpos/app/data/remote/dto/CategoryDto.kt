package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class CategoryDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("color") val color: String,
    @SerializedName("sort_order") val sortOrder: Int = 0,
    @SerializedName("active") val active: Any? = true,  // API may send 0/1 or boolean
    @SerializedName("show_till") val showTill: Int? = 0,
    @SerializedName("printers") val printers: List<String>? = null,
    @SerializedName("overdue_undelivered_minutes") val overdueUndeliveredMinutes: Int? = null
)
