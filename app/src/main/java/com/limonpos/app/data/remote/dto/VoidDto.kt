package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class CreateVoidRequest(
    @SerializedName("type") val type: String, // pre_void | post_void | table_transfer_void
    @SerializedName("order_id") val orderId: String? = null,
    @SerializedName("order_item_id") val orderItemId: String? = null,
    @SerializedName("product_name") val productName: String = "",
    @SerializedName("quantity") val quantity: Int = 0,
    @SerializedName("price") val price: Double = 0.0,
    @SerializedName("amount") val amount: Double = 0.0,
    @SerializedName("source_table_id") val sourceTableId: String? = null,
    @SerializedName("source_table_number") val sourceTableNumber: String? = null,
    @SerializedName("target_table_id") val targetTableId: String? = null,
    @SerializedName("target_table_number") val targetTableNumber: String? = null,
    @SerializedName("user_id") val userId: String,
    @SerializedName("user_name") val userName: String,
    @SerializedName("details") val details: String = ""
)
