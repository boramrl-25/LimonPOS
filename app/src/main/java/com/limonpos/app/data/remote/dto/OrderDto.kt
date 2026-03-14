package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class OrderDto(
    @SerializedName("id") val id: String,
    @SerializedName("table_id") val tableId: String,
    @SerializedName("table_number") val tableNumber: String,
    @SerializedName("waiter_id") val waiterId: String,
    @SerializedName("waiter_name") val waiterName: String,
    @SerializedName("status") val status: String,
    @SerializedName("subtotal") val subtotal: Double = 0.0,
    @SerializedName("tax_amount") val taxAmount: Double = 0.0,
    @SerializedName("discount_percent") val discountPercent: Double = 0.0,
    @SerializedName("discount_amount") val discountAmount: Double = 0.0,
    @SerializedName("total") val total: Double = 0.0,
    @SerializedName("created_at") val createdAt: Long,
    @SerializedName("paid_at") val paidAt: Long? = null,
    @SerializedName("items") val items: List<OrderItemDto>? = null
)

data class OrderItemDto(
    @SerializedName("id") val id: String,
    @SerializedName("order_id") val orderId: String,
    @SerializedName("product_id") val productId: String,
    @SerializedName("product_name") val productName: String,
    @SerializedName("quantity") val quantity: Int,
    @SerializedName("price") val price: Double,
    @SerializedName("notes") val notes: String = "",
    @SerializedName("status") val status: String = "pending",
    @SerializedName("sent_at") val sentAt: Long? = null,
    @SerializedName("delivered_at") val deliveredAt: Long? = null,
    @SerializedName("client_line_id") val clientLineId: String? = null
)

data class CreateOrderRequest(
    @SerializedName("id") val id: String? = null,
    @SerializedName("table_id") val tableId: String,
    @SerializedName("guest_count") val guestCount: Int
)

data class AddOrderItemRequest(
    @SerializedName("product_id") val productId: String,
    @SerializedName("product_name") val productName: String,
    @SerializedName("quantity") val quantity: Int,
    @SerializedName("price") val price: Double,
    @SerializedName("notes") val notes: String = "",
    @SerializedName("client_line_id") val clientLineId: String? = null
)

/** API kitchen/orders response - KDS format */
data class KitchenOrderDto(
    @SerializedName("id") val id: String,
    @SerializedName("tableNumber") val tableNumber: String,
    @SerializedName("waiterName") val waiterName: String,
    @SerializedName("status") val status: String,
    @SerializedName("createdAt") val createdAt: Long,
    @SerializedName("items") val items: List<KitchenOrderItemDto>
)

data class KitchenOrderItemDto(
    @SerializedName("id") val id: String,
    @SerializedName("productName") val productName: String,
    @SerializedName("quantity") val quantity: Int,
    @SerializedName("notes") val notes: String,
    @SerializedName("status") val status: String,
    @SerializedName("sentAt") val sentAt: Long?
)

/** Dashboard open-orders response: order_id list for KDS sync */
data class OpenOrderSummaryDto(
    @SerializedName("order_id") val orderId: String
)

/** KDS: push item status (preparing / ready) to backend for sync */
data class OrderItemStatusRequest(
    @SerializedName("status") val status: String
)
