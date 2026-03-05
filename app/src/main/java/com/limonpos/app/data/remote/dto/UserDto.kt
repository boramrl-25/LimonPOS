package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class UserDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("pin") val pin: String,
    @SerializedName("role") val role: String,
    @SerializedName("active") val active: Any? = true, // Boolean or 0/1 from API
    @SerializedName("permissions") val permissions: List<String>? = null,
    @SerializedName("cash_drawer_permission") val cashDrawerPermission: Boolean? = false
)
