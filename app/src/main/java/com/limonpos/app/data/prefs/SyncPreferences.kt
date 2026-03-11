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
    }

    suspend fun getLastSyncTimestamp(): Long {
        return context.syncDataStore.data.first()[Keys.LAST_SYNC_TIMESTAMP] ?: 0L
    }

    suspend fun setLastSyncTimestamp(timestampMs: Long) {
        context.syncDataStore.edit { it[Keys.LAST_SYNC_TIMESTAMP] = timestampMs }
    }
}
