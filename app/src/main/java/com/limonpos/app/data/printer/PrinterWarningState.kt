package com.limonpos.app.data.printer

data class PrinterWarningState(
    val message: String,
    val orderId: String,
    val tableId: String,
    val pendingItemIds: List<String>
)
