package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class SettingsDto(
    @SerializedName("timezone_offset_minutes") val timezoneOffsetMinutes: Int = 0,
    @SerializedName("currency_code") val currencyCode: String? = null,
    @SerializedName("overdue_undelivered_minutes") val overdueUndeliveredMinutes: Int? = null,
    @SerializedName("company_name") val companyName: String? = null,
    @SerializedName("company_address") val companyAddress: String? = null,
    @SerializedName("receipt_header") val receiptHeader: String? = null,
    @SerializedName("receipt_footer_message") val receiptFooterMessage: String? = null,
    @SerializedName("kitchen_header") val kitchenHeader: String? = null,
    @SerializedName("receipt_item_size") val receiptItemSize: Int? = null
)
