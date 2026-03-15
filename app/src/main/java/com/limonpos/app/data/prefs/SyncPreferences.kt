package com.limonpos.app.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import javax.inject.Inject

private val Context.syncDataStore: DataStore<Preferences> by preferencesDataStore(name = "sync")

/**
 * Stores last successful sync timestamp for Delta Sync.
 * Son 1 dakika içinde sync yapılırsa full sync yerine delta sync denenir.
 */
class SyncPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val LAST_SYNC_TIMESTAMP = longPreferencesKey("last_sync_timestamp")
        val LAST_LOCAL_SALES_CLEARED_AT = longPreferencesKey("last_local_sales_cleared_at")
    }

    companion object {
        /** Cooldown after clear local sales: don't repopulate from API for 3 minutes. */
        private const val SALES_CLEARED_COOLDOWN_MS = 3 * 60 * 1000L
    }

    suspend fun getLastSyncTimestamp(): Long {
        return context.syncDataStore.data.first()[Keys.LAST_SYNC_TIMESTAMP] ?: 0L
    }

    suspend fun setLastSyncTimestamp(timestampMs: Long) {
        context.syncDataStore.edit { it[Keys.LAST_SYNC_TIMESTAMP] = timestampMs }
    }

    suspend fun setLastLocalSalesClearedAt(timestampMs: Long) {
        context.syncDataStore.edit { it[Keys.LAST_LOCAL_SALES_CLEARED_AT] = timestampMs }
    }

    suspend fun isInSalesClearedCooldown(): Boolean {
        val clearedAt = context.syncDataStore.data.first()[Keys.LAST_LOCAL_SALES_CLEARED_AT] ?: 0L
        if (clearedAt <= 0) return false
        return (System.currentTimeMillis() - clearedAt) < SALES_CLEARED_COOLDOWN_MS
    }
}
