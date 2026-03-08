package com.limonpos.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.limonpos.app.data.local.entity.PendingOrderItemDeleteEntity

@Dao
interface PendingOrderItemDeleteDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: PendingOrderItemDeleteEntity)

    @Query("SELECT * FROM pending_order_item_deletes ORDER BY createdAt")
    suspend fun getAll(): List<PendingOrderItemDeleteEntity>

    @Query("SELECT apiItemId FROM pending_order_item_deletes WHERE orderId = :orderId")
    suspend fun getApiItemIdsForOrder(orderId: String): List<String>

    @Query("DELETE FROM pending_order_item_deletes WHERE orderId = :orderId AND apiItemId = :apiItemId")
    suspend fun delete(orderId: String, apiItemId: String)

    @Query("DELETE FROM pending_order_item_deletes")
    suspend fun deleteAll()
}
