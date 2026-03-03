package com.limonpos.app.data.zoho

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject

private val Context.zohoDataStore: DataStore<Preferences> by preferencesDataStore(name = "zoho_books")

class ZohoBooksPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val ENABLED = booleanPreferencesKey("zoho_enabled")
        val ACCESS_TOKEN = stringPreferencesKey("zoho_access_token")
        val ORGANIZATION_ID = stringPreferencesKey("zoho_organization_id")
        val CUSTOMER_ID = stringPreferencesKey("zoho_customer_id")
    }

    val isEnabled: Flow<Boolean> = context.zohoDataStore.data.map {
        it[Keys.ENABLED] ?: false
    }

    val accessToken: Flow<String?> = context.zohoDataStore.data.map {
        it[Keys.ACCESS_TOKEN]
    }

    val organizationId: Flow<String?> = context.zohoDataStore.data.map {
        it[Keys.ORGANIZATION_ID]
    }

    val customerId: Flow<String?> = context.zohoDataStore.data.map {
        it[Keys.CUSTOMER_ID]
    }

    suspend fun isConfigured(): Boolean {
        val token = context.zohoDataStore.data.first()[Keys.ACCESS_TOKEN]
        val orgId = context.zohoDataStore.data.first()[Keys.ORGANIZATION_ID]
        val customerId = context.zohoDataStore.data.first()[Keys.CUSTOMER_ID]
        return !token.isNullOrBlank() && !orgId.isNullOrBlank() && !customerId.isNullOrBlank()
    }

    suspend fun setEnabled(enabled: Boolean) {
        context.zohoDataStore.edit { it[Keys.ENABLED] = enabled }
    }

    suspend fun setCredentials(accessToken: String, organizationId: String, customerId: String) {
        context.zohoDataStore.edit {
            it[Keys.ACCESS_TOKEN] = accessToken
            it[Keys.ORGANIZATION_ID] = organizationId
            it[Keys.CUSTOMER_ID] = customerId
            it[Keys.ENABLED] = true
        }
    }

    suspend fun getAccessToken(): String? = context.zohoDataStore.data.first()[Keys.ACCESS_TOKEN]
    suspend fun getOrganizationId(): String? = context.zohoDataStore.data.first()[Keys.ORGANIZATION_ID]
    suspend fun getCustomerId(): String? = context.zohoDataStore.data.first()[Keys.CUSTOMER_ID]
}
