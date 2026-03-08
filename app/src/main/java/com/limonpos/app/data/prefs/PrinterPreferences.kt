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

private val Context.printerDataStore: DataStore<Preferences> by preferencesDataStore(name = "printer")

/**
 * 0 = normal, 1 = large (2x height), 2 = xlarge (2x width+height)
 */
object ReceiptItemSize {
    const val NORMAL = 0
    const val LARGE = 1
    const val XLARGE = 2
}

class PrinterPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val RECEIPT_ITEM_SIZE = intPreferencesKey("receipt_item_size")
    }

    val receiptItemSize: Flow<Int> = context.printerDataStore.data.map {
        it[Keys.RECEIPT_ITEM_SIZE] ?: ReceiptItemSize.NORMAL
    }

    suspend fun getReceiptItemSize(): Int =
        context.printerDataStore.data.first()[Keys.RECEIPT_ITEM_SIZE] ?: ReceiptItemSize.NORMAL

    suspend fun setReceiptItemSize(size: Int) {
        context.printerDataStore.edit {
            it[Keys.RECEIPT_ITEM_SIZE] = size.coerceIn(ReceiptItemSize.NORMAL, ReceiptItemSize.XLARGE)
        }
    }
}
