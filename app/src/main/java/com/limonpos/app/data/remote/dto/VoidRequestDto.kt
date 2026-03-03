package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class VoidRequestDto(
    @SerializedName("id") val id: String,
    @SerializedName("order_id") val orderId: String,
    @SerializedName("order_item_id") val orderItemId: String,
    @SerializedName("product_name") val productName: String,
    @SerializedName("quantity") val quantity: Int,
    @SerializedName("price") val price: Double,
    @SerializedName("table_number") val tableNumber: String,
    @SerializedName("requested_by_user_id") val requestedByUserId: String,
    @SerializedName("requested_by_user_name") val requestedByUserName: String,
    @SerializedName("requested_at") val requestedAt: Long,
    @SerializedName("status") val status: String,
    @SerializedName("approved_by_supervisor_user_id") val approvedBySupervisorUserId: String? = null,
    @SerializedName("approved_by_supervisor_user_name") val approvedBySupervisorUserName: String? = null,
    @SerializedName("approved_by_supervisor_at") val approvedBySupervisorAt: Long? = null,
    @SerializedName("approved_by_kds_user_id") val approvedByKdsUserId: String? = null,
    @SerializedName("approved_by_kds_user_name") val approvedByKdsUserName: String? = null,
    @SerializedName("approved_by_kds_at") val approvedByKdsAt: Long? = null
)

data class CreateVoidRequestDto(
    @SerializedName("id") val id: String,
    @SerializedName("order_id") val orderId: String,
    @SerializedName("order_item_id") val orderItemId: String,
    @SerializedName("product_name") val productName: String,
    @SerializedName("quantity") val quantity: Int,
    @SerializedName("price") val price: Double,
    @SerializedName("table_number") val tableNumber: String,
    @SerializedName("requested_by_user_id") val requestedByUserId: String,
    @SerializedName("requested_by_user_name") val requestedByUserName: String
)
