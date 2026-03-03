package com.limonpos.app.data.printer

sealed class KitchenPrintResult {
    data object Success : KitchenPrintResult()
    data class Failure(
        val message: String,
        val orderId: String,
        val tableId: String,
        val tableNumber: String,
        val pendingItemIds: List<String>
    ) : KitchenPrintResult()
}
