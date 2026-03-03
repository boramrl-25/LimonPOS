package com.limonpos.app.data.zoho

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Query

interface ZohoBooksApi {

    @POST("salesreceipts")
    suspend fun createSalesReceipt(
        @Query("organization_id") organizationId: String,
        @Body body: ZohoSalesReceiptRequest
    ): Response<ZohoSalesReceiptResponse>
}

data class ZohoSalesReceiptRequest(
    val customer_id: String,
    val date: String,
    val payment_mode: String,
    val reference_number: String? = null,
    val line_items: List<ZohoLineItem>
)

data class ZohoLineItem(
    val name: String,
    val description: String? = null,
    val quantity: Double,
    val rate: Double
)

data class ZohoSalesReceiptResponse(
    val code: Int? = null,
    val message: String? = null,
    val salesreceipt: ZohoSalesReceipt? = null
)

data class ZohoSalesReceipt(
    val salesreceipt_id: String? = null,
    val receipt_number: String? = null
)
