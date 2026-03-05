package com.limonpos.app.data.printer

/**
 * State for receipt (fis) print failure. Used to show Retry/Dismiss dialog.
 * Her uyarıda benzersiz id kullanılır; böylece ikinci/üçüncü fiş hatasında da diyalog kesin gösterilir.
 */
data class ReceiptPrintWarningState(
    val id: Long = System.currentTimeMillis(),
    val message: String,
    val orderId: String,
    val tableId: String,
    val isPartial: Boolean = false,
    val paymentAmount: Double = 0.0,
    val paymentMethod: String = "",
    val totalPaidSoFar: Double = 0.0,
    val balanceRemaining: Double = 0.0
)
