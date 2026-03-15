package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    @SerializedName("pin") val pin: String,
    @SerializedName("device_id") val deviceId: String? = null
)

data class LoginResponse(
    @SerializedName("user") val user: UserDto?,
    @SerializedName("token") val token: String?
)

data class CashDrawerVerifyRequest(
    @SerializedName("pin") val pin: String
)

data class CashDrawerVerifyResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String?
)

data class HeartbeatRequest(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("device_name") val deviceName: String? = null,
    @SerializedName("app_version") val appVersion: String? = null,
    @SerializedName("fcm_token") val fcmToken: String? = null
)

data class HeartbeatResponse(
    @SerializedName("ok") val ok: Boolean = true,
    @SerializedName("clear_local_data_requested") val clearLocalDataRequested: Boolean = false
)

data class AckClearRequest(
    @SerializedName("device_id") val deviceId: String
)
