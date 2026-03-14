package com.limonpos.app.ui.screens.payment

import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.OrderItemEntity
import com.limonpos.app.data.local.entity.PaymentEntity
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.prefs.PrinterPreferences
import com.limonpos.app.data.prefs.ReceiptPreferences
import com.limonpos.app.data.printer.ReceiptPrintWarningHolder
import com.limonpos.app.data.printer.ReceiptPrintWarningState
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.data.repository.OrderWithItems
import com.limonpos.app.data.repository.PaymentRepository
import com.limonpos.app.data.repository.TableRepository
import com.limonpos.app.data.zoho.ZohoBooksRepository
import com.limonpos.app.service.PrinterService
import com.limonpos.app.util.CurrencyUtils
import com.limonpos.app.util.MoneyUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

data class PaymentSplit(
    val id: String,
    val amount: Double,
    val method: String,
    val receivedAmount: Double = 0.0,
    val changeAmount: Double = 0.0
)

data class PaymentUiState(
    val orderWithItems: OrderWithItems? = null,
    /** Order total computed from items+tax-discount. Single source for split/cash/card. */
    val orderTotalComputed: Double = 0.0,
    val splits: List<PaymentSplit> = emptyList(),
    /** DB'den gelen kesinleşmiş ödemelerin toplamı. Sadece payment flow günceller. */
    val completedPaymentsTotal: Double = 0.0,
    val completedPayments: List<PaymentEntity> = emptyList(),
    val paymentMode: String = "cash", // cash | card | split
    val message: String? = null,
    val paymentComplete: Boolean = false,
    val redirectToOrder: Boolean = false,
    val isRecalledOrder: Boolean = false,
    /** True when last payment is done but final receipt failed; dismiss will set paymentComplete so user can leave. */
    val receiptFailedBeforeNavigate: Boolean = false,
    /** Discount: pending request for this order (web approval needed). */
    val discountRequestPending: Boolean = false,
    val discountRequestLoading: Boolean = false,
    val showDiscountRequestDialog: Boolean = false,
    /** After discount request sent successfully, navigate to floor plan. */
    val navigateToFloorPlanAfterDiscount: Boolean = false,
    /** Derived: TOTAL_PAID = completedPaymentsTotal + splits.sum. Computed on every state change. */
    val totalPaid: Double = 0.0,
    /** Derived: remainder = orderTotalComputed - totalPaid. Computed on every state change. */
    val remainder: Double = 0.0,
    /** Transaction Lock: true while paySplit or completePayment is running. Disables all payment buttons. */
    val paymentInProgress: Boolean = false
) {
    /** SSOT: totalPaid = completedPayments + activeSplits. Cash/Card: tek seçim, switch yapınca önceki silinir yenisi full amount. */
    fun withComputedTotals(): PaymentUiState {
        val orderTotal = MoneyUtils.round(orderTotalComputed)
        val completed = MoneyUtils.round(completedPaymentsTotal)
        val splitsSum = MoneyUtils.sum(splits.map { it.amount })
        val total = MoneyUtils.add(completed, splitsSum)
        val rem = MoneyUtils.subtract(orderTotal, total)
        return copy(totalPaid = total, remainder = rem)
    }
}

