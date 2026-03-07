package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.OrderDao
import com.limonpos.app.data.local.dao.TableDao
import com.limonpos.app.data.local.dao.TransferLogDao
import com.limonpos.app.data.local.dao.VoidLogDao
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.local.entity.TransferLog
import com.limonpos.app.data.local.entity.VoidLogEntity
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject

class TableRepository @Inject constructor(
    private val tableDao: TableDao,
    private val orderDao: OrderDao,
    private val transferLogDao: TransferLogDao,
    private val voidLogDao: VoidLogDao
) {
    fun getTablesByFloor(floor: String): Flow<List<TableEntity>> =
        tableDao.getTablesByFloor(floor)

    fun getAllTables(): Flow<List<TableEntity>> = tableDao.getAllTables()

    suspend fun getTableById(id: String): TableEntity? = tableDao.getTableById(id)

    suspend fun occupyTable(tableId: String, orderId: String, guestCount: Int, waiterId: String, waiterName: String): TableEntity {
        val table = tableDao.getTableById(tableId) ?: throw Exception("Table not found")
        val now = System.currentTimeMillis()
        val updated = table.copy(
            status = "occupied",
            currentOrderId = orderId,
            guestCount = guestCount,
            waiterId = waiterId,
            waiterName = waiterName,
            openedAt = now,
            syncStatus = "PENDING"
        )
        tableDao.updateTable(updated)
        return updated
    }

    suspend fun closeTable(tableId: String) {
        val table = tableDao.getTableById(tableId) ?: return
        val now = System.currentTimeMillis()
        val newStatus = if (ReservationStatusHelper.shouldReturnToReservedAfterClose(table, now)) "reserved" else "free"
        val updated = table.copy(
            status = newStatus,
            currentOrderId = null,
            guestCount = 0,
            waiterId = null,
            waiterName = null,
            openedAt = null,
            syncStatus = "PENDING"
        )
        tableDao.updateTable(updated)
    }

    suspend fun updateTable(table: TableEntity) {
        tableDao.updateTable(table.copy(syncStatus = "PENDING"))
    }

    fun getFreeTableCount(floor: String): Flow<Int> = tableDao.getFreeTableCount(floor)
    fun getOccupiedTableCount(floor: String): Flow<Int> = tableDao.getOccupiedTableCount(floor)

    suspend fun insertTables(tables: List<TableEntity>) = tableDao.insertTables(tables)

    suspend fun getOccupiedTables(): List<TableEntity> = tableDao.getOccupiedTables()

    suspend fun closeEmptyTables(): Int {
        val billTables = tableDao.getBillTables()
        for (t in billTables) {
            tableDao.clearTable(t.id)
        }
        return billTables.size
    }

    suspend fun transferWaiter(tableId: String, waiterId: String, waiterName: String): Result<Unit> {
        return try {
            val table = tableDao.getTableById(tableId) ?: return Result.failure(Exception("Table not found"))
            if (table.status == "free") return Result.failure(Exception("Table has no order"))
            val orderId = table.currentOrderId ?: return Result.failure(Exception("No order on table"))
            tableDao.updateTableWaiter(tableId, waiterId, waiterName)
            orderDao.updateOrderWaiter(orderId, waiterId, waiterName)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun transferTable(
        sourceTableId: String,
        targetTableId: String,
        managerId: String,
        managerName: String
    ): Result<String> {
        return try {
            val sourceTable = tableDao.getTableById(sourceTableId)
                ?: return Result.failure(Exception("Source table not found"))

            if (sourceTable.status == "free") {
                return Result.failure(Exception("No active order on source table"))
            }

            val targetTable = tableDao.getTableById(targetTableId)
                ?: return Result.failure(Exception("Target table not found"))

            if (targetTable.status != "free") {
                return Result.failure(Exception("Target table is occupied. Please select a free table."))
            }

            val orderId = sourceTable.currentOrderId
                ?: return Result.failure(Exception("Order not found"))

            // Update order's table reference
            orderDao.updateOrderTable(
                orderId = orderId,
                tableId = targetTableId,
                tableNumber = targetTable.number
            )

            // Update target table
            tableDao.updateTableStatus(
                tableId = targetTableId,
                status = sourceTable.status,
                guestCount = sourceTable.guestCount,
                waiterId = sourceTable.waiterId,
                waiterName = sourceTable.waiterName,
                currentOrderId = orderId,
                openedAt = sourceTable.openedAt
            )

            // Clear source table
            tableDao.clearTable(sourceTableId)

            // Log
            transferLogDao.insert(
                TransferLog(
                    type = "table_transfer",
                    sourceTableId = sourceTableId,
                    sourceTableNumber = sourceTable.number,
                    targetTableId = targetTableId,
                    targetTableNumber = targetTable.number,
                    orderId = orderId,
                    transferredById = managerId,
                    transferredByName = managerName
                )
            )

            // Table transfer void log
            voidLogDao.insert(
                VoidLogEntity(
                    type = "table_transfer_void",
                    orderId = orderId,
                    sourceTableId = sourceTableId,
                    sourceTableNumber = sourceTable.number,
                    targetTableId = targetTableId,
                    targetTableNumber = targetTable.number,
                    userId = managerId,
                    userName = managerName,
                    details = "Table transfer: ${sourceTable.number} -> ${targetTable.number}"
                )
            )

            Result.success("Order moved from Table ${sourceTable.number} to Table ${targetTable.number}")
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
