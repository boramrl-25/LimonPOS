package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class SyncErrorReport(
    @SerializedName("source") val source: String,
    @SerializedName("entity_type") val entity_type: String,
    @SerializedName("entity_id") val entity_id: String,
    @SerializedName("message") val message: String
)
