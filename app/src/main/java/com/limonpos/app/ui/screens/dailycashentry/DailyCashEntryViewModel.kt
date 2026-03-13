package com.limonpos.app.ui.screens.dailycashentry

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.remote.dto.DailyTransactionRequest
import com.limonpos.app.data.remote.dto.DailyTransactionEntryDto
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.service.PrinterService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

private data class DailyPrintData(
    val physicalCash: Double,
    val userName: String,
    val date: String,
    val fid: String
)

data class DailyTransactionUiState(
    val cashInput: String = "",
    val cardRefInput: String = "",
    val cardAmountInput: String = "",
    val cashEntries: List<DailyTransactionEntryDto> = emptyList(),
    val cardEntries: List<DailyTransactionEntryDto> = emptyList(),
    val systemCash: Double = 0.0,
    val systemCard: Double = 0.0,
    val isLoading: Boolean = false,
    val error: String? = null,
    val lastSavedType: String? = null,
)

@HiltViewModel
class DailyCashEntryViewModel @Inject constructor(
    private val apiService: ApiService,
    private val printerRepository: PrinterRepository,
    private val printerService: PrinterService
) : ViewModel() {

    private val _uiState = MutableStateFlow(DailyTransactionUiState())
    val uiState: StateFlow<DailyTransactionUiState> = _uiState.asStateFlow()

    private val _printWarning = MutableStateFlow<String?>(null)
    val printWarning: StateFlow<String?> = _printWarning.asStateFlow()

    private var lastPrintData: DailyPrintData? = null

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            try {
                val res = apiService.getDailyTransaction(today)
                if (res.isSuccessful) {
                    val body = res.body()
                    _uiState.value = _uiState.value.copy(
                        cashEntries = body?.cashEntries ?: emptyList(),
                        cardEntries = body?.cardEntries ?: emptyList(),
                        systemCash = body?.systemCash ?: 0.0,
                        systemCard = body?.systemCard ?: 0.0,
                        error = null
                    )
                }
            } catch (_: Exception) { }
        }
    }

    fun setCashInput(value: String) {
        _uiState.value = _uiState.value.copy(cashInput = value, error = null)
    }

    fun setCardRefInput(value: String) {
        val digits = value.replace(Regex("[^0-9]"), "").take(15)
        _uiState.value = _uiState.value.copy(cardRefInput = digits, error = null)
    }

    fun setCardAmountInput(value: String) {
        _uiState.value = _uiState.value.copy(cardAmountInput = value, error = null)
    }

    fun saveCash() {
        val input = _uiState.value.cashInput.trim().replace(',', '.')
        val amount = input.toDoubleOrNull() ?: run {
            _uiState.value = _uiState.value.copy(error = "Enter a valid amount")
            return
        }
        if (amount < 0) {
            _uiState.value = _uiState.value.copy(error = "Amount cannot be negative")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            try {
                val res = apiService.postDailyTransaction(
                    DailyTransactionRequest(type = "cash", physicalCash = amount, date = today)
                )
                if (res.isSuccessful) {
                    val body = res.body()
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        cashInput = "",
                        lastSavedType = "cash",
                        error = null
                    )
                    lastPrintData = DailyPrintData(amount, body?.userName ?: "—", body?.date ?: today, body?.id ?: "")
                    load()
                    tryPrintSlip()
                } else {
                    val fallback = apiService.postDailyCashEntry(
                        com.limonpos.app.data.remote.dto.DailyCashEntryRequest(physicalCash = amount, date = today)
                    )
                    if (fallback.isSuccessful) {
                        val body = fallback.body()
                        _uiState.value = _uiState.value.copy(isLoading = false, cashInput = "", lastSavedType = "cash", error = null)
                        lastPrintData = DailyPrintData(amount, body?.userName ?: "—", body?.date ?: today, body?.id ?: "")
                        load()
                        tryPrintSlip()
                    } else {
                        _uiState.value = _uiState.value.copy(isLoading = false, error = "Save failed (${res.code()})")
                    }
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Network error"
                )
            }
        }
    }

    fun saveCard() {
        val ref = _uiState.value.cardRefInput
        val amountStr = _uiState.value.cardAmountInput.trim().replace(',', '.')
        val amount = amountStr.toDoubleOrNull() ?: run {
            _uiState.value = _uiState.value.copy(error = "Enter a valid amount")
            return
        }
        if (amount < 0) {
            _uiState.value = _uiState.value.copy(error = "Amount cannot be negative")
            return
        }
        if (ref.isBlank()) {
            _uiState.value = _uiState.value.copy(error = "Enter card reference")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            try {
                val res = apiService.postDailyTransaction(
                    DailyTransactionRequest(type = "card", cardReference = ref, amount = amount, date = today)
                )
                if (res.isSuccessful) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        cardRefInput = "",
                        cardAmountInput = "",
                        lastSavedType = "card",
                        error = null
                    )
                    load()
                } else {
                    val errBody = res.errorBody()?.string()?.take(300) ?: ""
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Save failed (${res.code()})${if (errBody.isNotBlank()) ": $errBody" else ""}"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Network error"
                )
            }
        }
    }

    private suspend fun tryPrintSlip() {
        val data = lastPrintData ?: return
        val cashierPrinters = printerRepository.getAllPrinters().first()
            .filter { (it.printerType == "cashier" || it.printerType.equals("receipt", true)) && it.ipAddress.isNotBlank() && it.enabled }
        if (cashierPrinters.isEmpty()) {
            _printWarning.value = "No cashier printer. Add one in settings."
            return
        }
        val slip = printerService.buildDailyCashEntrySlip(data.physicalCash, data.userName, data.date, data.fid)
        val failed = mutableListOf<String>()
        for (printer in cashierPrinters) {
            val result = printerService.sendToPrinter(printer.ipAddress, printer.port, slip)
            if (result.isFailure) failed.add(printer.name)
        }
        if (failed.isNotEmpty()) {
            _printWarning.value = "Print failed: ${failed.joinToString(", ")}"
        }
    }

    fun retryPrint() {
        viewModelScope.launch {
            _printWarning.value = null
            tryPrintSlip()
        }
    }

    fun dismissPrintWarning() {
        _printWarning.value = null
    }
}
