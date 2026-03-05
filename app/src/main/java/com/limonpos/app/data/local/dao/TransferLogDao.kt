package com.limonpos.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.limonpos.app.data.local.entity.TransferLog
import kotlinx.coroutines.flow.Flow

@Dao
interface TransferLogDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(log: TransferLog)

    @Query("SELECT * FROM transfer_logs ORDER BY createdAt DESC")
    fun getAllLogs(): Flow<List<TransferLog>>

    @Query("DELETE FROM transfer_logs")
    suspend fun deleteAll()

    @Query("DELETE FROM transfer_logs WHERE orderId IN (:orderIds)")
    suspend fun deleteByOrderIds(orderIds: List<String>)
}

