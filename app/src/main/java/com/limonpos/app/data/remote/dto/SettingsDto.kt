package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class SettingsDto(
    @SerializedName("timezone_offset_minutes") val timezoneOffsetMinutes: Int = 0
)
