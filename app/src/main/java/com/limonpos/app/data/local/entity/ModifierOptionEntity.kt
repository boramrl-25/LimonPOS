package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "modifier_options")
data class ModifierOptionEntity(
    @PrimaryKey val id: String,
    val modifierGroupId: String,
    val name: String,
    val price: Double = 0.0
)
