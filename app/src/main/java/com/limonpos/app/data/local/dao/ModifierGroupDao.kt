package com.limonpos.app.data.local.dao

import androidx.room.*
import com.limonpos.app.data.local.entity.ModifierGroupEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ModifierGroupDao {
    @Query("SELECT * FROM modifier_groups ORDER BY name")
    fun getAllModifierGroups(): Flow<List<ModifierGroupEntity>>

    @Query("SELECT * FROM modifier_groups WHERE id = :id")
    suspend fun getModifierGroupById(id: String): ModifierGroupEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertModifierGroup(group: ModifierGroupEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertModifierGroups(groups: List<ModifierGroupEntity>)

    @Update
    suspend fun updateModifierGroup(group: ModifierGroupEntity)

    @Delete
    suspend fun deleteModifierGroup(group: ModifierGroupEntity)

    @Query("DELETE FROM modifier_groups")
    suspend fun deleteAll()
}
