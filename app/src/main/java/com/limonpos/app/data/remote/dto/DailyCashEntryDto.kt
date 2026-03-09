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
