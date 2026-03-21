package com.limonpos.app.data.remote

import android.util.Log
import com.google.gson.Gson
import com.limonpos.app.data.prefs.ServerPreferences
import com.limonpos.app.data.repository.OrderRepository
import kotlinx.coroutines.flow.first
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Mutfağa gönderilen sipariş snapshot'ını LAN'daki KDS yerel sunucusuna iletir.
 * URL ve secret boşsa hiçbir şey yapmaz (mevcut davranış korunur).
 */
@Singleton
class KdsLanPushService @Inject constructor(
    private val serverPreferences: ServerPreferences,
    private val orderRepository: OrderRepository
) {
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun pushOrderAfterKitchenSend(orderId: String) {
        val base = serverPreferences.getKdsLanBaseUrl().trim().removeSuffix("/")
        val secret = serverPreferences.getKdsPushSecret().trim()
        if (base.isBlank() || secret.isBlank()) return
        val ow = orderRepository.getOrderWithItems(orderId).first() ?: return
        val sentItems = ow.items.filter { it.sentAt != null }
        if (sentItems.isEmpty()) return
        val bodyMap = mapOf(
            "order_id" to ow.order.id,
            "table_number" to ow.order.tableNumber,
            "waiter_name" to (ow.order.waiterName ?: ""),
            "status" to ow.order.status,
            "created_at" to ow.order.createdAt,
            "items" to sentItems.map { item ->
                mapOf(
                    "id" to item.id,
                    "product_name" to item.productName,
                    "quantity" to item.quantity,
                    "notes" to item.notes,
                    "status" to item.status,
                    "sent_at" to item.sentAt
                )
            }
        )
        val json = gson.toJson(bodyMap)
        val url = "$base/api/kds/orders/push"
        try {
            val req = Request.Builder()
                .url(url)
                .addHeader("X-KDS-Secret", secret)
                .post(json.toRequestBody(jsonMedia))
                .build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) {
                    Log.w(TAG, "KDS LAN push failed ${res.code} for $orderId")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "KDS LAN push error: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "KdsLanPush"
    }
}
