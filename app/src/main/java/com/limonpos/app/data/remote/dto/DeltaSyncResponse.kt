package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

/** Delta Sync: son 'since' ms'den sonra güncellenen varlıklar. Android sadece değişenleri merge eder. */
data class DeltaSyncResponse(
    @SerializedName("delta") val delta: Boolean = false,
    @SerializedName("since") val since: Long = 0,
    @SerializedName("categories") val categories: List<CategoryDto> = emptyList(),
    @SerializedName("products") val products: List<ProductDto> = emptyList(),
    @SerializedName("tables") val tables: List<TableDto> = emptyList(),
    @SerializedName("modifier_groups") val modifierGroups: List<ModifierGroupDto> = emptyList(),
    @SerializedName("printers") val printers: List<PrinterDto> = emptyList(),
    @SerializedName("users") val users: List<UserDto> = emptyList(),
)
