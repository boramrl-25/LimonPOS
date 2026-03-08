package com.limonpos.app.ui.screens.printers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.PrinterEntity
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.service.PrinterService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class PrintersViewModel @Inject constructor(
    private val printerRepository: PrinterRepository,
    private val printerService: PrinterService
) : ViewModel() {

    val printers = printerRepository.getAllPrinters()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _showAddDialog = MutableStateFlow(false)
    val showAddDialog: StateFlow<Boolean> = _showAddDialog.asStateFlow()

    private val _editingPrinter = MutableStateFlow<PrinterEntity?>(null)
    val editingPrinter: StateFlow<PrinterEntity?> = _editingPrinter.asStateFlow()

    private val _testPrintMessage = MutableStateFlow<String?>(null)
    val testPrintMessage: StateFlow<String?> = _testPrintMessage.asStateFlow()

    fun showAddPrinterDialog() {
        _showAddDialog.value = true
    }

    fun dismissAddDialog() {
        _showAddDialog.value = false
    }

    fun showEditPrinterDialog(printer: PrinterEntity) {
        _editingPrinter.value = printer
    }

    fun dismissEditDialog() {
        _editingPrinter.value = null
    }

    fun testPrint(printer: PrinterEntity) {
        viewModelScope.launch {
            val result = printerService.testPrinter(printer.ipAddress, printer.port)
            _testPrintMessage.value = result.fold(
                { "Test print sent to ${printer.name}" },
                { it.message ?: "Test print failed" }
            )
        }
    }

    fun clearTestPrintMessage() {
        _testPrintMessage.value = null
    }

    fun addPrinter(name: String, printerType: String, ipAddress: String, port: Int, connectionType: String = "network", kdsEnabled: Boolean = true) {
        viewModelScope.launch {
            val printer = PrinterEntity(
                id = UUID.randomUUID().toString(),
                name = name,
                printerType = printerType,
                ipAddress = ipAddress,
                port = port,
                connectionType = connectionType,
                kdsEnabled = kdsEnabled
            )
            printerRepository.insertPrinter(printer)
        }
    }

    fun updatePrinter(printer: PrinterEntity) {
        viewModelScope.launch {
            printerRepository.updatePrinter(printer)
        }
    }

    fun deletePrinter(printer: PrinterEntity) {
        viewModelScope.launch {
            printerRepository.deletePrinter(printer)
        }
    }

    fun setPrinterEnabled(printer: PrinterEntity, enabled: Boolean) {
        viewModelScope.launch {
            printerRepository.updatePrinter(printer.copy(enabled = enabled))
        }
    }
}
