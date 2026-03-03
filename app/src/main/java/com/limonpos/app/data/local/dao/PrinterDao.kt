package com.limonpos.app.data.local.dao

import androidx.room.*
import com.limonpos.app.data.local.entity.PrinterEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PrinterDao {
    @Query("SELECT * FROM printers ORDER BY printerType, name")
    fun getAllPrinters(): Flow<List<PrinterEntity>>

    @Query("SELECT * FROM printers WHERE id = :id")
    suspend fun getPrinterById(id: String): PrinterEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPrinter(printer: PrinterEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPrinters(printers: List<PrinterEntity>)

    @Update
    suspend fun updatePrinter(printer: PrinterEntity)

    @Delete
    suspend fun deletePrinter(printer: PrinterEntity)

    @Query("SELECT COUNT(*) FROM printers")
    suspend fun getPrinterCount(): Int

    @Query("SELECT * FROM printers WHERE syncStatus = 'PENDING'")
    suspend fun getPendingPrinters(): List<PrinterEntity>

    @Query("DELETE FROM printers")
    suspend fun deleteAll()
}
