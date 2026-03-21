package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class OrderTablePatchRequest(
    @SerializedName("table_id") val table_id: String,
    @SerializedName("table_number") val table_number: String
)
