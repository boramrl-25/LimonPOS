package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class TableReservationDto(
    @SerializedName("id") val id: String? = null,
    @SerializedName("guest_name") val guestName: String? = null,
    @SerializedName("guest_phone") val guestPhone: String? = null,
    @SerializedName("from_time") val fromTime: Long? = null,
    @SerializedName("to_time") val toTime: Long? = null
)

data class TableDto(
    @SerializedName("id") val id: String,
    @SerializedName("number") val number: Int,
    @SerializedName("name") val name: String,
    @SerializedName("capacity") val capacity: Int,
    @SerializedName("floor") val floor: String,
    @SerializedName("status") val status: String,
    @SerializedName("current_order_id") val currentOrderId: String? = null,
    @SerializedName("guest_count") val guestCount: Int = 0,
    @SerializedName("waiter_id") val waiterId: String? = null,
    @SerializedName("waiter_name") val waiterName: String? = null,
    @SerializedName("opened_at") val openedAt: String? = null,
    @SerializedName("x") val x: Double = 0.0,
    @SerializedName("y") val y: Double = 0.0,
    @SerializedName("width") val width: Double = 120.0,
    @SerializedName("height") val height: Double = 100.0,
    @SerializedName("shape") val shape: String = "square",
    @SerializedName("reservation") val reservation: TableReservationDto? = null
)
