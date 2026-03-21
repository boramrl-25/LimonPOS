package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

/** PUT /api/tables/:id — Retrofit Map<String, Any?> wildcard hatasını önlemek için somut gövde. */
data class TablePatchRequest(
    @SerializedName("status") val status: String? = null,
    @SerializedName("current_order_id") val current_order_id: String? = null,
    @SerializedName("waiter_id") val waiter_id: String? = null,
    @SerializedName("waiter_name") val waiter_name: String? = null,
    @SerializedName("guest_count") val guest_count: Int? = null,
    @SerializedName("opened_at") val opened_at: String? = null
)
