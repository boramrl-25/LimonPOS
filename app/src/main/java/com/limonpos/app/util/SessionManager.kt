package com.limonpos.app.util

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

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "session")

class SessionManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val USER_ID = stringPreferencesKey("user_id")
        val USER_NAME = stringPreferencesKey("user_name")
        val USER_ROLE = stringPreferencesKey("user_role")
        val USER_PIN = stringPreferencesKey("user_pin")
        val CASH_DRAWER_PERMISSION = stringPreferencesKey("cash_drawer_permission")
        val CAN_ACCESS_SETTINGS = stringPreferencesKey("can_access_settings")
    }

    val currentUserId: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[Keys.USER_ID]
    }

    val currentUserRole: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[Keys.USER_ROLE]
    }

    val isLoggedIn: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.USER_ID] != null
    }

    suspend fun login(userId: String, userName: String, userRole: String, userPin: String, cashDrawerPermission: Boolean, canAccessSettings: Boolean = true) {
        context.dataStore.edit { prefs ->
            prefs[Keys.USER_ID] = userId
            prefs[Keys.USER_NAME] = userName
            prefs[Keys.USER_ROLE] = userRole
            prefs[Keys.USER_PIN] = userPin
            prefs[Keys.CASH_DRAWER_PERMISSION] = cashDrawerPermission.toString()
            prefs[Keys.CAN_ACCESS_SETTINGS] = canAccessSettings.toString()
        }
    }

    suspend fun logout() {
        context.dataStore.edit { prefs ->
            prefs.remove(Keys.USER_ID)
            prefs.remove(Keys.USER_NAME)
            prefs.remove(Keys.USER_ROLE)
            prefs.remove(Keys.USER_PIN)
            prefs.remove(Keys.CASH_DRAWER_PERMISSION)
            prefs.remove(Keys.CAN_ACCESS_SETTINGS)
        }
    }

    suspend fun getUserId(): String? = context.dataStore.data.first()[Keys.USER_ID]
    suspend fun getUserPin(): String? = context.dataStore.data.first()[Keys.USER_PIN]

    suspend fun getUserName(): String? = context.dataStore.data.first()[Keys.USER_NAME]

    fun getUserIdFlow(): Flow<String?> = currentUserId

    fun getUserNameFlow(): Flow<String?> = context.dataStore.data.map { it[Keys.USER_NAME] }
    fun getUserRoleFlow(): Flow<String?> = context.dataStore.data.map { it[Keys.USER_ROLE] }
    fun getCashDrawerPermissionFlow(): Flow<Boolean> = context.dataStore.data.map {
        it[Keys.CASH_DRAWER_PERMISSION] == "true"
    }

    fun getCanAccessSettingsFlow(): Flow<Boolean> = context.dataStore.data.map {
        it[Keys.CAN_ACCESS_SETTINGS] != "false"
    }
}
