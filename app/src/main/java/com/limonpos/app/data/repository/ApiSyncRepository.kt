package com.limonpos.app.data.repository

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.gson.Gson
import com.limonpos.app.data.local.dao.*
import com.limonpos.app.data.local.entity.*
import com.limonpos.app.data.prefs.FloorPlanSectionsPreferences
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
    private val transferLogDao: TransferLogDao,
    private val floorPlanSectionsPreferences: FloorPlanSectionsPreferences,
    private val serverPreferences: ServerPreferences,
    private val sessionManager: SessionManager,
    private val authTokenProvider: AuthTokenProvider
) {
    suspend fun isOnline(): Boolean = networkMonitor.isOnline.first()

    private var cachedOverdueMinutes: Int? = null
    private var cachedOverdueMinutesAt: Long = 0L
    /** Cache 15 sn: Web’de 1 dk seçildiğinde kısa sürede güncel değer kullanılsın; 1 dk uyarı hemen çalışsın. */
    private val OVERDUE_CACHE_MS = 15 * 1000L

    /** Bir sonraki getOverdueUndeliveredMinutes çağrısında API’den güncel dakika alınsın (örn. ekran açıldığında). */
    fun clearOverdueMinutesCache() {
        cachedOverdueMinutes = null
    }

    /** Web’deki Ayarlar’da tanımlı “masaya gitmeyen ürün uyarı süresi” (dakika). Offline veya hata durumunda 10. */
    suspend fun getOverdueUndeliveredMinutes(): Int {
        val now = System.currentTimeMillis()
        if (cachedOverdueMinutes != null && (now - cachedOverdueMinutesAt) < OVERDUE_CACHE_MS) {
            return cachedOverdueMinutes!!
        }
        if (!isOnline()) {
            cachedOverdueMinutes = 10
            cachedOverdueMinutesAt = now
            return 10
        }
        restoreAuthTokenIfNeeded()
        return try {
            val res = apiService.getSettings()
            if (res.isSuccessful) {
                val body = res.body()
                val minutes = (body?.overdueUndeliveredMinutes ?: 10).coerceIn(1, 1440)
                cachedOverdueMinutes = minutes
                cachedOverdueMinutesAt = now
                minutes
            } else {
                cachedOverdueMinutes = 10
                cachedOverdueMinutesAt = now
                10
            }
        } catch (e: Exception) {
            Log.e("ApiSync", "getSettings error: ${e.message}")
            cachedOverdueMinutes = 10
            cachedOverdueMinutesAt = now
            10
        }
    }

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
            lastSyncError = "İnternet bağlantısı yok"
            return false
        }
        restoreAuthTokenIfNeeded()
        return try {
            lastSyncError = null
            syncCategories()
            syncModifierGroups()
            if (!syncProducts()) return false
            syncPrinters()
            syncUsers()
            true
        } catch (e: Exception) {
            lastSyncError = e.message ?: "Sync hatası"
            Log.e("ApiSync", "syncCatalog error: ${e.message}", e)
            false
        }
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

    /** Refresh single order from API (e.g. after web approves discount). */
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
        val mergedItems = filteredItems
            .groupBy { listOf(it.productId, it.productName, it.price, it.notes, it.status, it.sentAt) }
            .values
            .map { group -> group.first().copy(quantity = group.sumOf { it.quantity }) }
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
        val localItemsById = localItems.associateBy { it.id }
        orderItemDao.deleteOrderItems(dto.id)
        val itemEntities = mergedItems.map { item ->
            val local = localItemsById[item.id]
            OrderItemEntity(
                id = item.id,
                orderId = dto.id,
                productId = item.productId,
                productName = item.productName,
                quantity = item.quantity,
                price = item.price,
                notes = item.notes,
                status = item.status,
                sentAt = item.sentAt,
                deliveredAt = local?.deliveredAt,
                apiId = item.id,
                syncStatus = "SYNCED"
            )
        }
        if (itemEntities.isNotEmpty()) orderItemDao.insertOrderItems(itemEntities)
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
            if (!res.isSuccessful) Log.e("ApiSync", "heartbeat failed: ${res.code()}")
        } catch (e: Exception) {
            Log.e("ApiSync", "sendHeartbeat error: ${e.message}")
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
            val apiOrderId = ensureOrderExistsOnApi(payment.orderId)
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

    /** Normalized key for comparing order line (avoids 1 vs 1.0 duplicate-adds). */
    private fun orderItemLineKey(productName: String, quantity: Number, price: Number, notes: String): String =
        "$productName|${quantity.toDouble()}|${price.toDouble()}|${notes}"

    /** Ensures order exists on API with items. Creates if missing; keeps API items exactly in sync with local items. */
    private suspend fun ensureOrderExistsOnApi(localOrderId: String): String? {
        if (!isOnline()) return null
        val order = orderDao.getOrderById(localOrderId) ?: return null
        val table = tableDao.getTableById(order.tableId) ?: return null
        val localItems = orderItemDao.getOrderItems(localOrderId).first()
        val guestCount = table.guestCount.coerceAtLeast(1)

        return try {
            val getResponse = apiService.getOrder(localOrderId)
            if (getResponse.isSuccessful) {
                val apiOrder = getResponse.body() ?: return localOrderId
                val apiItems = apiOrder.items ?: emptyList()

                val localKeys = localItems.map {
                    orderItemLineKey(it.productName, it.quantity, it.price, it.notes)
                }.toSet()
                val apiCountByKey = apiItems.groupingBy {
                    orderItemLineKey(it.productName, it.quantity.toDouble(), it.price, it.notes)
                }.eachCount()

                // Remove remote items that are not present locally (by line key)
                for (apiItem in apiItems) {
                    val key = orderItemLineKey(apiItem.productName, apiItem.quantity.toDouble(), apiItem.price, apiItem.notes)
                    if (key !in localKeys) {
                        try {
                            apiService.deleteOrderItem(localOrderId, apiItem.id)
                        } catch (e: Exception) {
                            Log.e("ApiSync", "deleteOrderItem failed for ${apiItem.id}", e)
                        }
                    }
                }

                // Add only (localCount - apiCount) per line key so items never double; store apiId for pushOrderItemStatus
                for ((key, localGroup) in localItems.groupBy { orderItemLineKey(it.productName, it.quantity, it.price, it.notes) }) {
                    val apiCount = apiCountByKey[key] ?: 0
                    val toAdd = localGroup.size - apiCount
                    if (toAdd <= 0) continue
                    val template = localGroup.first()
                    val itemsToUpdate = localGroup.filter { it.apiId == null }
                    var updateIdx = 0
                    for (i in 0 until toAdd) {
                        val itemReq = AddOrderItemRequest(
                            productId = template.productId,
                            productName = template.productName,
                            quantity = template.quantity,
                            price = template.price,
                            notes = template.notes
                        )
                        val addRes = apiService.addOrderItem(localOrderId, itemReq)
                        if (addRes.isSuccessful) {
                            val dto = addRes.body()
                            val item = itemsToUpdate.getOrNull(updateIdx)
                            if (dto != null && item != null) {
                                orderItemDao.updateOrderItem(item.copy(apiId = dto.id, syncStatus = "SYNCED"))
                                updateIdx++
                            }
                        } else {
                            Log.e("ApiSync", "addOrderItem failed for ${template.productName}")
                        }
                    }
                }

                if (order.status == "sent") apiService.sendOrderToKitchen(localOrderId)
                return localOrderId
            }

            // Order not found on API: create with all local items
            val createReq = CreateOrderRequest(
                id = localOrderId,
                tableId = order.tableId,
                guestCount = guestCount
            )
            val createResponse = apiService.createOrder(order.waiterId, createReq)
            if (!createResponse.isSuccessful) {
                Log.e("ApiSync", "createOrder failed: ${createResponse.code()} ${createResponse.errorBody()?.string()}")
                return null
            }
            val apiOrder = createResponse.body() ?: return null
            val apiOrderId = apiOrder.id

            for (item in localItems) {
                val itemReq = AddOrderItemRequest(
                    productId = item.productId,
                    productName = item.productName,
                    quantity = item.quantity,
                    price = item.price,
                    notes = item.notes
                )
                val addRes = apiService.addOrderItem(apiOrderId, itemReq)
                if (addRes.isSuccessful) {
                    val dto = addRes.body()
                    if (dto != null) {
                        orderItemDao.updateOrderItem(item.copy(apiId = dto.id, syncStatus = "SYNCED"))
                    }
                } else {
                    Log.e("ApiSync", "addOrderItem failed for ${item.productName}")
                }
            }
            // If local order is already sent, push that status
            if (order.status == "sent") {
                apiService.sendOrderToKitchen(apiOrderId)
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
        val localOccupied = tableDao.getAllTables().first().filter { it.currentOrderId != null }
            .associateBy { it.id }
        tableDao.deleteAll()
        val entities = dtos.map { dto ->
                val local = localOccupied[dto.id]
                val res = dto.reservation
                // Server says reserved → always use reserved (web and app must show same state).
                // Only use local status when preserving local occupied order (server has no order yet).
                val isReservedFromApi = dto.status == "reserved" || res != null
                val useLocalOccupied = !isReservedFromApi && local != null && dto.currentOrderId.isNullOrBlank() && local.currentOrderId != null
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
                    reservationTo = res?.toTime
                )
            }
        tableDao.insertTables(entities)
    }

    /** Pulls orders (with items) from API for tables that have currentOrderId. Web→App sync (local voids win). */
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

                // Respect local voids: never bring back items that were voided/refunded locally.
                val voidedIds = voidLogDao.getVoidedItemIdsForOrder(dto.id).toSet()
                val filteredItems = items.filter { it.id !in voidedIds }

                val localItems = orderItemDao.getOrderItems(dto.id).first()
                // Merge duplicate lines from API (same product/price/notes/status) into single rows with summed quantity
                val mergedItems = filteredItems
                    .groupBy {
                        listOf(
                            it.productId,
                            it.productName,
                            it.price,
                            it.notes,
                            it.status,
                            it.sentAt
                        )
                    }
                    .values
                    .map { group ->
                        val first = group.first()
                        val totalQty = group.sumOf { it.quantity }
                        first.copy(quantity = totalQty)
                    }

                val remoteTotalQty = mergedItems.sumOf { it.quantity.toLong() }
                val localTotalQty = localItems.sumOf { it.quantity.toLong() }
                if (mergedItems.isEmpty() && localItems.isNotEmpty()) {
                    // Remote has no (non-voided) items but local still has some: keep local version.
                    continue
                }
                if (remoteTotalQty < localTotalQty && localItems.isNotEmpty()) {
                    // Remote has fewer items than local (possibly stale API state) – do not overwrite local.
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
                // Keep local deliveredAt information when pulling from API
                val localItemsById = localItems.associateBy { it.id }
                orderItemDao.deleteOrderItems(dto.id)
                val itemEntities = mergedItems.map { item ->
                    val local = localItemsById[item.id]
                    OrderItemEntity(
                        id = item.id,
                        orderId = dto.id,
                        productId = item.productId,
                        productName = item.productName,
                        quantity = item.quantity,
                        price = item.price,
                        notes = item.notes,
                        status = item.status,
                        sentAt = item.sentAt,
                        deliveredAt = local?.deliveredAt,
                        apiId = item.id,
                        syncStatus = "SYNCED"
                    )
                }
                if (itemEntities.isNotEmpty()) {
                    orderItemDao.insertOrderItems(itemEntities)
                }
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

    private fun normalizeModifierGroupIds(raw: List<Any>?): List<String> {
        if (raw.isNullOrEmpty()) return emptyList()
        return raw.mapNotNull { item ->
            val id = when (item) {
                is String -> item.trim().takeIf { it.isNotEmpty() }
                is Number -> item.toString().trim().takeIf { it.isNotEmpty() }
                is Map<*, *> -> (item["id"] ?: item["Id"])?.toString()?.trim()?.takeIf { it.isNotEmpty() }
                else -> null
            }
            id
        }.distinct()
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
                val msg = if (response.code() == 401) "Yetkisiz (401) - Giriş yapıp tekrar deneyin" else "API ${response.code()}"
                Log.w("ApiSync", "syncProducts: $msg")
                lastSyncError = msg
                return false
            }
            val dtos = response.body()
            if (dtos == null) {
                Log.w("ApiSync", "syncProducts: empty or invalid response body")
                lastSyncError = "Ürün listesi alınamadı"
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
                lastSyncError = e.message ?: "Ürün verisi işlenemedi"
                return false
            }
            productDao.deleteAll()
            productDao.insertProducts(entities)
            val hiddenCount = entities.count { !it.showInTill }
            Log.d("ApiSync", "syncProducts: inserted ${entities.size} products, $hiddenCount hidden (showInTill=false)")
            true
        } catch (e: Exception) {
            Log.e("ApiSync", "syncProducts error: ${e.message}", e)
            lastSyncError = e.message ?: "Sync hatası"
            false
        }
    }

    private suspend fun syncPrinters() {
        val response = apiService.getPrinters()
        if (response.isSuccessful) {
            val dtos = response.body() ?: return
            printerDao.deleteAll()
            val entities = dtos.map { dto ->
                PrinterEntity(
                    id = dto.id,
                    name = dto.name,
                    printerType = dto.printerType,
                    ipAddress = dto.ipAddress,
                    port = dto.port,
                    connectionType = dto.connectionType,
                    status = dto.status,
                    isDefault = dto.isBackup,
                    kdsEnabled = (dto.kdsEnabled ?: 1) != 0,
                    syncStatus = "SYNCED"
                )
            }
            printerDao.insertPrinters(entities)
        }
    }

    private suspend fun syncUsers() {
        val response = apiService.getUsers()
        if (response.isSuccessful) {
            val dtos = response.body() ?: return
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
                    permissions = (dto.permissions ?: emptyList()).let { Gson().toJson(it) },
                    cashDrawerPermission = dto.cashDrawerPermission ?: (dto.role == "cashier" || dto.role == "admin"),
                    syncStatus = "SYNCED"
                )
            }
            userDao.insertUsers(entities)
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
                notes = item.notes
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
                notes = item.notes
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
                        id = itemDto.id,
                        orderId = orderId,
                        productId = itemDto.productId,
                        productName = itemDto.productName,
                        quantity = itemDto.quantity,
                        price = itemDto.price,
                        notes = itemDto.notes,
                        status = itemDto.status,
                        sentAt = itemDto.sentAt,
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

    /** Cancel active reservation for table. */
    suspend fun cancelTableReservation(tableId: String): Boolean {
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
        if (ensureOrderExistsOnApi(orderId) == null) return false
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
