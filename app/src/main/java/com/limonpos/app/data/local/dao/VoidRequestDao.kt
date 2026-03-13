package com.limonpos.app.data.local.dao

import com.limonpos.app.data.local.entity.VoidRequestEntity
import kotlinx.coroutines.flow.Flow

@androidx.room.Dao
interface VoidRequestDao {
    @androidx.room.Insert(onConflict = androidx.room.OnConflictStrategy.REPLACE)
    suspend fun insert(request: VoidRequestEntity)

    @androidx.room.Query("SELECT * FROM void_requests WHERE status = 'pending' ORDER BY requestedAt ASC")
    fun getPendingRequests(): Flow<List<VoidRequestEntity>>

    @androidx.room.Query("SELECT * FROM void_requests WHERE id = :id")
    suspend fun getById(id: String): VoidRequestEntity?

    @androidx.room.Update
    suspend fun update(request: VoidRequestEntity)

    @androidx.room.Query("DELETE FROM void_requests WHERE id = :id")
    suspend fun deleteById(id: String)

    @androidx.room.Query("DELETE FROM void_requests")
    suspend fun deleteAll()
}
