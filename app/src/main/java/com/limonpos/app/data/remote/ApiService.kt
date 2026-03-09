package com.limonpos.app.data.remote

import com.limonpos.app.data.remote.dto.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @POST("auth/verify-cash-drawer")
    suspend fun verifyCashDrawer(@Body request: CashDrawerVerifyRequest): Response<CashDrawerVerifyResponse>

    @GET("users")
    suspend fun getUsers(): Response<List<UserDto>>

    @POST("users")
    suspend fun createUser(@Body user: UserDto): Response<UserDto>

    @PUT("users/{id}")
    suspend fun updateUser(@Path("id") id: String, @Body user: UserDto): Response<UserDto>

    @DELETE("users/{id}")
    suspend fun deleteUser(@Path("id") id: String): Response<Unit>

    @GET("tables")
    suspend fun getTables(): Response<List<TableDto>>

    @GET("floor-plan-sections")
    suspend fun getFloorPlanSections(): Response<Map<String, List<Double>>>

    @POST("tables")
    suspend fun createTable(@Body table: TableDto): Response<TableDto>

    @POST("tables/{id}/open")
    suspend fun openTable(
        @Path("id") id: String,
        @Query("guest_count") guestCount: Int,
        @Query("waiter_id") waiterId: String
    ): Response<TableDto>

    @POST("tables/{id}/close")
    suspend fun closeTable(@Path("id") id: String): Response<TableDto>

    @PUT("tables/{id}")
    suspend fun updateTable(
        @Path("id") id: String,
        @Body body: Map<String, Any?>
    ): Response<TableDto>

    @POST("tables/{id}/reserve")
    suspend fun reserveTable(
        @Path("id") id: String,
        @Body body: Map<String, Any?>
    ): Response<TableReservationDto>

    @POST("tables/{id}/reservation/cancel")
    suspend fun cancelTableReservation(
        @Path("id") id: String,
        @Body body: Map<String, Any?>
    ): Response<Unit>

    @GET("categories")
    suspend fun getCategories(): Response<List<CategoryDto>>

    @POST("categories")
    suspend fun createCategory(@Body category: CategoryDto): Response<CategoryDto>

    @PUT("categories/{id}")
    suspend fun updateCategory(@Path("id") id: String, @Body category: CategoryDto): Response<CategoryDto>

    @DELETE("categories/{id}")
    suspend fun deleteCategory(@Path("id") id: String): Response<Unit>

    @GET("products")
    suspend fun getProducts(): Response<List<ProductDto>>

    @POST("products")
    suspend fun createProduct(@Body product: ProductDto): Response<ProductDto>

    @PUT("products/{id}")
    suspend fun updateProduct(@Path("id") id: String, @Body product: ProductDto): Response<ProductDto>

    @DELETE("products/{id}")
    suspend fun deleteProduct(@Path("id") id: String): Response<Unit>

    @GET("orders/{id}")
    suspend fun getOrder(@Path("id") id: String): Response<OrderDto>

    @POST("orders")
    suspend fun createOrder(
        @Query("waiter_id") waiterId: String,
        @Body request: CreateOrderRequest
    ): Response<OrderDto>

    @POST("orders/{id}/items")
    suspend fun addOrderItem(
        @Path("id") orderId: String,
        @Body item: AddOrderItemRequest
    ): Response<OrderItemDto>

    @PUT("orders/{orderId}/items/{itemId}")
    suspend fun updateOrderItem(
        @Path("orderId") orderId: String,
        @Path("itemId") itemId: String,
        @Body item: AddOrderItemRequest
    ): Response<OrderItemDto>

    @DELETE("orders/{orderId}/items/{itemId}")
    suspend fun deleteOrderItem(
        @Path("orderId") orderId: String,
        @Path("itemId") itemId: String
    ): Response<Unit>

    @PUT("orders/{orderId}/items/{itemId}/status")
    suspend fun updateOrderItemStatus(
        @Path("orderId") orderId: String,
        @Path("itemId") itemId: String,
        @Body body: OrderItemStatusRequest
    ): Response<OrderItemDto>

    @POST("orders/{id}/send")
    suspend fun sendOrderToKitchen(@Path("id") id: String): Response<OrderDto>

    @POST("orders/{id}/discount-request")
    suspend fun createDiscountRequest(
        @Path("id") orderId: String,
        @Body body: DiscountRequestRequest
    ): Response<DiscountRequestResponse>

    @GET("orders/{id}/discount-request")
    suspend fun getDiscountRequestForOrder(@Path("id") orderId: String): Response<DiscountRequestWrapper>

    @POST("payments")
    suspend fun createPayment(
        @Query("user_id") userId: String,
        @Body request: CreatePaymentRequest
    ): Response<PaymentDto>

    @GET("printers")
    suspend fun getPrinters(): Response<List<PrinterDto>>

    @POST("printers")
    suspend fun createPrinter(@Body printer: PrinterDto): Response<PrinterDto>

    @PUT("printers/{id}")
    suspend fun updatePrinter(@Path("id") id: String, @Body printer: PrinterDto): Response<PrinterDto>

    @PUT("printers/{id}/status")
    suspend fun updatePrinterStatus(
        @Path("id") id: String,
        @Query("status") status: String
    ): Response<PrinterDto>

    @DELETE("printers/{id}")
    suspend fun deletePrinter(@Path("id") id: String): Response<Unit>

    @GET("modifier-groups")
    suspend fun getModifierGroups(): Response<List<ModifierGroupDto>>

    @POST("voids")
    suspend fun createVoid(@Body request: CreateVoidRequest): Response<Any>

    @GET("void-requests")
    suspend fun getVoidRequests(@Query("status") status: String = "pending"): Response<List<VoidRequestDto>>

    @POST("void-requests")
    suspend fun createVoidRequest(@Body request: CreateVoidRequestDto): Response<VoidRequestDto>

    @PATCH("void-requests/{id}")
    suspend fun updateVoidRequest(@Path("id") id: String, @Body request: VoidRequestDto): Response<VoidRequestDto>

    @GET("closed-bill-access-requests")
    suspend fun getClosedBillAccessRequests(@Query("status") status: String = "pending"): Response<List<ClosedBillAccessRequestDto>>

    @POST("closed-bill-access-requests")
    suspend fun createClosedBillAccessRequest(@Body request: CreateClosedBillAccessRequestDto): Response<ClosedBillAccessRequestDto>

    @PATCH("closed-bill-access-requests/{id}")
    suspend fun updateClosedBillAccessRequest(@Path("id") id: String, @Body request: ClosedBillAccessRequestDto): Response<ClosedBillAccessRequestDto>

    @POST("devices/heartbeat")
    suspend fun sendHeartbeat(@Body request: HeartbeatRequest): Response<HeartbeatResponse>

    @POST("devices/ack-clear")
    suspend fun ackClearLocalData(@Body request: AckClearRequest): Response<Unit>

    @GET("settings")
    suspend fun getSettings(): Response<SettingsDto>

    @GET("daily-cash-entry")
    suspend fun getDailyCashEntry(@Query("date") date: String?): Response<DailyCashEntryResponse>

    @POST("daily-cash-entry")
    suspend fun postDailyCashEntry(@Body body: DailyCashEntryRequest): Response<DailyCashEntryDto>

    /** POS cihazını web’de “çevrimiçi” göstermek için heartbeat (senkron sırasında çağrılır). */
}
