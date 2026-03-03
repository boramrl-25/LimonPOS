package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.PrinterDao
import com.limonpos.app.data.local.entity.PrinterEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class PrinterRepository @Inject constructor(
    private val printerDao: PrinterDao
) {
    fun getAllPrinters(): Flow<List<PrinterEntity>> = printerDao.getAllPrinters()
    suspend fun getPrinterById(id: String): PrinterEntity? = printerDao.getPrinterById(id)

    suspend fun insertPrinter(printer: PrinterEntity) = printerDao.insertPrinter(printer)
    suspend fun updatePrinter(printer: PrinterEntity) = printerDao.updatePrinter(printer.copy(syncStatus = "PENDING"))
    suspend fun deletePrinter(printer: PrinterEntity) = printerDao.deletePrinter(printer)

    suspend fun insertPrinters(printers: List<PrinterEntity>) = printerDao.insertPrinters(printers)
}
