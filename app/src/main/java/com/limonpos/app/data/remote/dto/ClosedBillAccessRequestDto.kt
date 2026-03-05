package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class ClosedBillAccessRequestDto(
    @SerializedName("id") val id: String,
    @SerializedName("requested_by_user_id") val requestedByUserId: String,
    @SerializedName("requested_by_user_name") val requestedByUserName: String,
    @SerializedName("requested_at") val requestedAt: Long,
    @SerializedName("status") val status: String,
    @SerializedName("approved_by_user_id") val approvedByUserId: String? = null,
    @SerializedName("approved_by_user_name") val approvedByUserName: String? = null,
    @SerializedName("approved_at") val approvedAt: Long? = null,
    @SerializedName("expires_at") val expiresAt: Long? = null
)

data class CreateClosedBillAccessRequestDto(
    @SerializedName("id") val id: String,
    @SerializedName("requested_by_user_id") val requestedByUserId: String,
    @SerializedName("requested_by_user_name") val requestedByUserName: String,
    @SerializedName("expires_at") val expiresAt: Long? = null
)
