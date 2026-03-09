package com.limonpos.app.ui.screens.dailycashentry

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.remote.dto.DailyCashEntryRequest
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

/** Data needed to retry print after save. */
private data class DailyCashPrintData(
    val physicalCash: Double,
    val userName: String,
    val date: String,
    val fid: String
)

data class DailyCashEntryUiState(
    val physicalCashInput: String = "",
    val savedEntry: DailyCashEntrySaved? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val saveSuccess: Boolean = false,
)

data class DailyCashEntrySaved(
    val physicalCash: Double,
    val difference: Double,
    val userName: String?,
)

@HiltViewModel
class DailyCashEntryViewModel @Inject constructor(
    private val apiService: ApiService,
    private val printerRepository: PrinterRepository,
    private val printerService: PrinterService
) : ViewModel() {

    private val _uiState = MutableStateFlow(DailyCashEntryUiState())
    val uiState: StateFlow<DailyCashEntryUiState> = _uiState.asStateFlow()

    private val _printWarning = MutableStateFlow<String?>(null)
    val printWarning: StateFlow<String?> = _printWarning.asStateFlow()

    private var lastPrintData: DailyCashPrintData? = null

    fun setPhysicalCashInput(value: String) {
        _uiState.value = _uiState.value.copy(
            physicalCashInput = value,
            saveSuccess = false
        )
    }

    fun save() {
        val input = _uiState.value.physicalCashInput.trim()
        val physicalCash = input.toDoubleOrNull() ?: run {
            _uiState.value = _uiState.value.copy(error = "Enter a valid amount")
            return
        }
        if (physicalCash < 0) {
            _uiState.value = _uiState.value.copy(error = "Amount must be non-negative")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            try {
                val res = apiService.postDailyCashEntry(
                    DailyCashEntryRequest(physicalCash = physicalCash, date = today)
                )
                if (res.isSuccessful) {
                    val body = res.body()
                    val diff = body?.difference ?: 0.0
                    val userName = body?.userName ?: "—"
                    val date = body?.date ?: today
                    val fid = body?.id ?: ""
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        savedEntry = DailyCashEntrySaved(
                            physicalCash = physicalCash,
                            difference = diff,
                            userName = body?.userName
                        ),
                        saveSuccess = true,
                        error = null
                    )
                    lastPrintData = DailyCashPrintData(physicalCash, userName, date, fid)
                    tryPrintSlip()
                } else {
                    _uiState.value = _uiState.value.copy(isLoading = false, error = "Failed to save")
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
            _printWarning.value = "No cashier printer configured. Please add a printer in Settings."
            return
        }
        val slip = printerService.buildDailyCashEntrySlip(data.physicalCash, data.userName, data.date, data.fid)
        val failed = mutableListOf<String>()
        for (printer in cashierPrinters) {
            val result = printerService.sendToPrinter(printer.ipAddress, printer.port, slip)
            if (result.isFailure) failed.add(printer.name)
        }
        if (failed.isNotEmpty()) {
            _printWarning.value = "Receipt print failed: ${failed.joinToString(", ")}. Check printer connection."
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
