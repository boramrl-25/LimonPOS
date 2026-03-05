package com.limonpos.app.ui.screens.payment

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.OrderItemEntity
import com.limonpos.app.data.local.entity.PaymentEntity
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.printer.ReceiptPrintWarningHolder
import com.limonpos.app.data.printer.ReceiptPrintWarningState
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.data.repository.OrderWithItems
import com.limonpos.app.data.repository.PaymentRepository
import com.limonpos.app.data.repository.TableRepository
import com.limonpos.app.data.zoho.ZohoBooksRepository
import com.limonpos.app.service.PrinterService
import com.limonpos.app.util.CurrencyUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    val splits: List<PaymentSplit> = emptyList(),
    val completedPaymentsTotal: Double = 0.0,
    val completedPayments: List<PaymentEntity> = emptyList(),
    val paymentMode: String = "split", // cash | card | split
    val message: String? = null,
    val paymentComplete: Boolean = false,
    val redirectToOrder: Boolean = false,
    val isRecalledOrder: Boolean = false,
    /** True when last payment is done but final receipt failed; dismiss will set paymentComplete so user can leave. */
    val receiptFailedBeforeNavigate: Boolean = false
)

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
    private val zohoBooksRepository: ZohoBooksRepository,
    private val receiptPrintWarningHolder: ReceiptPrintWarningHolder
) : ViewModel() {

    private val tableId: String = checkNotNull(savedStateHandle["tableId"]) { "tableId required" }

    private val _uiState = MutableStateFlow(PaymentUiState())
    val uiState: StateFlow<PaymentUiState> = _uiState.asStateFlow()

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
                val isRecalled = orderRepository.isOrderRecalled(order.id)
                orderRepository.getOrderWithItems(order.id).first()?.let { ow ->
                    _uiState.update { it.copy(orderWithItems = ow, isRecalledOrder = isRecalled) }
                    paymentRepository.getPaymentsByOrder(ow.order.id).collect { payments ->
                        val total = payments.sumOf { it.amount }
                        _uiState.update { it.copy(completedPaymentsTotal = total, completedPayments = payments) }
                    }
                }
            }
        }
    }

    fun clearPreviousPaymentsForRecalled() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            if (!_uiState.value.isRecalledOrder) return@launch
            paymentRepository.deleteAllPaymentsForOrder(ow.order.id)
            _uiState.update { it.copy(completedPaymentsTotal = 0.0, message = "Previous payments cleared. Enter new payment.") }
        }
    }

    fun selectPaymentMode(mode: String) {
        val ow = _uiState.value.orderWithItems ?: return
        val orderTotal = ow.order.total
        _uiState.update {
            when (mode) {
                "cash" -> it.copy(paymentMode = "cash", splits = listOf(
                    PaymentSplit(id = "split_${System.currentTimeMillis()}", amount = orderTotal, method = "cash", receivedAmount = orderTotal)
                ))
                "card" -> it.copy(paymentMode = "card", splits = listOf(
                    PaymentSplit(id = "split_${System.currentTimeMillis()}", amount = orderTotal, method = "card")
                ))
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

    fun updateSplit(id: String, amount: Double, method: String, receivedAmount: Double = 0.0, changeAmount: Double = 0.0) {
        val ow = _uiState.value.orderWithItems ?: return
        val maxAllowed = ow.order.total - _uiState.value.completedPaymentsTotal -
            _uiState.value.splits.filter { it.id != id }.sumOf { it.amount }
        val cappedAmount = amount.coerceIn(0.0, maxAllowed.coerceAtLeast(0.0))
        _uiState.update {
            it.copy(splits = it.splits.map { s ->
                if (s.id == id) s.copy(amount = cappedAmount, method = method, receivedAmount = receivedAmount, changeAmount = changeAmount.coerceAtLeast(0.0))
                else s
            })
        }
    }

    fun paySplit(splitId: String) {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            val split = _uiState.value.splits.find { it.id == splitId } ?: return@launch
            if (split.amount <= 0) {
                _uiState.update { it.copy(message = "Enter amount") }
                return@launch
            }
            if (split.method != "cash" && split.method != "card") {
                _uiState.update { it.copy(message = "Select Cash or Card") }
                return@launch
            }
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val totalPaidBefore = paymentRepository.getPaymentsSumByOrder(ow.order.id)
            val balanceRemaining = ow.order.total - totalPaidBefore

            if (split.amount > balanceRemaining + 0.01) {
                _uiState.update { it.copy(message = "Amount cannot exceed balance (${CurrencyUtils.format(balanceRemaining)})") }
                return@launch
            }

            try {
                val received = if (split.method == "cash") split.receivedAmount else split.amount
                val change = if (split.method == "cash") split.changeAmount else 0.0
                paymentRepository.createPayment(
                    orderId = ow.order.id,
                    amount = split.amount,
                    method = split.method,
                    receivedAmount = received,
                    changeAmount = change,
                    userId = userId
                )
                val totalPaidAfter = totalPaidBefore + split.amount
                val newBalance = ow.order.total - totalPaidAfter

                // Hemen UI güncelle – Pay butonu geç algılanmasın
                _uiState.update {
                    it.copy(
                        splits = listOf(PaymentSplit(id = "split_${System.currentTimeMillis()}", amount = 0.0, method = "")),
                        message = "Ödeme alındı"
                    )
                }

                // Fiş yazdırma arka planda; başarısız olursa uyarı (Retry/Dismiss) göster
                viewModelScope.launch(Dispatchers.IO) {
                    val cashierPrinters = printerRepository.getAllPrinters().first()
                        .filter { it.printerType == "cashier" && it.ipAddress.isNotBlank() }
                    val failedPrinters = mutableListOf<String>()
                    for (printer in cashierPrinters) {
                        val receipt = printerService.buildPartialReceipt(
                            order = ow.order,
                            items = ow.items,
                            paymentAmount = split.amount,
                            paymentMethod = split.method,
                            totalPaidSoFar = totalPaidAfter,
                            balanceRemaining = newBalance
                        )
                        val printResult = printerService.sendToPrinter(printer.ipAddress, printer.port, receipt)
                        if (printResult.isFailure) failedPrinters.add(printer.name)
                        if (split.method == "cash") {
                            val drawerResult = printerService.openCashDrawer(printer.ipAddress, printer.port)
                            if (drawerResult.isFailure && printer.name !in failedPrinters) failedPrinters.add("${printer.name} (drawer)")
                        }
                    }
                    if (failedPrinters.isNotEmpty()) {
                        receiptPrintWarningHolder.setWarning(ReceiptPrintWarningState(
                            message = "Receipt print failed: ${failedPrinters.joinToString(", ")}",
                            orderId = ow.order.id,
                            tableId = tableId,
                            isPartial = true,
                            paymentAmount = split.amount,
                            paymentMethod = split.method,
                            totalPaidSoFar = totalPaidAfter,
                            balanceRemaining = newBalance
                        ))
                    }
                }

                if (kotlin.math.abs(newBalance) < 0.01) {
                    withContext(Dispatchers.IO) {
                        orderRepository.markOrderPaid(ow.order.id)
                        tableRepository.closeTable(tableId)
                    }
                    // Try final receipt print before navigating away; if it fails show Retry/Dismiss and stay on screen
                    val failedPrinters = mutableListOf<String>()
                    withContext(Dispatchers.IO) {
                        val cashierPrinters = printerRepository.getAllPrinters().first()
                            .filter { it.printerType == "cashier" && it.ipAddress.isNotBlank() }
                        val finalReceipt = printerService.buildReceipt(ow.order, ow.items)
                        for (printer in cashierPrinters) {
                            val printResult = printerService.sendToPrinter(printer.ipAddress, printer.port, finalReceipt)
                            if (printResult.isFailure) failedPrinters.add(printer.name)
                        }
                    }
                    if (failedPrinters.isNotEmpty()) {
                        receiptPrintWarningHolder.setWarning(ReceiptPrintWarningState(
                            message = "Receipt print failed: ${failedPrinters.joinToString(", ")}",
                            orderId = ow.order.id,
                            tableId = tableId,
                            isPartial = false
                        ))
                        _uiState.update { it.copy(receiptFailedBeforeNavigate = true) }
                    } else {
                        _uiState.update { it.copy(paymentComplete = true, message = "Payment completed") }
                    }

                    viewModelScope.launch(Dispatchers.IO) {
                        try {
                            if (apiSyncRepository.isOnline()) {
                                apiSyncRepository.pushCloseTable(tableId)
                            }
                            zohoBooksRepository.pushSalesReceipt(ow.order, ow.items, split.method)
                            if (apiSyncRepository.isOnline()) {
                                apiSyncRepository.syncFromApi()
                            }
                        } catch (_: Exception) { }
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(message = e.message ?: "Payment error") }
            }
        }
    }

    fun completePayment() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            val splits = _uiState.value.splits.filter { it.amount > 0 }
            if (splits.isEmpty()) {
                _uiState.update { it.copy(message = "Add at least one payment") }
                return@launch
            }
            val totalSplits = splits.sumOf { it.amount }
            val orderTotal = ow.order.total
            if (totalSplits > orderTotal + 0.01) {
                _uiState.update { it.copy(message = "Payment cannot exceed total (${CurrencyUtils.format(orderTotal)})") }
                return@launch
            }
            if (kotlin.math.abs(totalSplits - orderTotal) > 0.01) {
                _uiState.update { it.copy(message = "Payment total must be ${CurrencyUtils.format(orderTotal)} (current: ${CurrencyUtils.format(totalSplits)})") }
                return@launch
            }
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            try {
                // Save all payments on IO thread
                withContext(Dispatchers.IO) {
                    for (split in splits) {
                        val received = if (split.method == "cash") split.receivedAmount else split.amount
                        val change = if (split.method == "cash") split.changeAmount else 0.0
                        paymentRepository.createPayment(
                            orderId = ow.order.id,
                            amount = split.amount,
                            method = split.method,
                            receivedAmount = received,
                            changeAmount = change,
                            userId = userId
                        )
                    }
                    orderRepository.markOrderPaid(ow.order.id)
                    tableRepository.closeTable(tableId)
                }

                // Try receipt print before navigating; if it fails show Retry/Dismiss and stay on screen
                val failedPrinters = mutableListOf<String>()
                withContext(Dispatchers.IO) {
                    val cashierPrinters = printerRepository.getAllPrinters().first()
                        .filter { it.printerType == "cashier" && it.ipAddress.isNotBlank() }
                    val receipt = printerService.buildReceipt(ow.order, ow.items)
                    for (printer in cashierPrinters) {
                        val printResult = printerService.sendToPrinter(printer.ipAddress, printer.port, receipt)
                        if (printResult.isFailure) failedPrinters.add(printer.name)
                        val drawerResult = printerService.openCashDrawer(printer.ipAddress, printer.port)
                        if (drawerResult.isFailure && printer.name !in failedPrinters) failedPrinters.add("${printer.name} (drawer)")
                    }
                }
                if (failedPrinters.isNotEmpty()) {
                    receiptPrintWarningHolder.setWarning(ReceiptPrintWarningState(
                        message = "Receipt print failed: ${failedPrinters.joinToString(", ")}",
                        orderId = ow.order.id,
                        tableId = tableId,
                        isPartial = false
                    ))
                    _uiState.update { it.copy(receiptFailedBeforeNavigate = true) }
                } else {
                    _uiState.update { it.copy(paymentComplete = true, message = "Payment completed") }
                }

                viewModelScope.launch(Dispatchers.IO) {
                    try {
                        if (apiSyncRepository.isOnline()) {
                            apiSyncRepository.pushCloseTable(tableId)
                        }
                        val primaryMethod = splits.firstOrNull()?.method ?: "cash"
                        zohoBooksRepository.pushSalesReceipt(ow.order, ow.items, primaryMethod)
                        if (apiSyncRepository.isOnline()) {
                            apiSyncRepository.syncFromApi()
                        }
                    } catch (_: Exception) { }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(message = e.message ?: "Payment error") }
            }
        }
    }

    fun cancelPayment(paymentId: String) {
        viewModelScope.launch {
            paymentRepository.deletePayment(paymentId)
            // completedPayments updates via getPaymentsByOrder flow
        }
    }

    fun clearMessage() {
        _uiState.update { it.copy(message = null) }
    }

    fun fixNegativeBalance() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            try {
                paymentRepository.fixOverpayment(ow.order.id, ow.order.total)
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
                .filter { it.printerType == "cashier" && it.ipAddress.isNotBlank() }
            if (cashierPrinters.isEmpty()) {
                _uiState.update { it.copy(message = "No cashier printer configured") }
                return@launch
            }
            val failed = mutableListOf<String>()
            for (printer in cashierPrinters) {
                val receipt = printerService.buildReceipt(ow.order, ow.items)
                val result = printerService.sendToPrinter(printer.ipAddress, printer.port, receipt)
                if (result.isFailure) failed.add(printer.name)
            }
            if (failed.isNotEmpty()) {
                receiptPrintWarningHolder.setWarning(ReceiptPrintWarningState(
                    message = "Receipt print failed: ${failed.joinToString(", ")}",
                    orderId = ow.order.id,
                    tableId = tableId,
                    isPartial = false
                ))
            } else {
                _uiState.update { it.copy(message = "Bill printed") }
            }
        }
    }

    fun retryReceiptPrint() {
        viewModelScope.launch {
            val warning = receiptPrintWarningHolder.state.value ?: return@launch
            receiptPrintWarningHolder.clear()
            val ow = orderRepository.getOrderWithItems(warning.orderId).first() ?: return@launch
            withContext(Dispatchers.IO) {
                val cashierPrinters = printerRepository.getAllPrinters().first()
                    .filter { it.printerType == "cashier" && it.ipAddress.isNotBlank() }
                val failedPrinters = mutableListOf<String>()
                if (warning.isPartial) {
                    val receipt = printerService.buildPartialReceipt(
                        ow.order, ow.items,
                        warning.paymentAmount, warning.paymentMethod,
                        warning.totalPaidSoFar, warning.balanceRemaining
                    )
                    for (printer in cashierPrinters) {
                        if (printerService.sendToPrinter(printer.ipAddress, printer.port, receipt).isFailure) {
                            failedPrinters.add(printer.name)
                        }
                    }
                } else {
                    val receipt = printerService.buildReceipt(ow.order, ow.items)
                    for (printer in cashierPrinters) {
                        if (printerService.sendToPrinter(printer.ipAddress, printer.port, receipt).isFailure) {
                            failedPrinters.add(printer.name)
                        }
                    }
                }
                if (failedPrinters.isNotEmpty()) {
                    receiptPrintWarningHolder.setWarning(warning.copy(message = "Receipt print failed: ${failedPrinters.joinToString(", ")}"))
                } else if (_uiState.value.receiptFailedBeforeNavigate) {
                    _uiState.update { it.copy(receiptFailedBeforeNavigate = false, paymentComplete = true) }
                }
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