@HiltViewModel
class PaymentViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val apiSyncRepository: ApiSyncRepository,
    private val orderRepository: OrderRepository,
    private val paymentRepository: PaymentRepository,
    private val tableRepository: TableRepository,
    private val authRepository: AuthRepository,
    private val printerRepository: PrinterRepository,
    private val printerService: PrinterService,
    private val printerPreferences: PrinterPreferences,
    private val receiptPreferences: ReceiptPreferences,
    private val zohoBooksRepository: ZohoBooksRepository,
    private val receiptPrintWarningHolder: ReceiptPrintWarningHolder
) : ViewModel() {

    private val tableId: String = checkNotNull(savedStateHandle["tableId"]) { "tableId required" }

    private val _uiState = MutableStateFlow(PaymentUiState())
    /** UI reads totalPaid/remainder from here; computed on every state change (SSOT). */
    val uiState: StateFlow<PaymentUiState> = _uiState
        .map { it.withComputedTotals() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, PaymentUiState().withComputedTotals())

    val receiptPrintWarningState: StateFlow<ReceiptPrintWarningState?> = receiptPrintWarningHolder.state

    init {
        loadOrder()
        syncToBackend()
    }

    private fun syncToBackend() {
        viewModelScope.launch {
            if (apiSyncRepository.isOnline()) {
                apiSyncRepository.syncFromApi()
            }
        }
    }

    private fun loadOrder() {
        viewModelScope.launch {
            val order = orderRepository.getActiveOrderByTable(tableId)
            if (order != null) {
                if (order.status != "sent") {
                    _uiState.update { it.copy(redirectToOrder = true) }
                    return@launch
                }
                orderRepository.refreshOrderTotals(order.id)
                val isRecalled = orderRepository.isOrderRecalled(order.id)
                orderRepository.getOrderWithItems(order.id).first()?.let { ow ->
                    val subtotal = MoneyUtils.sum(ow.items.map { it.price * it.quantity })
                    val disc = ow.order.discountPercent / 100.0 * subtotal + ow.order.discountAmount
                    val orderTotalComputed = MoneyUtils.round((subtotal + ow.order.taxAmount - disc).coerceAtLeast(0.0))
                    _uiState.update { it.copy(orderWithItems = ow, orderTotalComputed = orderTotalComputed, isRecalledOrder = isRecalled, splits = emptyList()) }
                    paymentRepository.getPaymentsByOrder(ow.order.id).collect { payments ->
                        val total = MoneyUtils.sum(payments.map { it.amount })
                        if (MoneyUtils.greaterThan(total, orderTotalComputed)) {
                            paymentRepository.fixOverpayment(ow.order.id, orderTotalComputed)
                            return@collect
                        }
                        _uiState.update { it.copy(completedPaymentsTotal = total, completedPayments = payments) }
                    }
                    loadDiscountRequestStatus(ow.order.id)
                }
            }
        }
    }

    private fun loadDiscountRequestStatus(orderId: String) {
        viewModelScope.launch {
            if (!apiSyncRepository.isOnline()) return@launch
            val pending = apiSyncRepository.getDiscountRequestForOrder(orderId)
            _uiState.update { it.copy(discountRequestPending = pending != null && pending.status == "pending") }
        }
    }

    fun showDiscountRequestDialog() {
        _uiState.update { it.copy(showDiscountRequestDialog = true) }
    }

    fun dismissDiscountRequestDialog() {
        _uiState.update { it.copy(showDiscountRequestDialog = false) }
    }

    fun requestDiscount(requestedPercent: Double?, requestedAmount: Double?, note: String) {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            if (requestedPercent == null && requestedAmount == null) return@launch
            _uiState.update { it.copy(discountRequestLoading = true, showDiscountRequestDialog = false) }
            val ok = withContext(Dispatchers.IO) {
                apiSyncRepository.syncFromApi()
                apiSyncRepository.createDiscountRequest(ow.order.id, requestedPercent, requestedAmount, note)
            }
            _uiState.update { it.copy(discountRequestLoading = false) }
            if (ok) {
                _uiState.update { it.copy(discountRequestPending = true, message = "Discount request sent. Sync to get updated total after web approval.", navigateToFloorPlanAfterDiscount = true) }
            } else {
                _uiState.update { it.copy(message = "Failed to send discount request. Check connection or Sync and try again.") }
            }
        }
    }

    fun refreshOrderFromApi() {
        viewModelScope.launch {
            if (_uiState.value.orderWithItems == null) return@launch
            _uiState.update { it.copy(discountRequestLoading = true) }
            val ok = withContext(Dispatchers.IO) { apiSyncRepository.syncFromApi() }
            _uiState.update { it.copy(discountRequestLoading = false) }
            if (ok) {
                loadOrder()
                _uiState.update { it.copy(message = "Order updated.") }
            }
        }
    }

    fun clearPreviousPaymentsForRecalled() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            if (!_uiState.value.isRecalledOrder) return@launch
            paymentRepository.deleteAllPaymentsForOrder(ow.order.id)
            _uiState.update { it.copy(splits = emptyList(), completedPaymentsTotal = 0.0, completedPayments = emptyList(), message = "Previous payments cleared. Enter new payment.") }
        }
    }

    /** Reset on Select: Cash/Card seçildiğinde splits temizlenir, tek satır kalan bakiye ile eklenir. */
    fun selectPaymentMode(mode: String) {
        if (_uiState.value.orderWithItems == null || _uiState.value.paymentInProgress) return
        val orderTotal = MoneyUtils.round(_uiState.value.orderTotalComputed)
        val completed = MoneyUtils.round(_uiState.value.completedPaymentsTotal)
        val remainingBalance = MoneyUtils.subtract(orderTotal, completed).coerceAtLeast(0.0)
        _uiState.update {
            when (mode) {
                "cash", "card" -> it.copy(
                    paymentMode = mode,
                    splits = listOf(
                        PaymentSplit(
                            id = "split_${System.currentTimeMillis()}",
                            amount = MoneyUtils.round(remainingBalance),
                            method = mode,
                            receivedAmount = if (mode == "cash") MoneyUtils.round(remainingBalance) else 0.0
                        )
                    )
                )
                "split" -> it.copy(paymentMode = "split", splits = listOf(
                    PaymentSplit(id = "split_${System.currentTimeMillis()}", amount = 0.0, method = "")
                ))
                else -> it
            }
        }
    }

    /** Ensures one current split row when in split mode (e.g. initial load or after pay). */
    fun ensureOneSplitRow() {
        _uiState.update {
            if (it.paymentMode == "split" && it.splits.isEmpty()) {
                it.copy(splits = listOf(PaymentSplit(id = "split_${System.currentTimeMillis()}", amount = 0.0, method = "")))
            } else it
        }
    }

    fun removeSplit(id: String) {
        _uiState.update {
            it.copy(splits = it.splits.filter { s -> s.id != id })
        }
    }

    /** Validation: if (new amount + current total) > order total, cap to remaining balance. */
    fun updateSplit(id: String, amount: Double, method: String, receivedAmount: Double = 0.0, changeAmount: Double = 0.0) {
        val orderTotal = MoneyUtils.round(_uiState.value.orderTotalComputed)
        val completed = MoneyUtils.round(_uiState.value.completedPaymentsTotal)
        val otherSplitsSum = MoneyUtils.sum(_uiState.value.splits.filter { it.id != id }.map { it.amount })
        val remainingBalance = MoneyUtils.subtract(orderTotal, MoneyUtils.add(completed, otherSplitsSum))
        val maxAllowed = remainingBalance.coerceAtLeast(0.0)
        val cappedAmount = MoneyUtils.coerceIn(amount, 0.0, maxAllowed)
        val cappedChange = MoneyUtils.round(changeAmount.coerceAtLeast(0.0))
        val cappedReceived = if (method == "cash") MoneyUtils.round(receivedAmount) else 0.0
        _uiState.update {
            it.copy(splits = it.splits.map { s ->
                if (s.id == id) s.copy(amount = cappedAmount, method = method, receivedAmount = cappedReceived, changeAmount = cappedChange)
                else s
            })
        }
    }

    fun paySplit(splitId: String) {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            if (_uiState.value.paymentInProgress) return@launch
            _uiState.update { it.copy(paymentInProgress = true) }
            val split = _uiState.value.splits.find { it.id == splitId }
            if (split == null || split.amount <= 0) {
                _uiState.update { it.copy(paymentInProgress = false, message = "Enter amount") }
                return@launch
            }
            if (split.method != "cash" && split.method != "card") {
                _uiState.update { it.copy(paymentInProgress = false, message = "Select Cash or Card") }
                return@launch
            }
            val userId = authRepository.getCurrentUserIdSync()
            if (userId == null) {
                _uiState.update { it.copy(paymentInProgress = false) }
                return@launch
            }
            val orderTotal = MoneyUtils.round(_uiState.value.orderTotalComputed)
            val dbTotal = MoneyUtils.round(paymentRepository.getPaymentsSumByOrder(ow.order.id))
            val amountToSend = MoneyUtils.round(split.amount)
            if (amountToSend <= 0) {
                Log.w("PaymentViewModel", "paySplit: amount<=0, aborting. split.amount=${split.amount}")
                _uiState.update { it.copy(paymentInProgress = false, message = "Invalid amount") }
                return@launch
            }
            if (MoneyUtils.greaterThan(MoneyUtils.add(dbTotal, amountToSend), orderTotal)) {
                Log.w("PaymentViewModel", "paySplit: would exceed order total. db=$dbTotal amount=$amountToSend orderTotal=$orderTotal")
                _uiState.update { it.copy(paymentInProgress = false, message = "Amount exceeds balance") }
                return@launch
            }
            try {
                paymentRepository.createPayment(
                    orderId = ow.order.id,
                    amount = amountToSend,
                    method = split.method,
                    receivedAmount = if (split.method == "cash") MoneyUtils.round(split.receivedAmount) else amountToSend,
                    changeAmount = if (split.method == "cash") MoneyUtils.round(split.changeAmount) else 0.0,
                    userId = userId
                )
                val freshTotal = MoneyUtils.round(paymentRepository.getPaymentsSumByOrder(ow.order.id))
                val freshPayments = paymentRepository.getPaymentsByOrderSync(ow.order.id)
                val newBalance = MoneyUtils.subtract(orderTotal, freshTotal)
                _uiState.update {
                    it.copy(
                        splits = listOf(PaymentSplit(id = "split_${System.currentTimeMillis()}", amount = 0.0, method = "")),
                        completedPaymentsTotal = freshTotal,
                        completedPayments = freshPayments,
                        paymentInProgress = false,
                        message = "Payment received"
                    )
                }
                if (kotlin.math.abs(newBalance) >= 0.01) {
                viewModelScope.launch(Dispatchers.IO) {
                    val cashierPrinters = printerRepository.getAllPrinters().first()
                        .filter { (it.printerType == "cashier" || it.printerType.equals("receipt", true)) && it.ipAddress.isNotBlank() && it.enabled }
                    val receiptFailedPrinters = mutableListOf<String>()
                    val drawerFailedPrinters = mutableListOf<String>()
                    for (printer in cashierPrinters) {
                        val receipt = printerService.buildPartialReceipt(
                            order = ow.order,
                            items = ow.items,
                            paymentAmount = amountToSend,
                            paymentMethod = split.method,
                            totalPaidSoFar = freshTotal,
                            balanceRemaining = newBalance
                        )
                        val printResult = printerService.sendToPrinter(printer.ipAddress, printer.port, receipt)
                        if (printResult.isFailure) receiptFailedPrinters.add(printer.name)
                        else if (split.method == "cash") {
                            val drawerResult = printerService.openCashDrawer(printer.ipAddress, printer.port)
                            if (drawerResult.isFailure) drawerFailedPrinters.add(printer.name)
                        }
                    }
                    val anyReceiptPrinted = receiptFailedPrinters.size < cashierPrinters.size
                    if (!anyReceiptPrinted) {
                        receiptPrintWarningHolder.setWarning(ReceiptPrintWarningState(
                            message = "Receipt print failed: ${receiptFailedPrinters.joinToString(", ")}",
                            orderId = ow.order.id,
                            tableId = tableId,
                            isPartial = true,
                            paymentAmount = amountToSend,
                            paymentMethod = split.method,
                            totalPaidSoFar = freshTotal,
                            balanceRemaining = newBalance
                        ))
                    } else if (drawerFailedPrinters.isNotEmpty()) {
                        _uiState.update { it.copy(message = "Receipt printed. Cash drawer did not open: ${drawerFailedPrinters.joinToString(", ")}") }
                    }
                }
                }

                if (kotlin.math.abs(newBalance) < 0.01) {
                    withContext(Dispatchers.IO) {
                        orderRepository.markOrderPaid(ow.order.id)
                        tableRepository.closeTable(tableId)
                    }
                    // Try final receipt print; only show failure if no printer printed
                    var cashierCount = 0
                    val failedReceiptPrinters = mutableListOf<String>()
                    withContext(Dispatchers.IO) {
                        val cashierPrinters = printerRepository.getAllPrinters().first()
                            .filter { (it.printerType == "cashier" || it.printerType.equals("receipt", true)) && it.ipAddress.isNotBlank() && it.enabled }
                        cashierCount = cashierPrinters.size
                        val itemSize = printerPreferences.getReceiptItemSize()
                        val receiptSettings = receiptPreferences.getReceiptSettings()
                        val finalReceipt = printerService.buildReceipt(ow.order, ow.items, itemSize, receiptSettings)
                        for (printer in cashierPrinters) {
                            val printResult = printerService.sendToPrinter(printer.ipAddress, printer.port, finalReceipt)
                            if (printResult.isFailure) failedReceiptPrinters.add(printer.name)
                        }
                    }
                    val anyReceiptPrinted = failedReceiptPrinters.size < cashierCount
                    if (!anyReceiptPrinted) {
                        receiptPrintWarningHolder.setWarning(ReceiptPrintWarningState(
                            message = "Receipt print failed: ${failedReceiptPrinters.joinToString(", ")}",
                            orderId = ow.order.id,
                            tableId = tableId,
                            isPartial = false
                        ))
                        _uiState.update { it.copy(receiptFailedBeforeNavigate = true) }
                    } else {
                        // Ödeme tamamlandı bilgisini fiş durumundan bağımsız hemen ver.
                        _uiState.update { it.copy(paymentComplete = true, message = "Payment completed") }
                        if (failedReceiptPrinters.isNotEmpty()) {
                            _uiState.update { it.copy(message = "Printed; failed on: ${failedReceiptPrinters.joinToString(", ")}") }
                        }
                    }

                    viewModelScope.launch(Dispatchers.IO) {
                        try {
                            if (apiSyncRepository.isOnline()) {
                                apiSyncRepository.pushCloseTable(tableId)
                                apiSyncRepository.pushTableStatesNow()
                            }
                            zohoBooksRepository.pushSalesReceipt(ow.order, ow.items, split.method)
                            if (apiSyncRepository.isOnline()) {
                                apiSyncRepository.syncFromApi()
                            }
                        } catch (_: Exception) { }
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(paymentInProgress = false, message = e.message ?: "Payment error") }
            }
        }
    }

    fun completePayment() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            if (_uiState.value.paymentInProgress) return@launch
            _uiState.update { it.copy(paymentInProgress = true) }
            val orderTotal = MoneyUtils.round(_uiState.value.orderTotalComputed)
            val splits = _uiState.value.splits.filter { it.amount > 0 }
            if (splits.isEmpty() && orderTotal > 0.01) {
                _uiState.update { it.copy(paymentInProgress = false, message = "Add at least one payment") }
                return@launch
            }
            val totalSplits = MoneyUtils.sum(splits.map { it.amount })
            if (MoneyUtils.greaterThan(totalSplits, orderTotal)) {
                _uiState.update { it.copy(paymentInProgress = false, message = "Payment cannot exceed total (${CurrencyUtils.format(orderTotal)})") }
                return@launch
            }
            if (!MoneyUtils.equals(totalSplits, orderTotal) && !(orderTotal <= 0.01 && splits.isEmpty())) {
                _uiState.update { it.copy(paymentInProgress = false, message = "Payment total must be ${CurrencyUtils.format(orderTotal)} (current: ${CurrencyUtils.format(totalSplits)})") }
                return@launch
            }
            val userId = authRepository.getCurrentUserIdSync()
            if (userId == null) {
                _uiState.update { it.copy(paymentInProgress = false) }
                return@launch
            }
            val effectiveSplits = if (orderTotal <= 0.01 && splits.isEmpty()) {
                listOf(PaymentSplit("_zero", 0.0, "cash", 0.0, 0.0))
            } else splits
            try {
                withContext(Dispatchers.IO) {
                    var runningDbTotal = MoneyUtils.round(paymentRepository.getPaymentsSumByOrder(ow.order.id))
                    for (split in effectiveSplits) {
                        val amt = MoneyUtils.round(split.amount)
                        if (amt <= 0) {
                            Log.w("PaymentViewModel", "completePayment: skip split with amount<=0")
                            continue
                        }
                        if (MoneyUtils.greaterThan(MoneyUtils.add(runningDbTotal, amt), orderTotal)) {
                            Log.w("PaymentViewModel", "completePayment: would exceed order total, abort. db=$runningDbTotal amt=$amt orderTotal=$orderTotal")
                            throw IllegalStateException("Payment would exceed order total")
                        }
                        paymentRepository.createPayment(
                            orderId = ow.order.id,
                            amount = amt,
                            method = split.method,
                            receivedAmount = if (split.method == "cash") MoneyUtils.round(split.receivedAmount) else amt,
                            changeAmount = if (split.method == "cash") MoneyUtils.round(split.changeAmount) else 0.0,
                            userId = userId
                        )
                        runningDbTotal = MoneyUtils.add(runningDbTotal, amt)
                    }
                    orderRepository.markOrderPaid(ow.order.id)
                    tableRepository.closeTable(tableId)
                }

                // Try receipt print; only show failure if no printer printed. Drawer failure is separate.
                var cashierCount = 0
                val receiptFailedPrinters = mutableListOf<String>()
                val drawerFailedPrinters = mutableListOf<String>()
                withContext(Dispatchers.IO) {
                    val cashierPrinters = printerRepository.getAllPrinters().first()
                        .filter { (it.printerType == "cashier" || it.printerType.equals("receipt", true)) && it.ipAddress.isNotBlank() && it.enabled }
                    cashierCount = cashierPrinters.size
                    val itemSize = printerPreferences.getReceiptItemSize()
                    val receiptSettings = receiptPreferences.getReceiptSettings()
                    val receipt = printerService.buildReceipt(ow.order, ow.items, itemSize, receiptSettings)
                    val hasCashPayment = effectiveSplits.any { it.method.equals("cash", true) && it.amount > 0.01 }
                    for (printer in cashierPrinters) {
                        val printResult = printerService.sendToPrinter(printer.ipAddress, printer.port, receipt)
                        if (printResult.isFailure) receiptFailedPrinters.add(printer.name)
                        else if (hasCashPayment) {
                            val drawerResult = printerService.openCashDrawer(printer.ipAddress, printer.port)
                            if (drawerResult.isFailure) drawerFailedPrinters.add(printer.name)
                        }
                    }
                }
                val anyReceiptPrinted = receiptFailedPrinters.size < cashierCount
                if (!anyReceiptPrinted) {
                    receiptPrintWarningHolder.setWarning(ReceiptPrintWarningState(
                        message = "Receipt print failed: ${receiptFailedPrinters.joinToString(", ")}",
                        orderId = ow.order.id,
                        tableId = tableId,
                        isPartial = false
                    ))
                    _uiState.update { it.copy(paymentInProgress = false, receiptFailedBeforeNavigate = true) }
                } else {
                    _uiState.update {
                        it.copy(
                            paymentInProgress = false,
                            paymentComplete = true,
                            message = when {
                                receiptFailedPrinters.isNotEmpty() -> "Printed; failed on: ${receiptFailedPrinters.joinToString(", ")}"
                                drawerFailedPrinters.isNotEmpty() -> "Receipt printed. Cash drawer did not open: ${drawerFailedPrinters.joinToString(", ")}"
                                else -> "Payment completed"
                            }
                        )
                    }
                }

                viewModelScope.launch(Dispatchers.IO) {
                    try {
                        if (apiSyncRepository.isOnline()) {
                            apiSyncRepository.pushCloseTable(tableId)
                            apiSyncRepository.pushTableStatesNow()
                        }
                        val primaryMethod = effectiveSplits.firstOrNull()?.method ?: "cash"
                        zohoBooksRepository.pushSalesReceipt(ow.order, ow.items, primaryMethod)
                        if (apiSyncRepository.isOnline()) {
                            apiSyncRepository.syncFromApi()
                        }
                    } catch (_: Exception) { }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(paymentInProgress = false, message = e.message ?: "Payment error") }
            }
        }
    }

    /** Single-Source Recovery: ödeme iptal edildiğinde splits sıfırlanır, temiz sayfa. */
    fun cancelPayment(paymentId: String) {
        viewModelScope.launch {
            paymentRepository.deletePayment(paymentId)
            val freshPayments = paymentRepository.getPaymentsByOrderSync(
                _uiState.value.orderWithItems?.order?.id ?: return@launch
            )
            val freshTotal = MoneyUtils.sum(freshPayments.map { it.amount })
            _uiState.update {
                it.copy(
                    splits = emptyList(),
                    completedPaymentsTotal = freshTotal,
                    completedPayments = freshPayments
                )
            }
        }
    }

    fun clearMessage() {
        _uiState.update { it.copy(message = null) }
    }

    fun clearNavigateToFloorPlanAfterDiscount() {
        _uiState.update { it.copy(navigateToFloorPlanAfterDiscount = false) }
    }

    fun fixNegativeBalance() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            val orderTotal = _uiState.value.orderTotalComputed
            try {
                paymentRepository.fixOverpayment(ow.order.id, orderTotal)
                _uiState.update { it.copy(message = "Overpayment fixed") }
            } catch (e: Exception) {
                _uiState.update { it.copy(message = e.message ?: "Fix failed") }
            }
        }
    }

    fun printBill() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            val cashierPrinters = printerRepository.getAllPrinters().first()
                .filter { (it.printerType == "cashier" || it.printerType.equals("receipt", true)) && it.ipAddress.isNotBlank() && it.enabled }
            if (cashierPrinters.isEmpty()) {
                _uiState.update { it.copy(message = "No cashier printer configured") }
                return@launch
            }
            val failedReceiptPrinters = mutableListOf<String>()
            withContext(Dispatchers.IO) {
                val itemSize = printerPreferences.getReceiptItemSize()
                val receiptSettings = receiptPreferences.getReceiptSettings()
                val receipt = printerService.buildReceipt(ow.order, ow.items, itemSize, receiptSettings)
                for (printer in cashierPrinters) {
                    val result = printerService.sendToPrinter(printer.ipAddress, printer.port, receipt)
                    if (result.isFailure) failedReceiptPrinters.add(printer.name)
                }
            }
            val anyReceiptPrinted = failedReceiptPrinters.size < cashierPrinters.size
            if (!anyReceiptPrinted) {
                receiptPrintWarningHolder.setWarning(ReceiptPrintWarningState(
                    message = "Receipt print failed: ${failedReceiptPrinters.joinToString(", ")}",
                    orderId = ow.order.id,
                    tableId = tableId,
                    isPartial = false
                ))
            } else {
                _uiState.update { it.copy(message = if (failedReceiptPrinters.isEmpty()) "Bill printed" else "Printed; failed on: ${failedReceiptPrinters.joinToString(", ")}") }
            }
        }
    }

    fun retryReceiptPrint() {
        viewModelScope.launch {
            val warning = receiptPrintWarningHolder.state.value ?: return@launch
            receiptPrintWarningHolder.clear()
            val ow = orderRepository.getOrderWithItems(warning.orderId).first() ?: return@launch
            val failedReceiptPrinters = mutableListOf<String>()
            var cashierCount = 0
            withContext(Dispatchers.IO) {
                val cashierPrinters = printerRepository.getAllPrinters().first()
                    .filter { (it.printerType == "cashier" || it.printerType.equals("receipt", true)) && it.ipAddress.isNotBlank() && it.enabled }
                cashierCount = cashierPrinters.size
                if (warning.isPartial) {
                    val receipt = printerService.buildPartialReceipt(
                        ow.order, ow.items,
                        warning.paymentAmount, warning.paymentMethod,
                        warning.totalPaidSoFar, warning.balanceRemaining
                    )
                    for (printer in cashierPrinters) {
                        if (printerService.sendToPrinter(printer.ipAddress, printer.port, receipt).isFailure) {
                            failedReceiptPrinters.add(printer.name)
                        }
                    }
                } else {
                    val itemSize = printerPreferences.getReceiptItemSize()
                    val receiptSettings = receiptPreferences.getReceiptSettings()
                    val receipt = printerService.buildReceipt(ow.order, ow.items, itemSize, receiptSettings)
                    for (printer in cashierPrinters) {
                        if (printerService.sendToPrinter(printer.ipAddress, printer.port, receipt).isFailure) {
                            failedReceiptPrinters.add(printer.name)
                        }
                    }
                }
            }
            val anyReceiptPrinted = failedReceiptPrinters.size < cashierCount
            if (!anyReceiptPrinted) {
                receiptPrintWarningHolder.setWarning(warning.copy(message = "Receipt print failed: ${failedReceiptPrinters.joinToString(", ")}"))
            } else if (_uiState.value.receiptFailedBeforeNavigate) {
                _uiState.update { it.copy(receiptFailedBeforeNavigate = false, paymentComplete = true) }
            } else if (failedReceiptPrinters.isNotEmpty()) {
                _uiState.update { it.copy(message = "Printed; failed on: ${failedReceiptPrinters.joinToString(", ")}") }
            }
        }
    }

    fun dismissReceiptWarning() {
        receiptPrintWarningHolder.clear()
        if (_uiState.value.receiptFailedBeforeNavigate) {
            _uiState.update { it.copy(receiptFailedBeforeNavigate = false, paymentComplete = true) }
        }
    }
}
