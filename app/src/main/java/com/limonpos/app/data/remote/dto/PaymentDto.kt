package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class PaymentDto(
    @SerializedName("id") val id: String,
    @SerializedName("order_id") val orderId: String,
    @SerializedName("amount") val amount: Double,
    @SerializedName("method") val method: String,
    @SerializedName("received_amount") val receivedAmount: Double = 0.0,
    @SerializedName("change_amount") val changeAmount: Double = 0.0,
    @SerializedName("user_id") val userId: String,
    @SerializedName("created_at") val createdAt: Long
)

data class PaymentItemRequest(
    @SerializedName("amount") val amount: Double,
    @SerializedName("method") val method: String,
    @SerializedName("received_amount") val receivedAmount: Double = 0.0,
    @SerializedName("change_amount") val changeAmount: Double = 0.0
)

data class CreatePaymentRequest(
    @SerializedName("order_id") val orderId: String,
    @SerializedName("payments") val payments: List<PaymentItemRequest>
)
