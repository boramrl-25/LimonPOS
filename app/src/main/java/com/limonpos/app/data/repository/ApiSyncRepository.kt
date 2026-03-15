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
import com.limonpos.app.data.prefs.SyncPreferences
import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.remote.AuthTokenProvider
import com.limonpos.app.data.remote.dto.*
import com.limonpos.app.util.FcmTokenHolder
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
    private val syncPreferences: SyncPreferences,
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
            val lastSync = syncPreferences.getLastSyncTimestamp()
            val now = System.currentTimeMillis()
            val useDelta = lastSync > 0 && (now - lastSync) <= 60_000
            val deltaApplied = useDelta && tryDeltaSync(lastSync)
            if (!deltaApplied) {
                syncCategories()
                syncModifierGroups()
                syncProducts()
                syncPrinters()
                syncUsers()
            }
            syncTables()
            syncOrdersFromApi()
            syncVoidRequests()
            syncClosedBillAccessRequests()
            syncFloorPlanSections()
            syncSettings()
            syncPreferences.setLastSyncTimestamp(System.currentTimeMillis())
            true
        } catch (e: Exception) {
            Log.e("ApiSync", "syncFromApi error: ${e.message}", e)
            false
        }
    }

    /** Lightweight sync: only tables + orders (no catalog). For FloorPlan / fast polling. */
    suspend fun syncLightweight(): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            pushOrderItemStatusUpdates()
            pushPendingTableCloses()
            syncTables()
            syncOrdersFromApi()
            true
        } catch (e: Exception) {
            Log.e("ApiSync", "syncLightweight error: ${e.message}", e)
            false
        }
    }

    /** Fetch KDS orders from API, upsert to local (merge status), then return from LOCAL so Ready/Delivered is reflected. */
    suspend fun fetchKitchenOrdersFromApi(printers: String? = null): List<KitchenOrderDto>? {
        if (!isOnline()) return null
        return try {
            restoreAuthTokenIfNeeded()
            val res = apiService.getKitchenOrders(printers)
            val apiList = if (res.isSuccessful) res.body() else null
            if (!apiList.isNullOrEmpty()) {
                for (ko in apiList) {
                    val fullOrder = apiService.getOrder(ko.id).body() ?: continue
                    val items = fullOrder.items ?: emptyList()
                    val orderEntity = OrderEntity(
                        id = fullOrder.id,
                        tableId = fullOrder.tableId,
                        tableNumber = fullOrder.tableNumber,
                        waiterId = fullOrder.waiterId,
                        waiterName = fullOrder.waiterName,
                        status = fullOrder.status ?: "sent",
                        subtotal = fullOrder.subtotal,
                        taxAmount = fullOrder.taxAmount,
                        discountPercent = fullOrder.discountPercent,
                        discountAmount = fullOrder.discountAmount,
                        total = fullOrder.total,
                        createdAt = fullOrder.createdAt,
                        paidAt = fullOrder.paidAt,
                        syncStatus = "SYNCED"
                    )
                    orderDao.insertOrder(orderEntity)
                    val localItems = orderItemDao.getOrderItems(fullOrder.id).first()
                    upsertOrderItemsFromApi(fullOrder.id, items, localItems)
                }
                // Return from LOCAL so Ready/Delivered (from this device) is shown — fix slow disappear / reappear
                apiList.mapNotNull { ko ->
                    val order = orderDao.getOrderById(ko.id) ?: return@mapNotNull null
                    val localItems = orderItemDao.getOrderItems(ko.id).first()
                    KitchenOrderDto(
                        id = order.id,
                        tableNumber = order.tableNumber,
                        waiterName = order.waiterName,
                        status = order.status,
                        createdAt = order.createdAt,
                        items = localItems.map { KitchenOrderItemDto(it.id, it.productName, it.quantity, it.notes, it.status, it.sentAt) }
                    )
                }
            } else {
                apiList
            }
        } catch (e: Exception) {
            Log.e("ApiSync", "fetchKitchenOrdersFromApi error: ${e.message}")
            null
        }
    }

    /** Lightweight sync for KDS: tables + orders. Push Ready/Delivered first so API has it; then pull. */
    suspend fun syncTablesAndOrdersForKds(): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            pushOrderItemStatusUpdates() // Push KDS Ready/Delivered so other devices see it; fix slow disappear
            syncTables()
            syncOrdersFromOpenOrdersApi()
            syncOrdersFromApi()
            true
        } catch (e: Exception) {
            Log.e("ApiSync", "syncTablesAndOrdersForKds error: ${e.message}", e)
            false
        }
    }

    /** Fetches order IDs from dashboard/open-orders (API source of truth) and syncs each order. */
    private suspend fun syncOrdersFromOpenOrdersApi() {
        val res = apiService.getOpenOrders()
        if (!res.isSuccessful) return
        val list = res.body() ?: return
        val orderIds = list.mapNotNull { it.orderId }.filter { it.isNotBlank() }.distinct()
        for (orderId in orderIds) {
            try {
                val r = apiService.getOrder(orderId)
                if (!r.isSuccessful) continue
                val dto = r.body() ?: continue
                val items = dto.items ?: emptyList()
                val voidedIds = voidLogDao.getVoidedItemIdsForOrder(dto.id).toSet()
                val filteredItems = items.filter { item ->
                    item.id !in voidedIds && (item.clientLineId == null || item.clientLineId !in voidedIds)
                }
                val localItems = orderItemDao.getOrderItems(dto.id).first()
                val localOrder = orderDao.getOrderById(dto.id)
                val resolvedOrderStatus = when {
                    localOrder?.status == "sent" && (dto.status == "open" || dto.status.isNullOrBlank()) -> "sent"
                    else -> dto.status ?: localOrder?.status ?: "open"
                }
                val orderEntity = OrderEntity(
                    id = dto.id,
                    tableId = dto.tableId,
                    tableNumber = dto.tableNumber,
                    waiterId = dto.waiterId,
                    waiterName = dto.waiterName,
                    status = resolvedOrderStatus,
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
                Log.e("ApiSync", "syncOrdersFromOpenOrdersApi error for $orderId: ${e.message}")
            }
        }
    }

    private suspend fun tryDeltaSync(sinceMs: Long): Boolean {
        return try {
            val res = apiService.getSyncDelta(sinceMs)
            if (!res.isSuccessful) return false
            val body = res.body() ?: return false
            if (!body.delta) return false
            val hasData = body.categories.isNotEmpty() || body.products.isNotEmpty() ||
                body.modifierGroups.isNotEmpty() || body.printers.isNotEmpty() || body.users.isNotEmpty()
            if (!hasData) return true
            applyDeltaSync(body)
            Log.d("ApiSync", "Delta sync: cat=${body.categories.size} prod=${body.products.size}")
            true
        } catch (e: Exception) {
            Log.w("ApiSync", "Delta sync failed: ${e.message}")
            false
        }
    }

    private suspend fun applyDeltaSync(delta: DeltaSyncResponse) {
        delta.categories.forEach { dto ->
            val active = when (dto.active) { is Boolean -> dto.active; is Number -> (dto.active as Number).toInt() != 0; else -> true }
            val showTill = (dto.showTill ?: 1) != 0
            categoryDao.insertCategory(CategoryEntity(dto.id, dto.name, dto.color, dto.sortOrder, active, showTill, "SYNCED", (dto.printers ?: emptyList()).let { Gson().toJson(it) }, dto.overdueUndeliveredMinutes))
        }
        delta.modifierGroups.forEach { dto ->
            val required = when (dto.required) { is Boolean -> dto.required; is Number -> (dto.required as Number).toInt() != 0; else -> false }
            modifierGroupDao.insertModifierGroup(ModifierGroupEntity(dto.id, dto.name, dto.minSelect ?: 0, dto.maxSelect ?: 1, required))
            modifierOptionDao.deleteOptionsByGroupId(dto.id)
            dto.options?.forEach { opt -> modifierOptionDao.insertModifierOption(ModifierOptionEntity(opt.id ?: "o_${dto.id}_${opt.name.hashCode()}", dto.id, opt.name ?: "", parseDouble(opt.price, 0.0))) }
        }
        if (delta.products.isNotEmpty()) {
            ensureAllCategoryExists()
            val categories = categoryDao.getAllCategories().first()
            val catByName = categories.associateBy { it.name }
            val defaultCatId = categories.firstOrNull { it.id != "all" }?.id ?: "all"
            val entities = delta.products.map { dto ->
                val catId = dto.categoryId?.takeIf { it.isNotEmpty() } ?: dto.categoryName?.let { catByName[it]?.id } ?: defaultCatId
                val showInTill = when (dto.posEnabled) { is Boolean -> dto.posEnabled; is Number -> (dto.posEnabled as Number).toInt() != 0; null -> true; else -> false }
                val active = when (dto.active) { is Boolean -> dto.active; is Number -> (dto.active as Number).toInt() != 0; else -> true }
                ProductEntity(dto.id, dto.name, dto.nameArabic ?: "", dto.nameTurkish ?: "", catId, parseDouble(dto.price, 0.0), parseDouble(dto.taxRate, 0.0), (dto.printers ?: emptyList()).let { Gson().toJson(it) }, Gson().toJson(normalizeModifierGroupIds(dto.modifierGroups)), active, showInTill, "SYNCED", dto.overdueUndeliveredMinutes?.takeIf { it in 1..1440 })
            }
            productDao.insertProducts(entities)
        }
        delta.printers.forEach { dto ->
            val isBk = { v: Any? -> (v is Boolean && v) || (v is Number && (v as Number).toInt() != 0) }
            val kdsOn = { v: Any? -> v !is Number || (v as Number).toInt() != 0 }
            printerDao.insertPrinter(PrinterEntity(dto.id, dto.name, dto.printerType ?: "receipt", dto.ipAddress, dto.port, dto.connectionType ?: "network", dto.status ?: "offline", isBk(dto.isBackup), kdsOn(dto.kdsEnabled), true, "SYNCED"))
        }
        delta.users.forEach { dto ->
            val isActive = when (dto.active) { is Boolean -> dto.active; is Number -> (dto.active as Number).toInt() != 0; else -> true }
            val perms = if (dto.permissions is List<*>) (dto.permissions as List<*>).mapNotNull { it?.toString() }.filter { it.isNotBlank() } else emptyList<String>()
            userDao.insertUser(UserEntity(dto.id, dto.name, dto.pin, dto.role ?: "waiter", isActive, Gson().toJson(perms), dto.cashDrawerPermission ?: false, "SYNCED"))
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
        val filteredItems = items.filter { item ->
            item.id !in voidedIds && (item.clientLineId == null || item.clientLineId !in voidedIds)
        }
        val localItems = orderItemDao.getOrderItems(dto.id).first()
        val resolvedOrderStatus = run {
            val localOrder = orderDao.getOrderById(dto.id)
            val apiStatus = dto.status
            if (localOrder?.status == "sent" && (apiStatus == "open" || apiStatus.isNullOrBlank())) "sent"
            else apiStatus ?: localOrder?.status ?: "open"
        }
        val orderEntity = OrderEntity(
            id = dto.id,
            tableId = dto.tableId,
            tableNumber = dto.tableNumber,
            waiterId = dto.waiterId,
            waiterName = dto.waiterName,
            status = resolvedOrderStatus,
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
                appVersion = null,
                fcmToken = FcmTokenHolder.token
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

    /** Push table transfer to API. Returns failure with server message e.g. "Kapanış saatinde devir yapılamaz" on 403. */
    suspend fun pushTableTransfer(sourceTableId: String, targetTableId: String, orderId: String, targetTableNumber: String): Result<Unit> {
        if (!isOnline()) return Result.success(Unit)
        return try {
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
            if (!srcRes.isSuccessful) {
                if (srcRes.code() == 403) {
                    val msg = srcRes.errorBody()?.string()?.let { parseApiErrorMessage(it) } ?: "Transfer not allowed"
                    return Result.failure(Exception(msg))
                }
                Log.e("ApiSync", "pushTableTransfer source ${sourceTableId} failed: ${srcRes.code()}")
            }
            val targetTable = tableDao.getTableById(targetTableId)
            if (targetTable != null) {
                val targetBody = mutableMapOf<String, Any?>(
                    "status" to targetTable.status,
                    "current_order_id" to targetTable.currentOrderId,
                    "waiter_id" to targetTable.waiterId,
                    "waiter_name" to targetTable.waiterName,
                    "guest_count" to targetTable.guestCount
                )
                targetTable.openedAt?.let { ms ->
                    targetBody["opened_at"] = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date(ms))
                }
                val tgtRes = apiService.updateTable(targetTableId, targetBody)
                if (!tgtRes.isSuccessful) {
                    if (tgtRes.code() == 403) {
                        val msg = tgtRes.errorBody()?.string()?.let { parseApiErrorMessage(it) } ?: "Kapanış saatinde devir yapılamaz."
                        return Result.failure(Exception(msg))
                    }
                    Log.e("ApiSync", "pushTableTransfer target $targetTableId failed: ${tgtRes.code()}")
                }
            }
            val orderRes = apiService.updateOrderTable(
                orderId,
                mapOf("table_id" to targetTableId, "table_number" to targetTableNumber)
            )
            if (!orderRes.isSuccessful) Log.e("ApiSync", "pushTableTransfer order $orderId failed: ${orderRes.code()}")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e("ApiSync", "pushTableTransfer error: ${e.message}", e)
            Result.failure(e)
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
            val result = pushPayment(
                apiOrderId,
                payment.amount,
                payment.method,
                payment.receivedAmount,
                payment.changeAmount,
                payment.userId
            )
            if (result.isSuccess) {
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
            var local = item.clientLineId?.let { localByClientLineId[it] }
                ?: localByApiId[item.id]
            if (local == null) {
                val fuzzy = localItems.firstOrNull { it.productId == item.productId && it.quantity == item.quantity && (it.price - item.price).let { d -> d >= -0.01 && d <= 0.01 } && (it.notes ?: "") == (item.notes ?: "") && (it.status == "sent" || it.sentAt != null) }
                if (fuzzy != null && (fuzzy.status == "sent" || fuzzy.sentAt != null)) local = fuzzy
            }
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
        val localById = localAll.associateBy { it.id }
        val localOccupied = localAll.filter { it.currentOrderId != null }.associateBy { it.id }
        val apiIds = dtos.map { it.id }.toSet()
        val orderIdsClosedByApi = mutableSetOf<String>()
        for (dto in dtos) {
            if (dto.status == "free" && dto.currentOrderId.isNullOrBlank()) {
                localOccupied[dto.id]?.currentOrderId?.let { id -> orderIdsClosedByApi.add(id) }
            }
        }
        val entities = dtos.map { dto ->
            val localOccupiedRow = localOccupied[dto.id]
            val localAny = localById[dto.id]
            val res = dto.reservation
            val isReservedFromApi = dto.status == "reserved" || res != null
            val apiSaysFree = dto.status == "free"
            // Fix: Only prefer local occupied when WE opened it and haven't pushed yet (PENDING).
            // When API says free (another device closed), trust API — avoid orphan "occupied" with no order.
            val useLocalOccupied = !isReservedFromApi && apiSaysFree && localOccupiedRow != null && localOccupiedRow.currentOrderId != null &&
                localOccupiedRow.syncStatus == "PENDING"
            // Trust API when it says occupied - so other devices' occupied tables are visible (multi-app sync).
            // Previously preferred local free over API occupied, which broke app-to-app visibility.
            val useLocalFree = false
            TableEntity(
                id = dto.id,
                number = dto.number.toString(),
                name = dto.name,
                capacity = dto.capacity,
                floor = dto.floor,
                status = when {
                    isReservedFromApi -> "reserved"
                    useLocalFree -> "free"
                    useLocalOccupied -> localOccupiedRow!!.status
                    else -> dto.status
                },
                currentOrderId = when {
                    useLocalFree -> null
                    useLocalOccupied -> localOccupiedRow!!.currentOrderId
                    else -> dto.currentOrderId
                },
                guestCount = when {
                    useLocalFree -> 0
                    useLocalOccupied -> localOccupiedRow!!.guestCount
                    else -> dto.guestCount ?: 0
                },
                waiterId = when {
                    useLocalFree -> null
                    useLocalOccupied -> localOccupiedRow!!.waiterId
                    else -> dto.waiterId
                },
                waiterName = when {
                    useLocalFree -> null
                    useLocalOccupied -> localOccupiedRow!!.waiterName
                    else -> dto.waiterName
                },
                openedAt = when {
                    useLocalFree -> null
                    useLocalOccupied -> localOccupiedRow!!.openedAt
                    else -> dto.openedAt?.let { parseIsoDate(it) }
                },
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
                val filteredItems = items.filter { item ->
                    item.id !in voidedIds && (item.clientLineId == null || item.clientLineId !in voidedIds)
                }
                val localItems = orderItemDao.getOrderItems(dto.id).first()
                val resOrderStatus = run {
                    val localOrder = orderDao.getOrderById(dto.id)
                    val apiStatus = dto.status
                    if (localOrder?.status == "sent" && (apiStatus == "open" || apiStatus.isNullOrBlank())) "sent"
                    else apiStatus ?: localOrder?.status ?: "open"
                }
                val orderEntity = OrderEntity(
                    id = dto.id,
                    tableId = dto.tableId,
                    tableNumber = dto.tableNumber,
                    waiterId = dto.waiterId,
                    waiterName = dto.waiterName,
                    status = resOrderStatus,
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
                val filteredItems = items.filter { item ->
                    item.id !in voidedIds && (item.clientLineId == null || item.clientLineId !in voidedIds)
                }
                val localItems = orderItemDao.getOrderItems(dto.id).first()

                if (filteredItems.isEmpty() && localItems.isNotEmpty()) {
                    continue
                }
                val resolvedOrderStatus = run {
                    val localOrder = orderDao.getOrderById(dto.id)
                    val apiStatus = dto.status
                    if (localOrder?.status == "sent" && (apiStatus == "open" || apiStatus.isNullOrBlank())) "sent"
                    else apiStatus ?: localOrder?.status ?: "open"
                }
                val resolvedTableId = run {
                    if (dto.tableId == table.id) dto.tableId
                    else table.id
                }
                val resolvedTableNumber = if (resolvedTableId == table.id) table.number else dto.tableNumber
                val orderEntity = OrderEntity(
                    id = dto.id,
                    tableId = resolvedTableId,
                    tableNumber = resolvedTableNumber,
                    waiterId = dto.waiterId,
                    waiterName = dto.waiterName,
                    status = resolvedOrderStatus,
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
            val response = apiService.getVoidRequests("all")
            if (!response.isSuccessful) return
            val dtos = response.body() ?: return
            for (dto in dtos) {
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
                if (dto.status == "approved" && dto.orderItemId.isNotBlank() && dto.orderId.isNotBlank()) {
                    var item = orderItemDao.getOrderItemById(dto.orderItemId)
                    if (item == null) {
                        val orderItems = orderItemDao.getOrderItems(dto.orderId).first()
                        // 1) Önce API id (backend order_item.id) ile eşle
                        item = orderItems.firstOrNull { it.apiId == dto.orderItemId }
                            // 2) Sonra lokal id ile dene
                            ?: orderItems.firstOrNull { it.id == dto.orderItemId }
                            // 3) Son çare: ürün adı + adet + fiyat ile eşleşme
                            ?: orderItems.firstOrNull {
                                it.productName == dto.productName &&
                                    it.quantity == dto.quantity &&
                                    kotlin.math.abs(it.price - dto.price) < 0.01
                            }
                    }
                    if (item != null) {
                        orderItemDao.deleteOrderItem(item)
                        refreshOrderTotals(dto.orderId)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("ApiSync", "syncVoidRequests error: ${e.message}", e)
        }
    }

    private suspend fun refreshOrderTotals(orderId: String) {
        val order = orderDao.getOrderById(orderId) ?: return
        val items = orderItemDao.getOrderItems(orderId).first()
        val subtotal = items.sumOf { it.price * it.quantity }
        val taxAmount = order.taxAmount
        val discount = order.discountPercent / 100.0 * subtotal + order.discountAmount
        val total = (subtotal + taxAmount - discount).coerceAtLeast(0.0)
        orderDao.updateOrder(order.copy(subtotal = subtotal, total = total, syncStatus = "PENDING"))
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

    /** Ensures order + items exist on API, then marks order as sent to kitchen. Call before local print. Retry once on failure. */
    suspend fun ensureOrderAndSendToKitchen(orderId: String): Boolean {
        if (!isOnline()) return false
        val order = orderDao.getOrderById(orderId) ?: return false
        if (ensureOrderExistsOnApi(orderId) == null) return false
        if (!pushSendToKitchen(orderId)) return false
        val table = tableDao.getTableById(order.tableId)
        if (table != null) pushTableState(table)
        return true
    }

    suspend fun fetchOrderFromApi(orderId: String): Boolean {
        if (!isOnline()) return false
        restoreAuthTokenIfNeeded()
        return try {
            val response = apiService.getOrder(orderId)
            if (!response.isSuccessful) return false
            val dto = response.body() ?: return false
            val resOrderStatus = run {
                val localOrder = orderDao.getOrderById(dto.id)
                val apiStatus = dto.status
                if (localOrder?.status == "sent" && (apiStatus == "open" || apiStatus.isNullOrBlank())) "sent"
                else apiStatus ?: localOrder?.status ?: "open"
            }
            val order = OrderEntity(
                id = dto.id,
                tableId = dto.tableId,
                tableNumber = dto.tableNumber,
                waiterId = dto.waiterId,
                waiterName = dto.waiterName,
                status = resOrderStatus,
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

    /** Call after voiding an item from app so the void log is sent to the server. */
    suspend fun pushPendingVoidsNow() {
        pushPendingVoids()
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

    /** Pushes payment to API. Returns Result; on 403 NOT_SIGNED_IN_FOR_SHIFT etc. returns failure with server message. */
    suspend fun pushPayment(orderId: String, amount: Double, method: String, receivedAmount: Double, changeAmount: Double, userId: String): Result<Unit> {
        if (!isOnline()) return Result.success(Unit)
        if (ensureOrderExistsOnApi(orderId, includeAllItems = true) == null) return Result.failure(Exception("Order could not be synced"))
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
                val msg = response.errorBody()?.string()?.let { parseApiErrorMessage(it) }
                    ?: "Payment could not be sent to server (${response.code()})"
                Log.e("ApiSync", "pushPayment failed: ${response.code()} $msg")
                return Result.failure(Exception(msg))
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e("ApiSync", "pushPayment error: ${e.message}", e)
            Result.failure(e)
        }
    }

    private fun parseApiErrorMessage(json: String): String? {
        return try {
            @Suppress("UNCHECKED_CAST")
            val obj = Gson().fromJson(json, Map::class.java) as? Map<*, *>
            (obj?.get("message") as? String)?.takeIf { it.isNotBlank() }
        } catch (_: Exception) { null }
    }
}
