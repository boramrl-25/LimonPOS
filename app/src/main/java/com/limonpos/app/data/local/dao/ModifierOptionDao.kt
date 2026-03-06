package com.limonpos.app.data.local.dao

import androidx.room.*
import com.limonpos.app.data.local.entity.ModifierOptionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ModifierOptionDao {
    @Query("SELECT * FROM modifier_options WHERE modifierGroupId = :groupId ORDER BY name")
    fun getOptionsByGroupId(groupId: String): Flow<List<ModifierOptionEntity>>

    @Query("SELECT * FROM modifier_options ORDER BY modifierGroupId, name")
    fun getAllModifierOptions(): Flow<List<ModifierOptionEntity>>

    @Query("SELECT * FROM modifier_options WHERE id = :id")
    suspend fun getModifierOptionById(id: String): ModifierOptionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertModifierOption(option: ModifierOptionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertModifierOptions(options: List<ModifierOptionEntity>)

    @Update
    suspend fun updateModifierOption(option: ModifierOptionEntity)

    @Delete
    suspend fun deleteModifierOption(option: ModifierOptionEntity)

    @Query("DELETE FROM modifier_options WHERE modifierGroupId = :groupId")
    suspend fun deleteOptionsByGroupId(groupId: String)

    @Query("DELETE FROM modifier_options")
    suspend fun deleteAll()
}
