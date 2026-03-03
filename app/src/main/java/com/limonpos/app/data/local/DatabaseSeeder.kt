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
        // PINs must match backend (data.json) for sync to work; backend accepts user.pin as token
        val users = listOf(
            UserEntity("u1", "Admin", "1234", "admin", true, "[\"post_void\",\"pre_void\"]", true),
            UserEntity("u_87b6a7e4", "Bora Meral", "0072", "admin", true, "[]", true),
            UserEntity("u_62e15c03", "Muhlishayal", "9611", "manager", true, "[]", false),
            UserEntity("u_5a2682f4", "Latif Yilmaz", "2929", "cashier", true, "[]", true),
            UserEntity("u_ced88cd2", "Khaled Bar", "3425", "waiter", true, "[\"floor_plan\",\"orders\"]", false)
        )
        userDao.insertUsers(users)
    }

    private suspend fun seedTables() {
        val tables = mutableListOf<TableEntity>()
        (1..8).forEach { i ->
            tables.add(TableEntity(
                id = "main-$i",
                number = "T$i",
                name = "Table $i",
                capacity = 4,
                floor = "Main",
                status = "free"
            ))
        }
        (9..12).forEach { i ->
            tables.add(TableEntity(
                id = "terrace-${i - 8}",
                number = "T$i",
                name = "Table $i",
                capacity = 4,
                floor = "Terrace",
                status = "free"
            ))
        }
        (1..4).forEach { i ->
            tables.add(TableEntity(
                id = "vip-$i",
                number = "VIP$i",
                name = "VIP $i",
                capacity = 6,
                floor = "VIP",
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
