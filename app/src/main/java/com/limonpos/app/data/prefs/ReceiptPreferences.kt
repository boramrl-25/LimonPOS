package com.limonpos.app.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import javax.inject.Inject

private val Context.receiptDataStore: DataStore<Preferences> by preferencesDataStore(name = "receipt_settings")

data class ReceiptSettingsData(
    val companyName: String,
    val companyAddress: String,
    val receiptHeader: String,
    val receiptFooterMessage: String,
    val kitchenHeader: String
) {
    companion object {
        val DEFAULT = ReceiptSettingsData(
            companyName = "",
            companyAddress = "",
            receiptHeader = "BILL / RECEIPT",
            receiptFooterMessage = "Thank you!",
            kitchenHeader = "KITCHEN"
        )
    }
}

class ReceiptPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val COMPANY_NAME = stringPreferencesKey("company_name")
        val COMPANY_ADDRESS = stringPreferencesKey("company_address")
        val RECEIPT_HEADER = stringPreferencesKey("receipt_header")
        val RECEIPT_FOOTER_MESSAGE = stringPreferencesKey("receipt_footer_message")
        val KITCHEN_HEADER = stringPreferencesKey("kitchen_header")
    }

    suspend fun getReceiptSettings(): ReceiptSettingsData {
        val prefs = context.receiptDataStore.data.first()
        return ReceiptSettingsData(
            companyName = prefs[Keys.COMPANY_NAME] ?: "",
            companyAddress = prefs[Keys.COMPANY_ADDRESS] ?: "",
            receiptHeader = prefs[Keys.RECEIPT_HEADER]?.takeIf { it.isNotBlank() } ?: "BILL / RECEIPT",
            receiptFooterMessage = prefs[Keys.RECEIPT_FOOTER_MESSAGE]?.takeIf { it.isNotBlank() } ?: "Thank you!",
            kitchenHeader = prefs[Keys.KITCHEN_HEADER]?.takeIf { it.isNotBlank() } ?: "KITCHEN"
        )
    }

    suspend fun setReceiptSettings(data: ReceiptSettingsData) {
        context.receiptDataStore.edit {
            it[Keys.COMPANY_NAME] = data.companyName
            it[Keys.COMPANY_ADDRESS] = data.companyAddress
            it[Keys.RECEIPT_HEADER] = data.receiptHeader
            it[Keys.RECEIPT_FOOTER_MESSAGE] = data.receiptFooterMessage
            it[Keys.KITCHEN_HEADER] = data.kitchenHeader
        }
    }
}
