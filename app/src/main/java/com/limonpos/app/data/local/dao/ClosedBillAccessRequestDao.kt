package com.limonpos.app.data.local.dao

import com.limonpos.app.data.local.entity.ClosedBillAccessRequestEntity
import kotlinx.coroutines.flow.Flow

@androidx.room.Dao
interface ClosedBillAccessRequestDao {
    @androidx.room.Insert(onConflict = androidx.room.OnConflictStrategy.REPLACE)
    suspend fun insert(request: ClosedBillAccessRequestEntity)

    @androidx.room.Query("SELECT * FROM closed_bill_access_requests WHERE status = 'pending' ORDER BY requestedAt ASC")
    fun getPendingRequests(): Flow<List<ClosedBillAccessRequestEntity>>

    @androidx.room.Query("SELECT * FROM closed_bill_access_requests WHERE requestedByUserId = :userId AND status = 'approved' ORDER BY approvedAt DESC LIMIT 1")
    suspend fun getLatestApprovedByUser(userId: String): ClosedBillAccessRequestEntity?

    @androidx.room.Query("SELECT * FROM closed_bill_access_requests WHERE id = :id")
    suspend fun getById(id: String): ClosedBillAccessRequestEntity?

    @androidx.room.Update
    suspend fun update(request: ClosedBillAccessRequestEntity)

    @androidx.room.Query("DELETE FROM closed_bill_access_requests")
    suspend fun deleteAll()
}
