package com.limonpos.app.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject

private val Context.appSettingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "app_settings")

/**
 * Single source of truth for app-level settings used by overdue warning.
 * Key: overdue_undelivered_default_minutes (1..1440). When not set, default 10 is used.
 */
class AppSettingsPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val OVERDUE_UNDELIVERED_DEFAULT_MINUTES = intPreferencesKey("overdue_undelivered_default_minutes")
    }

    val overdueUndeliveredDefaultMinutes: Flow<Int> = context.appSettingsDataStore.data.map { prefs ->
        (prefs[Keys.OVERDUE_UNDELIVERED_DEFAULT_MINUTES] ?: DEFAULT_MINUTES).coerceIn(MIN_MINUTES, MAX_MINUTES)
    }

    suspend fun getOverdueUndeliveredDefaultMinutes(): Int {
        val v = context.appSettingsDataStore.data.first()[Keys.OVERDUE_UNDELIVERED_DEFAULT_MINUTES]
        return (v ?: DEFAULT_MINUTES).coerceIn(MIN_MINUTES, MAX_MINUTES)
    }

    suspend fun setOverdueUndeliveredDefaultMinutes(minutes: Int) {
        val value = minutes.coerceIn(MIN_MINUTES, MAX_MINUTES)
        context.appSettingsDataStore.edit { it[Keys.OVERDUE_UNDELIVERED_DEFAULT_MINUTES] = value }
    }

    /** Persist value from API so next offline use has last known good value. */
    suspend fun setOverdueUndeliveredDefaultMinutesFromApi(minutes: Int) {
        val value = minutes.coerceIn(MIN_MINUTES, MAX_MINUTES)
        context.appSettingsDataStore.edit { it[Keys.OVERDUE_UNDELIVERED_DEFAULT_MINUTES] = value }
    }

    companion object {
        const val DEFAULT_MINUTES = 10
        const val MIN_MINUTES = 1
        const val MAX_MINUTES = 1440
    }
}
