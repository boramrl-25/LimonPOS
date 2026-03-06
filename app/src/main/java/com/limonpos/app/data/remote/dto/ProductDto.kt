package com.limonpos.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class ProductDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("name_arabic") val nameArabic: String? = null,
    @SerializedName("name_turkish") val nameTurkish: String? = null,
    @SerializedName("category_id") val categoryId: String? = null,
    @SerializedName("category") val categoryName: String? = null,
    @SerializedName("price") val price: Any? = null,
    @SerializedName("tax_rate") val taxRate: Any? = null,
    @SerializedName("printers") val printers: List<String>? = null,
    @SerializedName("modifier_groups") val modifierGroups: List<Any>? = null,
    @SerializedName("active") val active: Any? = true,  // API may send 0/1 or boolean
    @SerializedName("pos_enabled") val posEnabled: Any? = null,  // API returns 0/1 or boolean; null = don't assume
    @SerializedName("overdue_undelivered_minutes") val overdueUndeliveredMinutes: Int? = null
)
