package com.limonpos.app.data.local

import com.limonpos.app.data.local.dao.*
import com.limonpos.app.data.local.entity.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

class DatabaseSeeder @Inject constructor(
    private val userDao: UserDao,
    private val tableDao: TableDao,
    private val printerDao: PrinterDao
) {
    fun seedIfEmpty() {
        CoroutineScope(Dispatchers.IO).launch {
            seedIfEmptySync()
        }
    }

    suspend fun seedIfEmptySync() {
        if (userDao.getUserCount() == 0) {
            seedUsers()
        }
        if (tableDao.getTableCount() == 0) {
            seedTables()
        }
        // Categories and products come from web sync only (pos-backoffice)
        if (printerDao.getPrinterCount() == 0) {
            seedPrinters()
        }
    }

    private suspend fun seedUsers() {
        // Varsayılan kullanıcı yok. 1234/2222 sadece Server URL için (users tablosunda değil).
        // Kullanıcılar backoffice üzerinden eklenir, sync ile gelir.
        val users = emptyList<UserEntity>()
        if (users.isNotEmpty()) userDao.insertUsers(users)
    }

    private suspend fun seedTables() {
        val tables = mutableListOf<TableEntity>()
        (1..43).forEach { i ->
            tables.add(TableEntity(
                id = "main-$i",
                number = i.toString(),
                name = "Table $i",
                capacity = 4,
                floor = "Main",
                status = "free"
            ))
        }
        tableDao.insertTables(tables)
    }

    private suspend fun seedPrinters() {
        val printers = listOf(
            PrinterEntity("pr1", "Kitchen Main", "kitchen", "192.168.1.100", 9100, "network", "offline", false, true),
            PrinterEntity("pr2", "Bar Printer", "bar", "192.168.1.101", 9100, "network", "offline", false, true),
            PrinterEntity("pr3", "Cashier Receipt", "cashier", "192.168.1.102", 9100, "network", "offline", false, true)
        )
        printerDao.insertPrinters(printers)
    }
}
