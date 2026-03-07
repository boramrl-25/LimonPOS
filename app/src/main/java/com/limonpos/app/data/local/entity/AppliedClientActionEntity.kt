package com.limonpos.app.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Records client-side action IDs that have already been applied to avoid duplicate add-to-cart.
 * Same clientActionId applied twice = idempotent (second is no-op).
 */
@Entity(tableName = "applied_client_actions")
data class AppliedClientActionEntity(
    @PrimaryKey
    val id: String
)
