package com.limonpos.app.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

private val Context.currencyDataStore: DataStore<Preferences> by preferencesDataStore(name = "currency_settings")

private val CURRENCY_SYMBOLS = mapOf(
    "AED" to "AED",
    "TRY" to "₺",
    "USD" to "$",
    "EUR" to "€",
    "GBP" to "£",
)

class CurrencyPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val CURRENCY_CODE = stringPreferencesKey("currency_code")
    }

    fun currencySymbolFlow(): Flow<String> = context.currencyDataStore.data.map { prefs ->
        val code = prefs[Keys.CURRENCY_CODE] ?: "AED"
        CURRENCY_SYMBOLS[code] ?: code
    }

    suspend fun setCurrencyCode(code: String) {
        context.currencyDataStore.edit {
            it[Keys.CURRENCY_CODE] = code
        }
    }
}
