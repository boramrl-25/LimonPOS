package com.limonpos.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.limonpos.app.data.local.entity.AppliedClientActionEntity

@Dao
interface AppliedClientActionDao {
    @Query("SELECT COUNT(*) FROM applied_client_actions WHERE id = :actionId")
    suspend fun countById(actionId: String): Int

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(entity: AppliedClientActionEntity)
}
