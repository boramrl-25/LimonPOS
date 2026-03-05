package com.limonpos.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.limonpos.app.data.local.entity.VoidLogEntity

@Dao
interface VoidLogDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(log: VoidLogEntity)

    @Query("SELECT * FROM void_logs WHERE syncStatus = 'PENDING' ORDER BY createdAt ASC")
    suspend fun getPendingVoids(): List<VoidLogEntity>

    @Query("SELECT * FROM void_logs ORDER BY createdAt DESC LIMIT 500")
    suspend fun getAllVoids(): List<VoidLogEntity>

    @Query("SELECT * FROM void_logs WHERE type = :type ORDER BY createdAt DESC LIMIT 500")
    suspend fun getVoidsByType(type: String): List<VoidLogEntity>

    @Query("SELECT * FROM void_logs WHERE createdAt >= :since ORDER BY createdAt DESC")
    suspend fun getVoidsSince(since: Long): List<VoidLogEntity>

    @Query("SELECT * FROM void_logs WHERE type IN ('refund', 'refund_full') AND createdAt >= :since ORDER BY createdAt DESC")
    suspend fun getRefundsSince(since: Long): List<VoidLogEntity>

    @Query("SELECT COUNT(*) > 0 FROM void_logs WHERE type = 'recalled_void' AND orderId = :orderId")
    suspend fun existsRecalledForOrder(orderId: String): Boolean

    /** All voided/refunded item ids for a given order (used to keep voids after web→app sync). */
    @Query(
        "SELECT orderItemId FROM void_logs " +
            "WHERE orderId = :orderId " +
            "AND orderItemId IS NOT NULL " +
            "AND type IN ('post_void','refund','refund_full')"
    )
    suspend fun getVoidedItemIdsForOrder(orderId: String): List<String>

    @Query("UPDATE void_logs SET syncStatus = 'SYNCED' WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("DELETE FROM void_logs")
    suspend fun deleteAll()

    @Query("DELETE FROM void_logs WHERE orderId IN (:orderIds)")
    suspend fun deleteByOrderIds(orderIds: List<String>)
}
