package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DailyCashEntryRequest(
    @SerializedName("physical_cash") val physicalCash: Double,
    @SerializedName("date") val date: String?
)

data class DailyCashEntryResponse(
    @SerializedName("date") val date: String?,
    @SerializedName("systemCash") val systemCash: Double?,
    @SerializedName("dailyCashEntry") val dailyCashEntry: DailyCashEntryDto?
)

data class DailyCashEntryDto(
    @SerializedName("id") val id: String?,
    @SerializedName("date") val date: String?,
    @SerializedName("system_cash") val systemCash: Double?,
    @SerializedName("physical_cash") val physicalCash: Double?,
    @SerializedName("difference") val difference: Double?,
    @SerializedName("user_name") val userName: String?,
    @SerializedName("created_at") val createdAt: Long?
)

data class DailyTransactionRequest(
    @SerializedName("type") val type: String,
    @SerializedName("physical_cash") val physicalCash: Double? = null,
    @SerializedName("card_reference") val cardReference: String? = null,
    @SerializedName("amount") val amount: Double? = null,
    @SerializedName("date") val date: String? = null
)

data class DailyTransactionResponse(
    @SerializedName("date") val date: String?,
    @SerializedName("systemCash") val systemCash: Double?,
    @SerializedName("systemCard") val systemCard: Double?,
    @SerializedName("cashEntries") val cashEntries: List<DailyTransactionEntryDto>?,
    @SerializedName("cardEntries") val cardEntries: List<DailyTransactionEntryDto>?
)

data class DailyTransactionEntryDto(
    @SerializedName("id") val id: String?,
    @SerializedName("date") val date: String?,
    @SerializedName("type") val type: String?,
    @SerializedName("physical_cash") val physicalCash: Double?,
    @SerializedName("card_reference") val cardReference: String?,
    @SerializedName("amount") val amount: Double?,
    @SerializedName("user_name") val userName: String?,
    @SerializedName("created_at") val createdAt: Long?
)
