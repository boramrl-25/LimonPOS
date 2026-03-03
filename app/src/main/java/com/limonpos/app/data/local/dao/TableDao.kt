package com.limonpos.app.data.local.dao

import androidx.room.*
import com.limonpos.app.data.local.entity.TableEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TableDao {
    @Query("SELECT * FROM tables ORDER BY floor, number")
    fun getAllTables(): Flow<List<TableEntity>>

    @Query("SELECT * FROM tables WHERE floor = :floor ORDER BY number")
    fun getTablesByFloor(floor: String): Flow<List<TableEntity>>

    @Query("SELECT * FROM tables WHERE id = :id")
    suspend fun getTableById(id: String): TableEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTable(table: TableEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTables(tables: List<TableEntity>)

    @Update
    suspend fun updateTable(table: TableEntity)

    @Delete
    suspend fun deleteTable(table: TableEntity)

    @Query("SELECT COUNT(*) FROM tables WHERE floor = :floor AND status = 'free'")
    fun getFreeTableCount(floor: String): Flow<Int>

    @Query("SELECT COUNT(*) FROM tables WHERE floor = :floor AND status = 'occupied'")
    fun getOccupiedTableCount(floor: String): Flow<Int>

    @Query("SELECT * FROM tables WHERE status = 'occupied' ORDER BY floor, number")
    suspend fun getOccupiedTables(): List<TableEntity>

    @Query("SELECT * FROM tables WHERE status = 'bill' ORDER BY floor, number")
    suspend fun getBillTables(): List<TableEntity>

    @Query("SELECT COUNT(*) FROM tables")
    suspend fun getTableCount(): Int

    @Query("SELECT * FROM tables WHERE syncStatus = 'PENDING'")
    suspend fun getPendingTables(): List<TableEntity>

    @Query("UPDATE tables SET status = :status, guestCount = :guestCount, waiterId = :waiterId, waiterName = :waiterName, currentOrderId = :currentOrderId, openedAt = :openedAt, syncStatus = 'PENDING' WHERE id = :tableId")
    suspend fun updateTableStatus(
        tableId: String,
        status: String,
        guestCount: Int,
        waiterId: String?,
        waiterName: String?,
        currentOrderId: String?,
        openedAt: Long?
    )

    @Query("UPDATE tables SET status = 'free', guestCount = 0, waiterId = NULL, waiterName = NULL, currentOrderId = NULL, openedAt = NULL, syncStatus = 'PENDING' WHERE id = :tableId")
    suspend fun clearTable(tableId: String)

    @Query("UPDATE tables SET waiterId = :waiterId, waiterName = :waiterName, syncStatus = 'PENDING' WHERE id = :tableId")
    suspend fun updateTableWaiter(tableId: String, waiterId: String, waiterName: String)

    @Query("DELETE FROM tables")
    suspend fun deleteAll()

    @Query("UPDATE tables SET status = 'free', guestCount = 0, waiterId = NULL, waiterName = NULL, currentOrderId = NULL, openedAt = NULL, syncStatus = 'PENDING'")
    suspend fun resetAllTables()
}
