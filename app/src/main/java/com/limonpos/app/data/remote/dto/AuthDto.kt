package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    @SerializedName("pin") val pin: String
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
