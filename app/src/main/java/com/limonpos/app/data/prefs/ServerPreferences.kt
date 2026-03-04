package com.limonpos.app.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject

private val Context.serverDataStore: DataStore<Preferences> by preferencesDataStore(name = "server")

/**
 * Stores the API server URL. When WiFi changes, user must update this to the computer's IP.
 * Emulator: http://10.0.2.2:3002/api/
 * Real device: http://192.168.x.x:3002/api/ (computer's IP on same WiFi)
 */
class ServerPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val API_BASE_URL = stringPreferencesKey("api_base_url")
    }

    private fun isBlockedUrl(url: String): Boolean {
        val lower = url.lowercase()
        return lower.contains("emergentagent") ||
            lower.contains("table-order-sync") ||
            lower.contains("preview.emergentagent")
    }

    private fun resolveBaseUrl(stored: String?): String {
        val url = stored ?: DEFAULT_BASE_URL
        if (isBlockedUrl(url)) return DEFAULT_BASE_URL
        return url
    }

    val baseUrl: Flow<String> = context.serverDataStore.data.map {
        resolveBaseUrl(it[Keys.API_BASE_URL])
    }

    suspend fun getBaseUrl(): String {
        return resolveBaseUrl(context.serverDataStore.data.first()[Keys.API_BASE_URL])
    }

    suspend fun setBaseUrl(url: String) {
        val trimmed = url.trim()
        if (isBlockedUrl(trimmed)) {
            context.serverDataStore.edit { it.remove(Keys.API_BASE_URL) }
            return
        }
        val normalized = when {
            trimmed.isBlank() -> DEFAULT_BASE_URL
            trimmed.equals("localhost", ignoreCase = true) ||
            trimmed.equals("localhost:3000", ignoreCase = true) ||
            trimmed.equals("http://localhost", ignoreCase = true) ||
            trimmed.equals("http://localhost:3000", ignoreCase = true) ||
            trimmed.equals("http://localhost/", ignoreCase = true) ||
            trimmed.equals("http://localhost:3000/", ignoreCase = true) -> {
                // Web (3000) ve Zoho aynı backend'i (3002) kullanır; emulator için 10.0.2.2
                DEFAULT_BASE_URL
            }
            trimmed.startsWith("http://") || trimmed.startsWith("https://") -> {
                if (trimmed.endsWith("/")) trimmed else "$trimmed/"
            }
            else -> {
                val clean = trimmed.removeSuffix("/")
                "http://$clean:3002/api/"
            }
        }
        context.serverDataStore.edit { it[Keys.API_BASE_URL] = normalized }
    }

    companion object {
        /** Backend API - api.the-limon.com. Lokal: http://10.0.2.2:3002/api/ */
        const val DEFAULT_BASE_URL = "https://api.the-limon.com/api/"
    }
}
