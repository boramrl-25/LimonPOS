package com.limonpos.app.data.repository

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.gson.Gson
import com.limonpos.app.data.local.dao.*
import com.limonpos.app.data.local.entity.*
import com.limonpos.app.data.prefs.CurrencyPreferences
import com.limonpos.app.data.prefs.FloorPlanSectionsPreferences
import com.limonpos.app.data.prefs.PrinterPreferences
import com.limonpos.app.data.prefs.ReceiptItemSize
import com.limonpos.app.data.prefs.ReceiptPreferences
import com.limonpos.app.data.prefs.ReceiptSettingsData
import com.limonpos.app.data.prefs.ServerPreferences
import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.remote.AuthTokenProvider
import com.limonpos.app.data.remote.dto.*
import com.limonpos.app.util.NetworkMonitor
import com.limonpos.app.util.SessionManager
import kotlinx.coroutines.flow.Flow
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import javax.inject.Inject

class ApiSyncRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val networkMonitor: NetworkMonitor,
    private val tableDao: TableDao,
    private val categoryDao: CategoryDao,
    private val productDao: ProductDao,
    private val orderDao: OrderDao,
    private val orderItemDao: OrderItemDao,
    private val printerDao: PrinterDao,
    private val paymentDao: PaymentDao,
    private val userDao: UserDao,
    private val modifierGroupDao: ModifierGroupDao,
    private val modifierOptionDao: ModifierOptionDao,
    private val voidLogDao: VoidLogDao,
    private val voidRequestDao: VoidRequestDao,
    private val closedBillAccessRequestDao: ClosedBillAccessRequestDao,
    private val pendingOrderItemDeleteDao: PendingOrderItemDeleteDao,
    private val transferLogDao: TransferLogDao,
    private val floorPlanSectionsPreferences: FloorPlanSectionsPreferences,
    private val receiptPreferences: ReceiptPreferences,
    private val currencyPreferences: CurrencyPreferences,
    private val printerPreferences: PrinterPreferences,
    private val serverPreferences: ServerPreferences,
    private val sessionManager: SessionManager,
    private val authTokenProvider: AuthTokenProvider,
    private val authRepository: AuthRepository
) {
    suspend fun isOnline(): Boolean = networkMonitor.isOnline.first()

    /** Uygulama yeniden başlayınca token bellekten silinir; SessionManager'daki PIN ile geri yükle ki sync 401 almasın. */
    private suspend fun restoreAuthTokenIfNeeded() {
        if (!authTokenProvider.getToken().isNullOrBlank()) return
        val pin = sessionManager.getUserPin()
        if (!pin.isNullOrBlank()) authTokenProvider.setToken(pin)
    }

    /** 401 alındığında login API ile yeni token al. */
    private suspend fun refreshTokenFromLogin(): Boolean {
        val pin = sessionManager.getUserPin() ?: return false
        return try {
            val loginRes = apiService.login(LoginRequest(pin = pin))
            if (loginRes.isSuccessful) {
                val token = loginRes.body()?.token ?: pin
                authTokenProvider.setToken(token)
                Log.d("ApiSync", "Token refreshed via login")
                true
            } else false
        } catch (e: Exception) {
            Log.e("ApiSync", "refreshToken failed: ${e.message}")
            false
        }
    }

    /** Clears all sales data from local database (orders, items, payments, voids, transfer logs) and resets tables. */
    suspend fun clearLocalSales() {
        pendingOrderItemDeleteDao.deleteAll()
        orderItemDao.deleteAll()
        paymentDao.deleteAll()
        voidLogDao.deleteAll()
        voidRequestDao.deleteAll()
        closedBillAccessRequestDao.deleteAll()
        transferLogDao.deleteAll()
        orderDao.deleteAll()
        tableDao.resetAllTables()
    }

    /** Full bidirectional sync: orders, tables, catalog, users, printers, modifiers, void requests. */
    suspend fun syncFromApi(): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            // Heartbeat: web’de “POS Cihazları” sayfasında bu cihazı çevrimiçi göster
            sendHeartbeat()
            pushPendingItemDeletes()
            pushOpenOrdersAndTables()
            pushOrderItemStatusUpdates()
            pushPendingPayments()
            pushPendingTableCloses()
            pushPendingVoids()
            // Pull data from web (tables, orders, categories, products, users, printers, modifier groups)
            syncTables()
            syncOrdersFromApi()
            syncCategories()
            syncModifierGroups()
            syncProducts()
            syncPrinters()
            syncUsers()
            syncVoidRequests()
            syncClosedBillAccessRequests()
            syncFloorPlanSections()
            syncSettings()
            true
        } catch (e: Exception) {
            Log.e("ApiSync", "syncFromApi error: ${e.message}", e)
            false
        }
    }

    /** Last sync error message (for UI). Cleared on success. */
    var lastSyncError: String? = null
        private set

    /** Fast catalog sync for manual refresh: categories, products, modifier groups (+ printers/users). */
    suspend fun syncCatalog(): Boolean {
        if (!isOnline()) {
            lastSyncError = "No internet connection"
            return false
        }
        restoreAuthTokenIfNeeded()
        lastSyncError = null
        try {
            syncCategories()
        } catch (e: Exception) {
            lastSyncError = "Categories: ${e.message}"
            Log.e("ApiSync", "syncCategories error", e)
            return false
        }
        try {
            syncModifierGroups()
        } catch (e: Exception) {
            lastSyncError = "Modifier gruplar: ${e.message}"
            Log.e("ApiSync", "syncModifierGroups error", e)
            return false
        }
        if (!syncProducts()) return false
        try {
            syncPrinters()
            syncUsers()
            syncSettings()
        } catch (e: Exception) {
            lastSyncError = "Printer/User: ${e.message}"
            Log.e("ApiSync", "syncPrinters/Users error", e)
            return false
        }
        return true
    }

    /** Create discount request for order (web will approve with actual % or amount). */
    suspend fun createDiscountRequest(orderId: String, requestedPercent: Double?, requestedAmount: Double?, note: String): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        val res = apiService.createDiscountRequest(orderId, DiscountRequestRequest(requestedPercent, requestedAmount, note))
        return res.isSuccessful
    }

    /** Get pending discount request for order, if any. */
    suspend fun getDiscountRequestForOrder(orderId: String): DiscountRequestResponse? {
        if (!isOnline()) return null
        restoreAuthTokenIfNeeded()
        val res = apiService.getDiscountRequestForOrder(orderId)
        if (!res.isSuccessful) return null
        return res.body()?.request
    }

    /** Refresh single order from API (e.g. after web approves discount). Line-identity upsert: match by clientLineId or apiId. */
    suspend fun refreshOrderFromApi(orderId: String): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        val res = apiService.getOrder(orderId)
        if (!res.isSuccessful) return false
        val dto = res.body() ?: return false
        val items = dto.items ?: emptyList()
        val voidedIds = voidLogDao.getVoidedItemIdsForOrder(dto.id).toSet()
        val filteredItems = items.filter { it.id !in voidedIds }
        val localItems = orderItemDao.getOrderItems(dto.id).first()
        val orderEntity = OrderEntity(
            id = dto.id,
            tableId = dto.tableId,
            tableNumber = dto.tableNumber,
            waiterId = dto.waiterId,
            waiterName = dto.waiterName,
            status = dto.status,
            subtotal = dto.subtotal,
            taxAmount = dto.taxAmount,
            discountPercent = dto.discountPercent,
            discountAmount = dto.discountAmount,
            total = dto.total,
            createdAt = dto.createdAt,
            paidAt = dto.paidAt,
            syncStatus = "SYNCED"
        )
        orderDao.insertOrder(orderEntity)
        upsertOrderItemsFromApi(dto.id, filteredItems, localItems)
        return true
    }

    /** Pushes current occupied/bill table states to API immediately. Call after opening or updating tables so web sees changes without waiting for full sync. */
    suspend fun pushTableStatesNow() {
        if (!isOnline()) return
        try {
            pushOpenOrdersAndTables()
        } catch (e: Exception) {
            Log.e("ApiSync", "pushTableStatesNow error: ${e.message}", e)
        }
    }

    private suspend fun sendHeartbeat() {
        if (!isOnline()) return
        try {
            val deviceId = serverPreferences.getDeviceId()
            val request = HeartbeatRequest(
                deviceId = deviceId,
                deviceName = Build.MODEL?.takeIf { it.isNotBlank() } ?: "Android POS",
                appVersion = null
            )
            val res = apiService.sendHeartbeat(request)
            if (!res.isSuccessful) {
                Log.e("ApiSync", "heartbeat failed: ${res.code()}")
                return
            }
            val body = res.body()
            if (body?.clearLocalDataRequested == true) {
                Log.d("ApiSync", "Clear local data requested from web - clearing local sales data")
                clearLocalSales()
                try {
                    apiService.ackClearLocalData(AckClearRequest(deviceId = deviceId))
                } catch (e: Exception) {
                    Log.e("ApiSync", "ackClearLocalData failed: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e("ApiSync", "sendHeartbeat error: ${e.message}")
        }
    }

    /** Schedule API delete for item that was on API (apiId != null). If online, push immediately; if offline, store tombstone for later push. */
    suspend fun scheduleItemDelete(orderId: String, item: OrderItemEntity) {
        val apiItemId = item.apiId ?: return
        if (isOnline()) {
            try {
                restoreAuthTokenIfNeeded()
                val res = apiService.deleteOrderItem(orderId, apiItemId)
                if (res.isSuccessful) return
            } catch (e: Exception) {
                Log.e("ApiSync", "scheduleItemDelete push failed: ${e.message}")
            }
        }
        val id = "$orderId:$apiItemId"
        pendingOrderItemDeleteDao.insert(PendingOrderItemDeleteEntity(id = id, orderId = orderId, apiItemId = apiItemId))
    }

    private suspend fun pushPendingItemDeletes() {
        if (!isOnline()) return
        val tombstones = pendingOrderItemDeleteDao.getAll()
        for (t in tombstones) {
            try {
                restoreAuthTokenIfNeeded()
                val res = apiService.deleteOrderItem(t.orderId, t.apiItemId)
                if (res.isSuccessful) {
                    pendingOrderItemDeleteDao.delete(t.orderId, t.apiItemId)
                }
            } catch (e: Exception) {
                Log.e("ApiSync", "pushPendingItemDeletes failed for ${t.orderId}/${t.apiItemId}: ${e.message}")
            }
        }
    }

    /** Pushes open orders and occupied tables to API so web has latest state */
    private suspend fun pushOpenOrdersAndTables() {
        val occupiedTables = tableDao.getOccupiedTables()
        val billTables = tableDao.getBillTables()
        val tablesToPush = occupiedTables + billTables
        val orderIds = mutableSetOf<String>()
        for (table in tablesToPush) {
            val orderId = table.currentOrderId ?: continue
            orderIds.add(orderId)
            pushTableState(table)
        }
        for (order in orderDao.getOpenAndSentOrders()) {
            orderIds.add(order.id)
        }
        for (orderId in orderIds) {
            ensureOrderExistsOnApi(orderId)
        }
        for (table in tablesToPush) {
            pushTableState(table)
        }
    }

    private suspend fun pushTableState(table: TableEntity) {
        if (!isOnline()) return
        try {
            val body = mutableMapOf<String, Any?>(
                "status" to table.status,
                "current_order_id" to table.currentOrderId,
                "waiter_id" to table.waiterId,
                "waiter_name" to table.waiterName,
                "guest_count" to table.guestCount
            )
            table.openedAt?.let { ms ->
                body["opened_at"] = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date(ms))
            }
            val res = apiService.updateTable(table.id, body)
            if (!res.isSuccessful) Log.e("ApiSync", "updateTable ${table.id} failed: ${res.code()}")
        } catch (e: Exception) {
            Log.e("ApiSync", "pushTableState error: ${e.message}")
        }
    }

    /** Push table transfer to API so sync does not overwrite local state. Source must be free, target occupied, order table_id updated. */
    suspend fun pushTableTransfer(sourceTableId: String, targetTableId: String, orderId: String, targetTableNumber: String) {
        if (!isOnline()) return
        try {
            restoreAuthTokenIfNeeded()
            val sourceBody = mapOf<String, Any?>(
                "status" to "free",
                "current_order_id" to null,
                "guest_count" to 0,
                "waiter_id" to null,
                "waiter_name" to null,
                "opened_at" to null
            )
            val srcRes = apiService.updateTable(sourceTableId, sourceBody)
            if (!srcRes.isSuccessful) Log.e("ApiSync", "pushTableTransfer source ${sourceTableId} failed: ${srcRes.code()}")
            val targetTable = tableDao.getTableById(targetTableId)
            if (targetTable != null) {
                pushTableState(targetTable)
            }
            val orderRes = apiService.updateOrderTable(
                orderId,
                mapOf("table_id" to targetTableId, "table_number" to targetTableNumber)
            )
            if (!orderRes.isSuccessful) Log.e("ApiSync", "pushTableTransfer order $orderId failed: ${orderRes.code()}")
        } catch (e: Exception) {
            Log.e("ApiSync", "pushTableTransfer error: ${e.message}", e)
        }
    }

    /** Push single item's delivered status immediately (so web floor shows "Masaya gitti" without waiting for full sync). */
    suspend fun pushItemDeliveredStatus(orderId: String, item: OrderItemEntity) {
        if (!isOnline() || item.deliveredAt == null) return
        val apiItemId = item.apiId ?: item.id
        try {
            restoreAuthTokenIfNeeded()
            val res = apiService.updateOrderItemStatus(orderId, apiItemId, OrderItemStatusRequest("delivered"))
            if (!res.isSuccessful) Log.e("ApiSync", "pushItemDelivered failed for ${item.id}")
        } catch (e: Exception) {
            Log.e("ApiSync", "pushItemDelivered error: ${e.message}", e)
        }
    }

    /** KDS local-first: push preparing/ready/delivered status to backend so web stays in sync */
    private suspend fun pushOrderItemStatusUpdates() {
        if (!isOnline()) return
        val openAndSent = orderDao.getOpenAndSentOrders()
        for (order in openAndSent) {
            val items = orderItemDao.getOrderItems(order.id).first()
            for (item in items) {
                val statusToPush = when {
                    item.deliveredAt != null -> "delivered"
                    item.status == "preparing" -> "preparing"
                    item.status == "ready" -> "ready"
                    else -> null
                }
                if (statusToPush == null) continue
                val apiItemId = item.apiId ?: item.id
                try {
                    val res = apiService.updateOrderItemStatus(order.id, apiItemId, OrderItemStatusRequest(statusToPush))
                    if (!res.isSuccessful) Log.e("ApiSync", "updateOrderItemStatus failed for ${item.id}")
                } catch (e: Exception) {
                    Log.e("ApiSync", "pushOrderItemStatus error: ${e.message}")
                }
            }
        }
    }

    private suspend fun pushPendingPayments() {
        val pending = paymentDao.getPendingPayments()
        for (payment in pending) {
            val apiOrderId = ensureOrderExistsOnApi(payment.orderId, includeAllItems = true)
            if (apiOrderId == null) continue
            val ok = pushPayment(
                apiOrderId,
                payment.amount,
                payment.method,
                payment.receivedAmount,
                payment.changeAmount,
                payment.userId
            )
            if (ok) {
                paymentDao.updatePayment(payment.copy(syncStatus = "SYNCED"))
            }
        }
    }

    /**
     * Line-identity upsert: match by clientLineId or apiId. No fuzzy merge. No delete-all.
     * sentAt immutable. KDS status monotonic.
     */
    private suspend fun upsertOrderItemsFromApi(
        orderId: String,
        apiItems: List<OrderItemDto>,
        localItems: List<OrderItemEntity>
    ) {
        val tombstoneIds = pendingOrderItemDeleteDao.getApiItemIdsForOrder(orderId).toSet()
        val filteredApiItems = apiItems.filter { it.id !in tombstoneIds }
        val localByClientLineId = localItems.filter { it.clientLineId != null }.associateBy { it.clientLineId!! }
        val localByApiId = localItems.filter { it.apiId != null }.associateBy { it.apiId!! }
        val apiIds = filteredApiItems.map { it.id }.toSet()

        for (local in localItems) {
            if (local.apiId != null && local.apiId !in apiIds) {
                orderItemDao.deleteOrderItem(local)
            }
        }

        for (item in filteredApiItems) {
            val local = item.clientLineId?.let { localByClientLineId[it] }
                ?: localByApiId[item.id]
            val (resolvedStatus, resolvedDeliveredAt) = resolveStatusForSync(local?.status, local?.deliveredAt, item.status)
            val resolvedSentAt = local?.sentAt ?: item.sentAt
            val resolvedDeliveredAtFinal = resolvedDeliveredAt ?: local?.deliveredAt ?: item.deliveredAt
            val entity = OrderItemEntity(
                id = local?.id ?: item.id,
                orderId = orderId,
                productId = item.productId,
                productName = item.productName,
                quantity = item.quantity,
                price = item.price,
                notes = item.notes,
                status = resolvedStatus,
                sentAt = resolvedSentAt,
                deliveredAt = resolvedDeliveredAtFinal,
                clientLineId = item.clientLineId ?: local?.clientLineId,
                apiId = item.id,
                syncStatus = "SYNCED"
            )
            orderItemDao.insertOrderItem(entity)
        }
    }

    /** KDS status hierarchy: delivered > ready > preparing > sent > pending. Never regress — local-first.
     * ready: KDS Ready dedi → KDS'den dussun, bir daha geri gelmesin. deliveredAt olsa bile status=ready kalsin. */
    private fun resolveStatusForSync(localStatus: String?, localDeliveredAt: Long?, apiStatus: String?): Pair<String, Long?> {
        if (localStatus == "ready") return "ready" to (localDeliveredAt ?: null)
        if (localDeliveredAt != null) return "delivered" to localDeliveredAt
        if (localStatus == "delivered") return "delivered" to null
        val rank = { s: String? -> when (s) { "delivered" -> 5; "ready" -> 4; "preparing" -> 3; "sent" -> 2; "pending" -> 1; else -> 0 } }
        val localRank = rank(localStatus)
        val apiRank = rank(apiStatus)
        return when {
            localRank >= apiRank && localStatus != null -> localStatus to null
            apiRank > localRank && apiStatus == "delivered" -> "delivered" to null
            apiRank > localRank && apiStatus != null -> apiStatus to null
            else -> (localStatus ?: apiStatus ?: "pending") to null
        }
    }

    /** Ensures order exists on API with items. Line-identity: one local line = one API line, client_line_id for idempotency. sendOrderToKitchen is NOT called here — only via explicit ensureOrderAndSendToKitchen.
     * @param includeAllItems when true (e.g. for payment push), sync all items including those not yet sent to kitchen. Otherwise only sent items (sentAt!=null) are pushed. */
    private suspend fun ensureOrderExistsOnApi(localOrderId: String, includeAllItems: Boolean = false): String? {
        if (!isOnline()) return null
        val order = orderDao.getOrderById(localOrderId) ?: return null
        val table = tableDao.getTableById(order.tableId) ?: return null
        val allLocalItems = orderItemDao.getOrderItems(localOrderId).first()
        val localItems = if (includeAllItems) allLocalItems else allLocalItems.filter { it.sentAt != null }
        val guestCount = table.guestCount.coerceAtLeast(1)

        return try {
            val getResponse = apiService.getOrder(localOrderId)
            if (getResponse.isSuccessful) {
                val apiOrder = getResponse.body() ?: return localOrderId
                val apiItems = apiOrder.items ?: emptyList()
                val apiByClientLineId = apiItems.filter { it.clientLineId != null }.associateBy { it.clientLineId!! }

                for (item in localItems) {
                    val existingApi = item.clientLineId?.let { apiByClientLineId[it] }
                    if (existingApi != null) {
                        if (existingApi.quantity != item.quantity || existingApi.notes != item.notes) {
                            try {
                                val req = AddOrderItemRequest(
                                    productId = item.productId,
                                    productName = item.productName,
                                    quantity = item.quantity,
                                    price = item.price,
                                    notes = item.notes,
                                    clientLineId = item.clientLineId
                                )
                                apiService.updateOrderItem(localOrderId, existingApi.id, req)
                                orderItemDao.updateOrderItem(item.copy(apiId = existingApi.id, syncStatus = "SYNCED"))
                            } catch (e: Exception) {
                                Log.e("ApiSync", "updateOrderItem failed for ${item.id}", e)
                            }
                        } else if (item.apiId != existingApi.id) {
                            orderItemDao.updateOrderItem(item.copy(apiId = existingApi.id, syncStatus = "SYNCED"))
                        }
                    } else if (item.apiId != null) {
                        val match = apiItems.find { it.id == item.apiId }
                        if (match != null && (match.quantity != item.quantity || match.notes != item.notes)) {
                            try {
                                apiService.updateOrderItem(localOrderId, item.apiId, AddOrderItemRequest(
                                    productId = item.productId,
                                    productName = item.productName,
                                    quantity = item.quantity,
                                    price = item.price,
                                    notes = item.notes,
                                    clientLineId = item.clientLineId
                                ))
                            } catch (e: Exception) {
                                Log.e("ApiSync", "updateOrderItem failed for ${item.id}", e)
                            }
                        }
                    } else {
                        val req = AddOrderItemRequest(
                            productId = item.productId,
                            productName = item.productName,
                            quantity = item.quantity,
                            price = item.price,
                            notes = item.notes,
                            clientLineId = item.clientLineId
                        )
                        val addRes = apiService.addOrderItem(localOrderId, req)
                        if (addRes.isSuccessful) {
                            addRes.body()?.let { dto ->
                                orderItemDao.updateOrderItem(item.copy(apiId = dto.id, syncStatus = "SYNCED"))
                            }
                        } else {
                            Log.e("ApiSync", "addOrderItem failed for ${item.productName}")
                        }
                    }
                }
                return localOrderId
            }

            val createReq = CreateOrderRequest(id = localOrderId, tableId = order.tableId, guestCount = guestCount)
            val createResponse = apiService.createOrder(order.waiterId, createReq)
            if (!createResponse.isSuccessful) {
                Log.e("ApiSync", "createOrder failed: ${createResponse.code()} ${createResponse.errorBody()?.string()}")
                return null
            }
            val apiOrder = createResponse.body() ?: return null
            val apiOrderId = apiOrder.id
            for (item in localItems) {
                val req = AddOrderItemRequest(
                    productId = item.productId,
                    productName = item.productName,
                    quantity = item.quantity,
                    price = item.price,
                    notes = item.notes,
                    clientLineId = item.clientLineId
                )
                val addRes = apiService.addOrderItem(apiOrderId, req)
                if (addRes.isSuccessful) {
                    addRes.body()?.let { dto ->
                        orderItemDao.updateOrderItem(item.copy(apiId = dto.id, syncStatus = "SYNCED"))
                    }
                } else {
                    Log.e("ApiSync", "addOrderItem failed for ${item.productName}")
                }
            }
            apiOrderId
        } catch (e: Exception) {
            Log.e("ApiSync", "ensureOrderExistsOnApi error: ${e.message}", e)
            null
        }
    }

    private suspend fun syncTables() {
        val response = apiService.getTables()
        if (!response.isSuccessful) return
        val dtos = response.body() ?: return
        if (dtos.isEmpty()) {
            Log.w("ApiSync", "syncTables: API returned empty tables, keeping local tables to avoid data loss")
            return
        }
        val localAll = tableDao.getAllTablesIncludingOrphaned()
        val localOccupied = localAll.filter { it.currentOrderId != null }.associateBy { it.id }
        val apiIds = dtos.map { it.id }.toSet()
        val orderIdsClosedByApi = mutableSetOf<String>()
        for (dto in dtos) {
            if (dto.status == "free" && dto.currentOrderId.isNullOrBlank()) {
                localOccupied[dto.id]?.currentOrderId?.let { id -> orderIdsClosedByApi.add(id) }
            }
        }
        val entities = dtos.map { dto ->
            val local = localOccupied[dto.id]
            val res = dto.reservation
            val isReservedFromApi = dto.status == "reserved" || res != null
            val apiSaysFree = dto.status == "free"
            val useLocalOccupied = !isReservedFromApi && !apiSaysFree && local != null && dto.currentOrderId.isNullOrBlank() && local.currentOrderId != null
            TableEntity(
                id = dto.id,
                number = dto.number.toString(),
                name = dto.name,
                capacity = dto.capacity,
                floor = dto.floor,
                status = when {
                    isReservedFromApi -> "reserved"
                    useLocalOccupied -> local!!.status
                    else -> dto.status
                },
                currentOrderId = if (useLocalOccupied) local!!.currentOrderId else dto.currentOrderId,
                guestCount = if (useLocalOccupied) local!!.guestCount else dto.guestCount,
                waiterId = if (useLocalOccupied) local!!.waiterId else dto.waiterId,
                waiterName = if (useLocalOccupied) local!!.waiterName else dto.waiterName,
                openedAt = if (useLocalOccupied) local!!.openedAt else dto.openedAt?.let { parseIsoDate(it) },
                syncStatus = "SYNCED",
                x = dto.x,
                y = dto.y,
                width = dto.width,
                height = dto.height,
                shape = dto.shape,
                reservationGuestName = res?.guestName,
                reservationGuestPhone = res?.guestPhone,
                reservationFrom = res?.fromTime,
                reservationTo = res?.toTime,
                isOrphaned = false
            )
        }
        for (e in entities) tableDao.insertTable(e)
        for (local in localAll) {
            if (local.id !in apiIds) {
                tableDao.markOrphaned(local.id)
                try {
                    apiService.reportSyncError(
                        mapOf(
                            "source" to "android",
                            "entity_type" to "table",
                            "entity_id" to local.id,
                            "message" to "Table ${local.number} (${local.name}) exists locally but not in API - marked as orphaned"
                        )
                    )
                } catch (e: Exception) {
                    Log.e("ApiSync", "reportSyncError for table ${local.id} failed: ${e.message}")
                }
            }
        }
        for (orderId in orderIdsClosedByApi) {
            try {
                val resp = apiService.getOrder(orderId)
                if (!resp.isSuccessful) continue
                val dto = resp.body() ?: continue
                val items = dto.items ?: emptyList()
                val voidedIds = voidLogDao.getVoidedItemIdsForOrder(dto.id).toSet()
                val filteredItems = items.filter { it.id !in voidedIds }
                val localItems = orderItemDao.getOrderItems(dto.id).first()
                val orderEntity = OrderEntity(
                    id = dto.id,
                    tableId = dto.tableId,
                    tableNumber = dto.tableNumber,
                    waiterId = dto.waiterId,
                    waiterName = dto.waiterName,
                    status = dto.status,
                    subtotal = dto.subtotal,
                    taxAmount = dto.taxAmount,
                    discountPercent = dto.discountPercent,
                    discountAmount = dto.discountAmount,
                    total = dto.total,
                    createdAt = dto.createdAt,
                    paidAt = dto.paidAt,
                    syncStatus = "SYNCED"
                )
                orderDao.insertOrder(orderEntity)
                upsertOrderItemsFromApi(dto.id, filteredItems, localItems)
            } catch (e: Exception) {
                Log.e("ApiSync", "syncTables: fetch closed order $orderId error: ${e.message}")
            }
        }
    }

    /** Pulls orders (with items) from API for tables that have currentOrderId. Line-identity upsert: no fuzzy merge, no delete-all. */
    private suspend fun syncOrdersFromApi() {
        val tables = tableDao.getAllTables().first()
        for (table in tables) {
            val orderId = table.currentOrderId ?: continue
            if (orderId.isBlank()) continue
            try {
                val response = apiService.getOrder(orderId)
                if (!response.isSuccessful) continue
                val dto = response.body() ?: continue
                val items = dto.items ?: emptyList()

                val voidedIds = voidLogDao.getVoidedItemIdsForOrder(dto.id).toSet()
                val filteredItems = items.filter { it.id !in voidedIds }
                val localItems = orderItemDao.getOrderItems(dto.id).first()

                if (filteredItems.isEmpty() && localItems.isNotEmpty()) {
                    continue
                }

                val orderEntity = OrderEntity(
                    id = dto.id,
                    tableId = dto.tableId,
                    tableNumber = dto.tableNumber,
                    waiterId = dto.waiterId,
                    waiterName = dto.waiterName,
                    status = dto.status,
                    subtotal = dto.subtotal,
                    taxAmount = dto.taxAmount,
                    discountPercent = dto.discountPercent,
                    discountAmount = dto.discountAmount,
                    total = dto.total,
                    createdAt = dto.createdAt,
                    paidAt = dto.paidAt,
                    syncStatus = "SYNCED"
                )
                orderDao.insertOrder(orderEntity)
                upsertOrderItemsFromApi(dto.id, filteredItems, localItems)
            } catch (e: Exception) {
                Log.e("ApiSync", "syncOrdersFromApi error for order $orderId: ${e.message}")
            }
        }
    }

    private suspend fun syncCategories() {
        val response = apiService.getCategories()
        if (response.isSuccessful) {
            val dtos = response.body() ?: return
            if (dtos.isEmpty()) {
                Log.w("ApiSync", "syncCategories: empty list from API, keeping local categories")
                ensureAllCategoryExists()
                return
            }
            categoryDao.deleteAll()
            val entities = buildList {
                add(CategoryEntity("all", "All", "#84CC16", 0, true, true, "SYNCED", "[]"))
                addAll(dtos.map { dto ->
                    val active = when (dto.active) {
                        is Boolean -> dto.active
                        is Number -> (dto.active as Number).toInt() != 0
                        else -> true
                    }
                    val showTill = (dto.showTill ?: 1) != 0
                    val odMin = dto.overdueUndeliveredMinutes?.takeIf { it in 1..1440 }
                    CategoryEntity(
                        id = dto.id,
                        name = dto.name,
                        color = dto.color,
                        sortOrder = dto.sortOrder,
                        active = active,
                        showTill = showTill,
                        syncStatus = "SYNCED",
                        printers = (dto.printers ?: emptyList()).let { Gson().toJson(it) },
                        overdueUndeliveredMinutes = odMin
                    )
                })
            }
            categoryDao.insertCategories(entities)
        } else {
            ensureAllCategoryExists()
        }
    }

    private suspend fun ensureAllCategoryExists() {
        val categories = categoryDao.getAllCategories().first()
        if (categories.none { it.id == "all" }) {
            categoryDao.insertCategory(CategoryEntity("all", "All", "#84CC16", 0, true, true, "SYNCED", "[]"))
        }
    }

    private fun parseDouble(value: Any?, default: Double): Double {
        if (value == null) return default
        return when (value) {
            is Number -> value.toDouble()
            is String -> value.toDoubleOrNull() ?: default
            else -> default
        }
    }

    private fun normalizeModifierGroupIds(raw: List<String>?): List<String> {
        if (raw.isNullOrEmpty()) return emptyList()
        return raw.mapNotNull { it.trim().takeIf { t -> t.isNotEmpty() } }.distinct()
    }

    private suspend fun syncProducts(): Boolean {
        ensureAllCategoryExists()
        return try {
            var response = apiService.getProducts()
            if (!response.isSuccessful && response.code() == 401) {
                Log.w("ApiSync", "syncProducts: 401, refreshing token via login")
                if (refreshTokenFromLogin()) {
                    response = apiService.getProducts()
                }
            }
            if (!response.isSuccessful) {
                val msg = if (response.code() == 401) "Unauthorized (401) - Login and try again" else "API ${response.code()}"
                Log.w("ApiSync", "syncProducts: $msg")
                lastSyncError = msg
                return false
            }
            val dtos = response.body()
            if (dtos == null) {
                Log.w("ApiSync", "syncProducts: empty or invalid response body")
                lastSyncError = "Failed to fetch product list"
                return false
            }
            if (dtos.isEmpty()) {
                Log.w("ApiSync", "syncProducts: API returned 0 products, keeping local")
                return true
            }
            val categories = categoryDao.getAllCategories().first()
        val categoryByName = categories.associateBy { it.name }
        val defaultCategoryId = categories.firstOrNull { it.id != "all" }?.id ?: "all"

            val entities = try {
                dtos.map { dto ->
                    val catId = dto.categoryId?.takeIf { it.isNotEmpty() }
                        ?: dto.categoryName?.let { categoryByName[it]?.id }
                        ?: defaultCategoryId
                    val taxRate = parseDouble(dto.taxRate, 0.0)
                    val showInTill = when (dto.posEnabled) {
                        is Boolean -> dto.posEnabled
                        is Number -> (dto.posEnabled as Number).toInt() != 0
                        is String -> (dto.posEnabled as String).lowercase() in listOf("true", "1")
                        null -> true  // default: show in till when API omits pos_enabled (e.g. new products)
                        else -> false
                    }
                    val active = when (dto.active) {
                        is Boolean -> dto.active
                        is Number -> (dto.active as Number).toInt() != 0
                        else -> true
                    }
                    val prodOdMin = dto.overdueUndeliveredMinutes?.takeIf { it in 1..1440 }
                    val modIds = normalizeModifierGroupIds(dto.modifierGroups)
                    ProductEntity(
                        id = dto.id,
                        name = dto.name,
                        nameArabic = dto.nameArabic ?: "",
                        nameTurkish = dto.nameTurkish ?: "",
                        categoryId = catId,
                        price = parseDouble(dto.price, 0.0),
                        taxRate = taxRate,
                        printers = (dto.printers ?: emptyList()).let { Gson().toJson(it) },
                        modifierGroups = Gson().toJson(modIds),
                        active = active,
                        showInTill = showInTill,
                        syncStatus = "SYNCED",
                        overdueUndeliveredMinutes = prodOdMin
                    )
                }
            } catch (e: Exception) {
                Log.e("ApiSync", "syncProducts: mapping failed ${e.message}", e)
                lastSyncError = e.message ?: "Failed to process product data"
                return false
            }
            productDao.deleteAll()
            productDao.insertProducts(entities)
            val hiddenCount = entities.count { !it.showInTill }
            Log.d("ApiSync", "syncProducts: inserted ${entities.size} products, $hiddenCount hidden (showInTill=false)")
            true
        } catch (e: Exception) {
            Log.e("ApiSync", "syncProducts error: ${e.message}", e)
            lastSyncError = e.message ?: "Sync error"
            false
        }
    }

    private suspend fun syncSettings() {
        try {
            val response = apiService.getSettings()
            if (!response.isSuccessful) return
            val dto = response.body() ?: return
            receiptPreferences.setReceiptSettings(
                ReceiptSettingsData(
                    companyName = dto.companyName?.take(200) ?: "",
                    companyAddress = dto.companyAddress?.take(400) ?: "",
                    receiptHeader = dto.receiptHeader?.take(100)?.takeIf { it.isNotBlank() } ?: "BILL / RECEIPT",
                    receiptFooterMessage = dto.receiptFooterMessage?.take(300)?.takeIf { it.isNotBlank() } ?: "Thank you!",
                    kitchenHeader = dto.kitchenHeader?.take(100)?.takeIf { it.isNotBlank() } ?: "KITCHEN"
                )
            )
            dto.receiptItemSize?.let { size ->
                val v = size.coerceIn(ReceiptItemSize.NORMAL, ReceiptItemSize.XLARGE)
                printerPreferences.setReceiptItemSize(v)
            }
            dto.currencyCode?.takeIf { it.isNotBlank() }?.let { code ->
                currencyPreferences.setCurrencyCode(code)
            }
        } catch (e: Exception) {
            Log.e("ApiSync", "syncSettings error: ${e.message}", e)
        }
    }

    private suspend fun syncPrinters() {
        try {
            val response = apiService.getPrinters()
            if (!response.isSuccessful) return
            val dtos = response.body() ?: return
            val isBackup = { v: Any? ->
                when (v) {
                    is Boolean -> v
                    is Number -> (v as Number).toInt() != 0
                    else -> false
                }
            }
            val kdsOn = { v: Any? ->
                when (v) {
                    is Boolean -> v
                    is Number -> (v as Number).toInt() != 0
                    else -> true
                }
            }
            val enabledOn = { v: Any? ->
                when (v) {
                    is Boolean -> v
                    is Number -> (v as Number).toInt() != 0
                    else -> true
                }
            }
            val existingEnabled = printerDao.getAllPrinters().first().associate { it.id to it.enabled }
            printerDao.deleteAll()
            val entities = dtos.map { dto ->
                val apiEnabled = enabledOn(dto.enabled)
                PrinterEntity(
                    id = dto.id,
                    name = dto.name,
                    printerType = dto.printerType,
                    ipAddress = dto.ipAddress,
                    port = dto.port,
                    connectionType = dto.connectionType,
                    status = dto.status,
                    isDefault = isBackup(dto.isBackup),
                    kdsEnabled = kdsOn(dto.kdsEnabled),
                    enabled = if (dto.enabled != null) apiEnabled else (existingEnabled[dto.id] ?: true),
                    syncStatus = "SYNCED"
                )
            }
            printerDao.insertPrinters(entities)
        } catch (e: Exception) {
            Log.e("ApiSync", "syncPrinters error: ${e.message}", e)
            lastSyncError = "Printer/User: ${e.message ?: "parse error"}"
        }
    }

    private suspend fun syncUsers() {
        try {
            val response = apiService.getUsers()
            if (!response.isSuccessful) return
            val dtos = response.body() ?: return
            val permList = { v: Any? ->
                when (v) {
                    is List<*> -> v.mapNotNull { it?.toString() }.filter { it.isNotBlank() }
                    else -> emptyList<String>()
                }
            }
            userDao.deleteAll()
            val entities = dtos.map { dto ->
                val isActive = when (dto.active) {
                    is Boolean -> dto.active
                    is Number -> (dto.active as Number).toInt() != 0
                    else -> true
                }
                UserEntity(
                    id = dto.id,
                    name = dto.name,
                    pin = dto.pin,
                    role = dto.role,
                    active = isActive,
                    permissions = Gson().toJson(permList(dto.permissions)),
                    cashDrawerPermission = dto.cashDrawerPermission ?: (dto.role == "cashier" || dto.role == "admin"),
                    syncStatus = "SYNCED"
                )
            }
            userDao.insertUsers(entities)
        } catch (e: Exception) {
            Log.e("ApiSync", "syncUsers error: ${e.message}", e)
            lastSyncError = "Printer/User: ${e.message ?: "parse error"}"
        }
    }

    private suspend fun syncModifierGroups() {
        val response = apiService.getModifierGroups()
        if (response.isSuccessful) {
            val dtos = response.body() ?: return
            val apiIds = dtos.map { it.id }.toSet()
            val existing = modifierGroupDao.getAllModifierGroups().first()
            existing.filter { it.id !in apiIds }.forEach { modifierGroupDao.deleteModifierGroup(it) }
            dtos.forEach { dto ->
                val required = when (dto.required) {
                    is Boolean -> dto.required
                    is Number -> (dto.required as Number).toInt() != 0
                    is String -> (dto.required as String).lowercase() in listOf("true", "1")
                    else -> false
                }
                modifierGroupDao.insertModifierGroup(
                    ModifierGroupEntity(
                        id = dto.id,
                        name = dto.name,
                        minSelect = dto.minSelect,
                        maxSelect = dto.maxSelect,
                        required = required
                    )
                )
                modifierOptionDao.deleteOptionsByGroupId(dto.id)
                dto.options?.forEach { opt ->
                    modifierOptionDao.insertModifierOption(
                        ModifierOptionEntity(
                            id = opt.id,
                            modifierGroupId = dto.id,
                            name = opt.name,
                            price = opt.price
                        )
                    )
                }
            }
            Log.d("ApiSync", "syncModifierGroups: upserted ${dtos.size} groups")
        }
    }

    private suspend fun syncVoidRequests() {
        if (!isOnline()) return
        try {
            val response = apiService.getVoidRequests("pending")
            if (!response.isSuccessful) return
            val dtos = response.body() ?: return
            for (dto in dtos) {
                val existing = voidRequestDao.getById(dto.id)
                if (existing != null && existing.status !in listOf("pending")) {
                    continue
                }
                val entity = VoidRequestEntity(
                    id = dto.id,
                    orderId = dto.orderId,
                    orderItemId = dto.orderItemId,
                    productName = dto.productName,
                    quantity = dto.quantity,
                    price = dto.price,
                    tableNumber = dto.tableNumber,
                    requestedByUserId = dto.requestedByUserId,
                    requestedByUserName = dto.requestedByUserName,
                    requestedAt = dto.requestedAt,
                    status = dto.status,
                    approvedBySupervisorUserId = dto.approvedBySupervisorUserId,
                    approvedBySupervisorUserName = dto.approvedBySupervisorUserName,
                    approvedBySupervisorAt = dto.approvedBySupervisorAt,
                    approvedByKdsUserId = dto.approvedByKdsUserId,
                    approvedByKdsUserName = dto.approvedByKdsUserName,
                    approvedByKdsAt = dto.approvedByKdsAt
                )
                voidRequestDao.insert(entity)
            }
        } catch (e: Exception) {
            Log.e("ApiSync", "syncVoidRequests error: ${e.message}", e)
        }
    }

    private suspend fun syncClosedBillAccessRequests() {
        if (!isOnline()) return
        try {
            val response = apiService.getClosedBillAccessRequests("all")
            if (!response.isSuccessful) return
            val dtos = response.body() ?: return
            for (dto in dtos) {
                val entity = ClosedBillAccessRequestEntity(
                    id = dto.id,
                    requestedByUserId = dto.requestedByUserId,
                    requestedByUserName = dto.requestedByUserName,
                    requestedAt = dto.requestedAt,
                    status = dto.status,
                    approvedByUserId = dto.approvedByUserId,
                    approvedByUserName = dto.approvedByUserName,
                    approvedAt = dto.approvedAt,
                    expiresAt = dto.expiresAt
                )
                closedBillAccessRequestDao.insert(entity)
            }
        } catch (e: Exception) {
            Log.e("ApiSync", "syncClosedBillAccessRequests error: ${e.message}", e)
        }
    }

    suspend fun pushClosedBillAccessRequest(entity: ClosedBillAccessRequestEntity): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val req = CreateClosedBillAccessRequestDto(
                id = entity.id,
                requestedByUserId = entity.requestedByUserId,
                requestedByUserName = entity.requestedByUserName,
                expiresAt = entity.expiresAt
            )
            val response = apiService.createClosedBillAccessRequest(req)
            response.isSuccessful
        } catch (e: Exception) {
            Log.e("ApiSync", "pushClosedBillAccessRequest error: ${e.message}", e)
            false
        }
    }

    suspend fun pushClosedBillAccessRequestUpdate(entity: ClosedBillAccessRequestEntity): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val dto = ClosedBillAccessRequestDto(
                id = entity.id,
                requestedByUserId = entity.requestedByUserId,
                requestedByUserName = entity.requestedByUserName,
                requestedAt = entity.requestedAt,
                status = entity.status,
                approvedByUserId = entity.approvedByUserId,
                approvedByUserName = entity.approvedByUserName,
                approvedAt = entity.approvedAt,
                expiresAt = entity.expiresAt
            )
            val response = apiService.updateClosedBillAccessRequest(entity.id, dto)
            response.isSuccessful
        } catch (e: Exception) {
            Log.e("ApiSync", "pushClosedBillAccessRequestUpdate error: ${e.message}", e)
            false
        }
    }

    private suspend fun syncFloorPlanSections() {
        if (!isOnline()) return
        try {
            val response = apiService.getFloorPlanSections()
            if (!response.isSuccessful) return
            val body = response.body() ?: return
            val map = body.mapValues { (_, list) -> list.map { it.toInt() } }
            floorPlanSectionsPreferences.setSections(map)
        } catch (e: Exception) {
            Log.e("ApiSync", "syncFloorPlanSections error: ${e.message}", e)
        }
    }

    fun getFloorPlanSections(): Flow<Map<String, List<Int>>> = floorPlanSectionsPreferences.sections

    suspend fun pushVoidRequest(entity: VoidRequestEntity): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val req = CreateVoidRequestDto(
                id = entity.id,
                orderId = entity.orderId,
                orderItemId = entity.orderItemId,
                productName = entity.productName,
                quantity = entity.quantity,
                price = entity.price,
                tableNumber = entity.tableNumber,
                requestedByUserId = entity.requestedByUserId,
                requestedByUserName = entity.requestedByUserName
            )
            val response = apiService.createVoidRequest(req)
            response.isSuccessful
        } catch (e: Exception) {
            Log.e("ApiSync", "pushVoidRequest error: ${e.message}", e)
            false
        }
    }

    suspend fun pushVoidRequestUpdate(entity: VoidRequestEntity): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val dto = VoidRequestDto(
                id = entity.id,
                orderId = entity.orderId,
                orderItemId = entity.orderItemId,
                productName = entity.productName,
                quantity = entity.quantity,
                price = entity.price,
                tableNumber = entity.tableNumber,
                requestedByUserId = entity.requestedByUserId,
                requestedByUserName = entity.requestedByUserName,
                requestedAt = entity.requestedAt,
                status = entity.status,
                approvedBySupervisorUserId = entity.approvedBySupervisorUserId,
                approvedBySupervisorUserName = entity.approvedBySupervisorUserName,
                approvedBySupervisorAt = entity.approvedBySupervisorAt,
                approvedByKdsUserId = entity.approvedByKdsUserId,
                approvedByKdsUserName = entity.approvedByKdsUserName,
                approvedByKdsAt = entity.approvedByKdsAt
            )
            val response = apiService.updateVoidRequest(entity.id, dto)
            response.isSuccessful
        } catch (e: Exception) {
            Log.e("ApiSync", "pushVoidRequestUpdate error: ${e.message}", e)
            false
        }
    }

    private fun parseIsoDate(iso: String): Long {
        return try {
            java.time.Instant.parse(iso).toEpochMilli()
        } catch (_: Exception) {
            System.currentTimeMillis()
        }
    }

    suspend fun openTableViaApi(
        tableId: String,
        guestCount: Int,
        waiterId: String,
        waiterName: String
    ): OrderEntity? {
        if (!isOnline()) return null
        return try {
            val response = apiService.openTable(tableId, guestCount, waiterId)
            if (!response.isSuccessful) return null
            val dto = response.body() ?: return null
            val orderId = dto.currentOrderId ?: return null
            val table = tableDao.getTableById(tableId) ?: return null
            val order = OrderEntity(
                id = orderId,
                tableId = tableId,
                tableNumber = table.number,
                waiterId = waiterId,
                waiterName = waiterName,
                status = "open",
                subtotal = 0.0,
                taxAmount = 0.0,
                discountPercent = 0.0,
                discountAmount = 0.0,
                total = 0.0,
                createdAt = System.currentTimeMillis(),
                paidAt = null,
                syncStatus = "SYNCED"
            )
            orderDao.insertOrder(order)
            val openedAt = dto.openedAt?.let { parseIsoDate(it) }
            val updatedTable = table.copy(
                status = "occupied",
                currentOrderId = orderId,
                guestCount = dto.guestCount,
                waiterId = dto.waiterId ?: waiterId,
                waiterName = dto.waiterName ?: waiterName,
                openedAt = openedAt,
                syncStatus = "SYNCED"
            )
            tableDao.updateTable(updatedTable)
            order
        } catch (_: Exception) {
            null
        }
    }

    suspend fun pushAddOrderItem(orderId: String, item: OrderItemEntity): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val req = AddOrderItemRequest(
                productId = item.productId,
                productName = item.productName,
                quantity = item.quantity,
                price = item.price,
                notes = item.notes,
                clientLineId = item.clientLineId
            )
            val response = apiService.addOrderItem(orderId, req)
            if (!response.isSuccessful) {
                false
            } else {
                response.body()?.let { dto ->
                    orderItemDao.updateOrderItem(item.copy(apiId = dto.id, syncStatus = "SYNCED"))
                }
                true
            }
        } catch (_: Exception) { false }
    }

    suspend fun pushUpdateOrderItem(orderId: String, item: OrderItemEntity): Boolean {
        if (!isOnline()) return false
        val apiItemId = item.apiId ?: item.id
        return try {
            val req = AddOrderItemRequest(
                productId = item.productId,
                productName = item.productName,
                quantity = item.quantity,
                price = item.price,
                notes = item.notes,
                clientLineId = item.clientLineId
            )
            val response = apiService.updateOrderItem(orderId, apiItemId, req)
            response.isSuccessful
        } catch (_: Exception) { false }
    }

    suspend fun pushDeleteOrderItem(orderId: String, item: OrderItemEntity): Boolean {
        if (!isOnline()) return false
        val apiItemId = item.apiId ?: item.id
        return try {
            val response = apiService.deleteOrderItem(orderId, apiItemId)
            response.isSuccessful
        } catch (_: Exception) { false }
    }

    suspend fun pushSendToKitchen(orderId: String): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val response = apiService.sendOrderToKitchen(orderId)
            response.isSuccessful
        } catch (_: Exception) { false }
    }

    /** Ensures order + items exist on API, then marks order as sent to kitchen. Call before local print. */
    suspend fun ensureOrderAndSendToKitchen(orderId: String): Boolean {
        if (!isOnline()) return false
        ensureOrderExistsOnApi(orderId) ?: return false
        return pushSendToKitchen(orderId)
    }

    suspend fun fetchOrderFromApi(orderId: String): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val response = apiService.getOrder(orderId)
            if (!response.isSuccessful) return false
            val dto = response.body() ?: return false
            val order = OrderEntity(
                id = dto.id,
                tableId = dto.tableId,
                tableNumber = dto.tableNumber,
                waiterId = dto.waiterId,
                waiterName = dto.waiterName,
                status = dto.status,
                subtotal = dto.subtotal,
                taxAmount = dto.taxAmount,
                discountPercent = dto.discountPercent,
                discountAmount = dto.discountAmount,
                total = dto.total,
                createdAt = try { (dto.createdAt as? Number)?.toLong() ?: System.currentTimeMillis() } catch (_: Exception) { System.currentTimeMillis() },
                paidAt = try { dto.paidAt?.let { (it as? Number)?.toLong() } } catch (_: Exception) { null },
                syncStatus = "SYNCED"
            )
            orderDao.insertOrder(order)
            dto.items?.forEach { itemDto ->
                orderItemDao.insertOrderItem(
                    OrderItemEntity(
                        id = itemDto.clientLineId ?: itemDto.id,
                        orderId = orderId,
                        productId = itemDto.productId,
                        productName = itemDto.productName,
                        quantity = itemDto.quantity,
                        price = itemDto.price,
                        notes = itemDto.notes,
                        status = itemDto.status,
                        sentAt = itemDto.sentAt,
                        clientLineId = itemDto.clientLineId,
                        apiId = itemDto.id,
                        syncStatus = "SYNCED"
                    )
                )
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private suspend fun pushPendingVoids() {
        val pending = voidLogDao.getPendingVoids()
        for (v in pending) {
            val ok = pushVoid(v)
            if (ok) voidLogDao.markSynced(v.id)
        }
    }

    private suspend fun pushVoid(v: VoidLogEntity): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val req = CreateVoidRequest(
                type = v.type,
                orderId = v.orderId,
                orderItemId = v.orderItemId,
                productName = v.productName,
                quantity = v.quantity,
                price = v.price,
                amount = v.amount,
                sourceTableId = v.sourceTableId,
                sourceTableNumber = v.sourceTableNumber,
                targetTableId = v.targetTableId,
                targetTableNumber = v.targetTableNumber,
                userId = v.userId,
                userName = v.userName,
                details = v.details
            )
            val response = apiService.createVoid(req)
            if (!response.isSuccessful) {
                Log.e("ApiSync", "pushVoid failed: ${response.code()} ${response.errorBody()?.string()}")
            }
            response.isSuccessful
        } catch (e: Exception) {
            Log.e("ApiSync", "pushVoid error: ${e.message}", e)
            false
        }
    }

    private suspend fun pushPendingTableCloses() {
        val pending = tableDao.getPendingTables()
        for (table in pending) {
            if (table.status == "free") {
                val ok = pushCloseTable(table.id)
                if (ok) {
                    tableDao.updateTable(table.copy(syncStatus = "SYNCED"))
                }
            }
        }
    }

    suspend fun pushCloseTable(tableId: String): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val response = apiService.closeTable(tableId)
            response.isSuccessful
        } catch (_: Exception) { false }
    }

    /** Reserve a table (guest name + from/to time in ms). Returns true if successful. */
    suspend fun reserveTable(tableId: String, guestName: String, guestPhone: String, fromTimeMs: Long, toTimeMs: Long): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val body = mapOf(
                "guest_name" to guestName,
                "guest_phone" to guestPhone,
                "from_time" to fromTimeMs,
                "to_time" to toTimeMs
            )
            val response = apiService.reserveTable(tableId, body)
            if (response.isSuccessful) {
                syncTables()
                true
            } else false
        } catch (_: Exception) { false }
    }

    /** Cancel active reservation for table. Only supervisor/manager can cancel; returns false otherwise. */
    suspend fun cancelTableReservation(tableId: String): Boolean {
        if (!authRepository.isSupervisorRole()) return false
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val response = apiService.cancelTableReservation(tableId, emptyMap())
            if (response.isSuccessful) {
                syncTables()
                true
            } else false
        } catch (_: Exception) { false }
    }

    suspend fun pushPayment(orderId: String, amount: Double, method: String, receivedAmount: Double, changeAmount: Double, userId: String): Boolean {
        if (!isOnline()) return false
        if (ensureOrderExistsOnApi(orderId, includeAllItems = true) == null) return false
        return try {
            val req = CreatePaymentRequest(
                orderId = orderId,
                payments = listOf(
                    PaymentItemRequest(
                        amount = amount,
                        method = method,
                        receivedAmount = receivedAmount,
                        changeAmount = changeAmount
                    )
                )
            )
            val response = apiService.createPayment(userId, req)
            if (!response.isSuccessful) {
                Log.e("ApiSync", "pushPayment failed: ${response.code()} ${response.errorBody()?.string()}")
            }
            response.isSuccessful
        } catch (e: Exception) {
            Log.e("ApiSync", "pushPayment error: ${e.message}", e)
            false
        }
    }
}
