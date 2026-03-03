package com.limonpos.app.data.zoho

import android.util.Log
import com.limonpos.app.data.local.entity.OrderEntity
import com.limonpos.app.data.local.entity.OrderItemEntity
import kotlinx.coroutines.flow.first
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

class ZohoBooksRepository @Inject constructor(
    private val zohoPreferences: ZohoBooksPreferences,
    private val zohoBooksApi: ZohoBooksApi
) {

    suspend fun isReady(): Boolean {
        if (!zohoPreferences.isEnabled.first()) return false
        return zohoPreferences.isConfigured()
    }

    /**
     * Pushes a completed order to Zoho Books as a Sales Receipt.
     * Call when order is fully paid (masa kapatıldığında).
     */
    suspend fun pushSalesReceipt(
        order: OrderEntity,
        items: List<OrderItemEntity>,
        paymentMethod: String = "cash"
    ): Boolean {
        if (!isReady()) return false
        val token = zohoPreferences.getAccessToken()
        val orgId = zohoPreferences.getOrganizationId()
        val customerId = zohoPreferences.getCustomerId()
        if (token.isNullOrBlank() || orgId.isNullOrBlank() || customerId.isNullOrBlank()) return false

        val lineItems = items.map { item ->
            ZohoLineItem(
                name = item.productName,
                description = item.notes.takeIf { it.isNotBlank() },
                quantity = item.quantity.toDouble(),
                rate = item.price
            )
        }
        if (lineItems.isEmpty()) return false

        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val date = dateFormat.format(Date(order.paidAt ?: order.createdAt))

        val zohoPaymentMode = when (paymentMethod.lowercase()) {
            "card" -> "credit_card"
            "cash" -> "cash"
            else -> "cash"
        }

        val request = ZohoSalesReceiptRequest(
            customer_id = customerId,
            date = date,
            payment_mode = zohoPaymentMode,
            reference_number = "LimonPOS-${order.id}",
            line_items = lineItems
        )

        return try {
            val response = zohoBooksApi.createSalesReceipt(orgId, request)
            if (response.isSuccessful) {
                Log.d("ZohoBooks", "Sales receipt created: ${response.body()?.salesreceipt?.receipt_number}")
                true
            } else {
                Log.e("ZohoBooks", "Failed: ${response.code()} ${response.errorBody()?.string()}")
                false
            }
        } catch (e: Exception) {
            Log.e("ZohoBooks", "Error: ${e.message}", e)
            false
        }
    }
}
