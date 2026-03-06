package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class ModifierGroupDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("min_select") val minSelect: Int = 0,
    @SerializedName("max_select") val maxSelect: Int = 1,
    @SerializedName("required") val required: Any? = false,  // API returns 0/1 (number)
    @SerializedName("options") val options: List<ModifierOptionDto>? = null
)

data class ModifierOptionDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("price") val price: Double = 0.0
)
