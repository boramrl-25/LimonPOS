package com.limonpos.app.data.local.entity

/** Result row for category sales aggregation (paid orders since given time). */
data class CategorySaleRow(
    val categoryId: String,
    val categoryName: String?,
    val totalAmount: Double,
    val totalQuantity: Long
)

/** Result row for item sales aggregation (paid orders since given time). */
data class ItemSaleRow(
    val productId: String,
    val productName: String,
    val categoryId: String,
    val totalQuantity: Long,
    val totalAmount: Double
)
