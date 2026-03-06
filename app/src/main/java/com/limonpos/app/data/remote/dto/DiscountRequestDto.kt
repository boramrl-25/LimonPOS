package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DiscountRequestRequest(
    @SerializedName("requested_percent") val requestedPercent: Double? = null,
    @SerializedName("requested_amount") val requestedAmount: Double? = null,
    @SerializedName("note") val note: String = ""
)

data class DiscountRequestResponse(
    @SerializedName("id") val id: String,
    @SerializedName("order_id") val orderId: String,
    @SerializedName("status") val status: String,
    @SerializedName("requested_percent") val requestedPercent: Double? = null,
    @SerializedName("requested_amount") val requestedAmount: Double? = null,
    @SerializedName("note") val note: String? = null
)

data class DiscountRequestWrapper(
    @SerializedName("request") val request: DiscountRequestResponse?
)
