package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class TableReserveRequest(
    @SerializedName("guest_name") val guest_name: String,
    @SerializedName("guest_phone") val guest_phone: String,
    @SerializedName("from_time") val from_time: Long,
    @SerializedName("to_time") val to_time: Long
)
