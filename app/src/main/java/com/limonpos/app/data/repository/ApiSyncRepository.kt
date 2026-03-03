package com.limonpos.app.data.repository

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.limonpos.app.data.local.dao.*
import com.limonpos.app.data.local.entity.*
import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.remote.dto.*
import com.limonpos.app.util.NetworkMonitor
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
    private val transferLogDao: TransferLogDao
) {
    suspend fun isOnline(): Boolean = networkMonitor.isOnline.first()

    /** Clears all sales data from local database (orders, items, payments, voids, transfer logs) and resets tables. */
    suspend fun clearLocalSales() {
        orderItemDao.deleteAll()
        paymentDao.deleteAll()
        voidLogDao.deleteAll()
        voidRequestDao.deleteAll()
        transferLogDao.deleteAll()
        orderDao.deleteAll()
        tableDao.resetAllTables()
    }

    /** Full bidirectional sync: orders, tables, catalog, users, printers, modifiers, void requests. */
    suspend fun syncFromApi(): Boolean {
        if (!isOnline()) return false
        return try {
            // Heartbeat: web’de “POS Cihazları” sayfasında bu cihazı çevrimiçi göster
            pushOpenOrdersAndTables()
            pushOrderItemStatusUpdates()
            pushPendingPayments()
            pushPendingTableCloses()
            pushPendingVoids()
            // Pull data from web (tables, orders, categories, products, users, printers, modifier groups)
            syncTables()
            syncOrdersFromApi()
            syncCategories()
            syncProducts()
            syncPrinters()
            syncUsers()
            syncModifierGroups()
            syncVoidRequests()
            true
        } catch (e: Exception) {
            Log.e("ApiSync", "syncFromApi error: ${e.message}", e)
            false
        }
    }

    /** Fast catalog sync for manual refresh: only categories + products (+ printers/users if needed). */
    suspend fun syncCatalog(): Boolean {
        if (!isOnline()) return false
        return try {
            syncCategories()
            syncProducts()
            syncPrinters()
            syncUsers()
            true
        } catch (e: Exception) {
            Log.e("ApiSync", "syncCatalog error: ${e.message}", e)
            false
        }
    }

    /** Pushes open orders and occupied tables to API so web has latest state */
    private suspend fun pushOpenOrdersAndTables() {
        val occupiedTables = tableDao.getOccupiedTables()
        val billTables = tableDao.getBillTables()
        val tablesToPush = occupiedTables + billTables
        for (table in tablesToPush) {
            val orderId = table.currentOrderId ?: continue
            ensureOrderExistsOnApi(orderId)
        }
        // Also push open/sent orders (covers edge cases where table state may differ)
        val openAndSentOrders = orderDao.getOpenAndSentOrders()
        for (order in openAndSentOrders) {
            ensureOrderExistsOnApi(order.id)
        }
    }

    /** KDS local-first: push preparing/ready status to backend so web stays in sync */
    private suspend fun pushOrderItemStatusUpdates() {
        if (!isOnline()) return
        val openAndSent = orderDao.getOpenAndSentOrders()
        for (order in openAndSent) {
            val items = orderItemDao.getOrderItems(order.id).first()
            for (item in items) {
                if (item.status != "preparing" && item.status != "ready") continue
                val apiItemId = item.apiId ?: item.id
                try {
                    val res = apiService.updateOrderItemStatus(order.id, apiItemId, OrderItemStatusRequest(item.status))
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

    /** Ensures order exists on API with items. Creates if missing; pushes missing items if order exists. */
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
                val apiKeys = apiItems.map { "${it.productName}|${it.quantity}|${it.price}|${it.notes}" }.toSet()
                for (item in localItems) {
                    val key = "${item.productName}|${item.quantity}|${item.price}|${item.notes}"
                    if (key !in apiKeys) {
                        val itemReq = AddOrderItemRequest(
                            productId = item.productId,
                            productName = item.productName,
                            quantity = item.quantity,
                            price = item.price,
                            notes = item.notes
                        )
                        val addRes = apiService.addOrderItem(localOrderId, itemReq)
                        if (!addRes.isSuccessful) Log.e("ApiSync", "addOrderItem failed for ${item.productName}")
                    }
                }
                if (order.status == "sent") apiService.sendOrderToKitchen(localOrderId)
                return localOrderId
            }

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
                if (!addRes.isSuccessful) {
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
        if (response.isSuccessful) {
            val dtos = response.body() ?: return
            val localOccupied = tableDao.getAllTables().first().filter { it.currentOrderId != null }
                .associateBy { it.id }
            tableDao.deleteAll()
            val entities = dtos.map { dto ->
                val local = localOccupied[dto.id]
                val useLocal = local != null && (dto.currentOrderId.isNullOrBlank())
                TableEntity(
                    id = dto.id,
                    number = dto.number.toString(),
                    name = dto.name,
                    capacity = dto.capacity,
                    floor = dto.floor,
                    status = if (useLocal) local!!.status else dto.status,
                    currentOrderId = if (useLocal) local!!.currentOrderId else dto.currentOrderId,
                    guestCount = if (useLocal) local!!.guestCount else dto.guestCount,
                    waiterId = if (useLocal) local!!.waiterId else dto.waiterId,
                    waiterName = if (useLocal) local!!.waiterName else dto.waiterName,
                    openedAt = if (useLocal) local!!.openedAt else dto.openedAt?.let { parseIsoDate(it) },
                    syncStatus = "SYNCED",
                    x = dto.x,
                    y = dto.y,
                    width = dto.width,
                    height = dto.height,
                    shape = dto.shape
                )
            }
            tableDao.insertTables(entities)
        }
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
                if (filteredItems.isEmpty() && localItems.isNotEmpty()) {
                    // Remote has no (non-voided) items but local still has some: keep local version.
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
                orderItemDao.deleteOrderItems(dto.id)
                val itemEntities = filteredItems.map { item ->
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
                // API returned no categories; keep existing local categories to avoid wiping UI.
                Log.w("ApiSync", "syncCategories: empty list from API, keeping local categories")
                return
            }
            categoryDao.deleteAll()
            val entities = buildList {
                add(CategoryEntity("all", "All", "#84CC16", 0, true, "SYNCED", "[]"))
                addAll(dtos.map { dto ->
                    val active = when (dto.active) {
                        is Boolean -> dto.active
                        is Number -> (dto.active as Number).toInt() != 0
                        else -> true
                    }
                    CategoryEntity(
                        id = dto.id,
                        name = dto.name,
                        color = dto.color,
                        sortOrder = dto.sortOrder,
                        active = active,
                        syncStatus = "SYNCED",
                        printers = (dto.printers ?: emptyList()).let { Gson().toJson(it) }
                    )
                })
            }
            categoryDao.insertCategories(entities)
        }
    }

    private suspend fun syncProducts() {
        val response = apiService.getProducts()
        if (!response.isSuccessful) {
            Log.w("ApiSync", "syncProducts: API failed ${response.code()}, keeping local products")
            return
        }
        val dtos = response.body() ?: run {
            Log.w("ApiSync", "syncProducts: empty or invalid response body, keeping local products")
            return
        }
        if (dtos.isEmpty()) {
            Log.w("ApiSync", "syncProducts: API returned 0 products, keeping local products")
            return
        }
        val categories = categoryDao.getAllCategories().first()
        val categoryByName = categories.associateBy { it.name }
        val defaultCategoryId = categories.firstOrNull { it.id != "all" }?.id ?: "all"

        val entities = try {
            dtos.map { dto ->
                val catId = dto.categoryId?.takeIf { it.isNotEmpty() }
                    ?: dto.categoryName?.let { categoryByName[it]?.id }
                    ?: defaultCategoryId
                val rawTax = dto.taxRate
                val taxRate = when {
                    rawTax == null -> 0.0
                    rawTax.isNaN() -> 0.0
                    rawTax > 1 -> rawTax / 100.0
                    else -> rawTax
                }
                val showInTill = when (dto.posEnabled) {
                    is Boolean -> dto.posEnabled
                    is Number -> (dto.posEnabled as Number).toInt() != 0
                    else -> true
                }
                val active = when (dto.active) {
                    is Boolean -> dto.active
                    is Number -> (dto.active as Number).toInt() != 0
                    else -> true
                }
                ProductEntity(
                    id = dto.id,
                    name = dto.name,
                    nameArabic = dto.nameArabic ?: "",
                    nameTurkish = dto.nameTurkish ?: "",
                    categoryId = catId,
                    price = dto.price ?: 0.0,
                    taxRate = taxRate,
                    printers = (dto.printers ?: emptyList()).let { Gson().toJson(it) },
                    modifierGroups = (dto.modifierGroups ?: emptyList()).let { Gson().toJson(it) },
                    active = active,
                    showInTill = showInTill,
                    syncStatus = "SYNCED"
                )
            }
        } catch (e: Exception) {
            Log.e("ApiSync", "syncProducts: mapping failed ${e.message}", e)
            return
        }
        productDao.deleteAll()
        productDao.insertProducts(entities)
        Log.d("ApiSync", "syncProducts: inserted ${entities.size} products")
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
                UserEntity(
                    id = dto.id,
                    name = dto.name,
                    pin = dto.pin,
                    role = dto.role,
                    active = dto.active,
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
            modifierGroupDao.deleteAll()
            modifierOptionDao.deleteAll()
            dtos.forEach { dto ->
                modifierGroupDao.insertModifierGroup(
                    ModifierGroupEntity(
                        id = dto.id,
                        name = dto.name,
                        minSelect = dto.minSelect,
                        maxSelect = dto.maxSelect,
                        required = dto.required
                    )
                )
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

    suspend fun pushVoidRequest(entity: VoidRequestEntity): Boolean {
        if (!isOnline()) return false
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
        return try {
            val response = apiService.closeTable(tableId)
            response.isSuccessful
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
