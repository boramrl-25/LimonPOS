package com.limonpos.app.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.util.UUID
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
        val API_BASE_URL_SECONDARY = stringPreferencesKey("api_base_url_secondary")
        val API_BASE_URL_TERTIARY = stringPreferencesKey("api_base_url_tertiary")
        val DEVICE_ID = stringPreferencesKey("device_id")
    }

    private fun isBlockedUrl(url: String): Boolean {
        val lower = url.lowercase()
        return lower.contains("emergentagent") ||
            lower.contains("table-order-sync") ||
            lower.contains("preview.emergentagent")
    }

    private fun resolveBaseUrl(stored: String?): String {
        val raw = stored ?: DEFAULT_BASE_URL
        if (isBlockedUrl(raw)) return DEFAULT_BASE_URL
        // Migrate api2.the-limon.com -> api.the-limon.com (standard API domain)
        if (raw.contains("api2.the-limon.com")) {
            return raw.replace("api2.the-limon.com", "api.the-limon.com")
        }
        return raw
    }

    val baseUrl: Flow<String> = context.serverDataStore.data.map {
        resolveBaseUrl(it[Keys.API_BASE_URL])
    }

    val secondaryBaseUrl: Flow<String> = context.serverDataStore.data.map { prefs ->
        val v = prefs[Keys.API_BASE_URL_SECONDARY]
        if (v.isNullOrBlank() || isBlockedUrl(v)) "" else resolveBaseUrl(v)
    }
    val tertiaryBaseUrl: Flow<String> = context.serverDataStore.data.map { prefs ->
        val v = prefs[Keys.API_BASE_URL_TERTIARY]
        if (v.isNullOrBlank() || isBlockedUrl(v)) "" else resolveBaseUrl(v)
    }

    suspend fun getBaseUrl(): String {
        return resolveBaseUrl(context.serverDataStore.data.first()[Keys.API_BASE_URL])
    }

    /** Hibrit mimari: Primary → Secondary → Tertiary (Cloud) sırayla denenir. Boş olanlar atlanır. */
    suspend fun getBaseUrlList(): List<String> {
        val primary = getBaseUrl()
        val secondary = getSecondaryBaseUrl()
        val tertiary = getTertiaryBaseUrl()
        return listOfNotNull(
            primary,
            secondary.takeIf { it.isNotBlank() && it != primary },
            tertiary.takeIf { it.isNotBlank() && it != primary && it != secondary }
        )
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

    suspend fun setSecondaryBaseUrl(url: String?) {
        val normalized = url?.trim()?.let { normalizeUrl(it) } ?: ""
        context.serverDataStore.edit {
            if (normalized.isBlank()) it.remove(Keys.API_BASE_URL_SECONDARY)
            else it[Keys.API_BASE_URL_SECONDARY] = normalized
        }
    }

    suspend fun setTertiaryBaseUrl(url: String?) {
        val normalized = url?.trim()?.let { normalizeUrl(it) } ?: ""
        context.serverDataStore.edit {
            if (normalized.isBlank()) it.remove(Keys.API_BASE_URL_TERTIARY)
            else it[Keys.API_BASE_URL_TERTIARY] = normalized
        }
    }

    suspend fun getSecondaryBaseUrl(): String {
        val v = context.serverDataStore.data.first()[Keys.API_BASE_URL_SECONDARY]
        return if (v.isNullOrBlank() || isBlockedUrl(v)) "" else resolveBaseUrl(v)
    }
    suspend fun getTertiaryBaseUrl(): String {
        val v = context.serverDataStore.data.first()[Keys.API_BASE_URL_TERTIARY]
        return if (v.isNullOrBlank() || isBlockedUrl(v)) "" else resolveBaseUrl(v)
    }

    private fun normalizeUrl(trimmed: String): String = when {
        trimmed.isBlank() -> ""
        isBlockedUrl(trimmed) -> ""
        trimmed.equals("localhost", ignoreCase = true) ||
        trimmed.equals("localhost:3000", ignoreCase = true) ||
        trimmed.equals("http://localhost", ignoreCase = true) ||
        trimmed.equals("http://localhost:3000", ignoreCase = true) ||
        trimmed.equals("http://localhost/", ignoreCase = true) ||
        trimmed.equals("http://localhost:3000/", ignoreCase = true) -> DEFAULT_BASE_URL
        trimmed.startsWith("http://") || trimmed.startsWith("https://") ->
            if (trimmed.endsWith("/")) trimmed else "$trimmed/"
        else -> "http://${trimmed.removeSuffix("/")}:3002/api/"
    }

    /** Stable device id for heartbeat; generated once per install. */
    suspend fun getDeviceId(): String {
        var id = context.serverDataStore.data.first()[Keys.DEVICE_ID]
        if (id.isNullOrBlank()) {
            id = "android_${UUID.randomUUID().toString().take(12)}"
            context.serverDataStore.edit { it[Keys.DEVICE_ID] = id }
        }
        return id
    }

    companion object {
        /** Backend API - api.the-limon.com (Hetzner). Lokal: http://10.0.2.2:3002/api/ */
        const val DEFAULT_BASE_URL = "https://api.the-limon.com/api/"
    }
}
