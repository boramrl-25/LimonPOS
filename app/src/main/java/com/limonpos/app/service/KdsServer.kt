package com.limonpos.app.service

import com.google.gson.Gson
import com.limonpos.app.data.local.dao.CategoryDao
import com.limonpos.app.data.local.dao.ModifierGroupDao
import com.limonpos.app.data.local.dao.OrderDao
import com.limonpos.app.data.local.dao.OrderItemDao
import com.limonpos.app.data.local.dao.PaymentDao
import com.limonpos.app.data.local.dao.ProductDao
import com.limonpos.app.data.local.dao.TableDao
import com.limonpos.app.data.local.dao.UserDao
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.data.repository.TableRepository
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Calendar
import javax.inject.Inject
import javax.inject.Singleton

data class KdsOrderDto(
    val id: String,
    val tableNumber: String,
    val waiterName: String,
    val status: String,
    val createdAt: Long,
    val items: List<KdsItemDto>
)

data class KdsItemDto(
    val id: String,
    val productName: String,
    val quantity: Int,
    val notes: String,
    val status: String,
    val sentAt: Long?
)

private data class CreateOrderRequest(
    val tableId: String,
    val guestCount: Int = 0,
    val waiterId: String,
    val waiterName: String
)

private data class AddItemRequest(
    val productId: String,
    val productName: String,
    val price: Double,
    val quantity: Int = 1,
    val notes: String = ""
)

private data class PrinterRequest(
    val name: String,
    val printerType: String,
    val ipAddress: String = "",
    val port: Int = 9100,
    val connectionType: String = "network"
)

private fun cors(res: NanoHTTPD.Response): NanoHTTPD.Response {
    res.addHeader("Access-Control-Allow-Origin", "*")
    res.addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    res.addHeader("Access-Control-Allow-Headers", "Content-Type")
    return res
}

private fun readPostBody(session: NanoHTTPD.IHTTPSession): String {
    val len = session.headers["content-length"]?.toIntOrNull() ?: 0
    if (len <= 0 || len > 100_000) return "{}"
    return try {
        val buf = ByteArray(len)
        session.inputStream.read(buf)
        String(buf, Charsets.UTF_8)
    } catch (e: Exception) {
        "{}"
    }
}

@Singleton
class KdsServer @Inject constructor(
    private val orderDao: OrderDao,
    private val orderItemDao: OrderItemDao,
    private val orderRepository: OrderRepository,
    private val apiSyncRepository: ApiSyncRepository,
    private val tableDao: TableDao,
    private val tableRepository: TableRepository,
    private val productDao: ProductDao,
    private val categoryDao: CategoryDao,
    private val modifierGroupDao: ModifierGroupDao,
    private val paymentDao: PaymentDao,
    private val userDao: UserDao,
    private val printerRepository: PrinterRepository,
    private val printerService: PrinterService
) {
    private var server: NanoHTTPD? = null
    private val gson = Gson()

    fun start(port: Int): Boolean {
        if (server?.isAlive == true) return true
        return try {
            server = object : NanoHTTPD("0.0.0.0", port) {
                override fun serve(session: IHTTPSession): Response {
                    if (session.method == Method.OPTIONS) {
                        return cors(newFixedLengthResponse(Response.Status.OK, "text/plain", ""))
                    }
                    if (session.method == Method.POST) {
                        try { session.parseBody(mutableMapOf()) } catch (_: Exception) { }
                    }
                    val uri = (session.uri ?: "").split("?").first()
                    @Suppress("DEPRECATION") val queryParams = session.parms ?: emptyMap<String, String>()
                    val jsonResponse = when {
                        uri == "/" || uri == "/control" || uri == "/index.html" ->
                            newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", KdsServer.CONTROL_HTML)
                        uri == "/floor-plan" || uri == "/floor-plan/" ->
                            newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", KdsServer.FLOOR_PLAN_HTML)
                        uri == "/kitchen-orders" && session.method == Method.GET -> {
                            val printerFilter = queryParams["printers"]?.takeIf { it.isNotBlank() }
                            val apiOrders = runBlocking(Dispatchers.IO) {
                                withTimeoutOrNull(10_000L) {
                                    apiSyncRepository.fetchKitchenOrdersFromApi(
                                        if (printerFilter == null || printerFilter.equals("all", ignoreCase = true)) null
                                        else printerFilter
                                    )
                                } ?: null
                            }
                            val orders = if (!apiOrders.isNullOrEmpty()) {
                                apiOrders
                            } else try {
                                runBlocking(Dispatchers.IO) {
                                    withTimeoutOrNull(10_000L) {
                                        val selectedPrinterIds = when {
                                            printerFilter == null || printerFilter.equals("all", ignoreCase = true) -> null
                                            else -> printerFilter.split(",").map { it.trim() }.filter { it.isNotBlank() }.toSet()
                                        }
                                        orderDao.getOrdersSentToKitchen().first().mapNotNull { order ->
                                            val allItems = orderItemDao.getOrderItems(order.id).first()
                                            val items = if (selectedPrinterIds == null) {
                                                allItems
                                            } else {
                                                allItems.filter { item ->
                                                    val product = productDao.getProductById(item.productId)
                                                    if (product == null) return@filter true // Show synced items from other devices even if product not in catalog
                                                    val effectivePrinterIds = printerService.parsePrinterIds(product.printers)
                                                        .ifEmpty {
                                                            val category = categoryDao.getCategoryById(product.categoryId)
                                                            category?.let { printerService.parsePrinterIds(it.printers) } ?: emptyList()
                                                        }
                                                    when {
                                                        effectivePrinterIds.isEmpty() -> false
                                                        else -> effectivePrinterIds.any { it in selectedPrinterIds }
                                                    }
                                                }
                                            }
                                            if (items.isEmpty()) null
                                            else KdsOrderDto(order.id, order.tableNumber, order.waiterName, order.status, order.createdAt,
                                                items.map { KdsItemDto(it.id, it.productName, it.quantity, it.notes, it.status, it.sentAt) })
                                        }
                                    } ?: emptyList()
                                }
                            } catch (_: Exception) { emptyList<Any>() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(orders))
                        }
                        uri.matches(Regex("^/kitchen-orders/items/([^/]+)/preparing$")) && session.method == Method.POST -> {
                            val itemId = Regex("^/kitchen-orders/items/([^/]+)/preparing$").find(uri)?.groupValues?.get(1)
                            if (itemId != null) {
                                runBlocking { orderRepository.markItemPreparing(itemId) }
                                newFixedLengthResponse(Response.Status.OK, "application/json", """{"ok":true}""")
                            } else newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                        }
                        uri.matches(Regex("^/kitchen-orders/items/([^/]+)/ready$")) && session.method == Method.POST -> {
                            val itemId = Regex("^/kitchen-orders/items/([^/]+)/ready$").find(uri)?.groupValues?.get(1)
                            if (itemId != null) {
                                runBlocking { orderRepository.markItemReady(itemId) }
                                newFixedLengthResponse(Response.Status.OK, "application/json", """{"ok":true}""")
                            } else newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                        }
                        uri.matches(Regex("^/kitchen-orders/orders/([^/]+)/start-all$")) && session.method == Method.POST -> {
                            val orderId = Regex("^/kitchen-orders/orders/([^/]+)/start-all$").find(uri)?.groupValues?.get(1)
                            if (orderId != null) {
                                runBlocking { orderRepository.markOrderPreparing(orderId) }
                                newFixedLengthResponse(Response.Status.OK, "application/json", """{"ok":true}""")
                            } else newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                        }
                        uri.matches(Regex("^/kitchen-orders/orders/([^/]+)/ready$")) && session.method == Method.POST -> {
                            val orderId = Regex("^/kitchen-orders/orders/([^/]+)/ready$").find(uri)?.groupValues?.get(1)
                            if (orderId != null) {
                                runBlocking { orderRepository.markOrderReady(orderId) }
                                newFixedLengthResponse(Response.Status.OK, "application/json", """{"ok":true}""")
                            } else newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                        }
                        uri == "/tables" && session.method == Method.GET -> {
                            val tables = runBlocking { tableDao.getAllTables().first() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(tables))
                        }
                        uri == "/products" && session.method == Method.GET -> {
                            val products = runBlocking { productDao.getAllProducts().first() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(products))
                        }
                        uri == "/categories" && session.method == Method.GET -> {
                            val categories = runBlocking { categoryDao.getAllCategories().first() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(categories))
                        }
                        uri == "/modifier-groups" && session.method == Method.GET -> {
                            val groups = runBlocking { modifierGroupDao.getAllModifierGroups().first() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(groups))
                        }
                        uri == "/printers" && session.method == Method.GET -> {
                            val printers = runBlocking { printerRepository.getAllPrinters().first() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(printers))
                        }
                        uri == "/printers" && session.method == Method.POST -> {
                            val body = readPostBody(session)
                            val req = try { gson.fromJson(body, PrinterRequest::class.java) } catch (_: Exception) { null }
                            if (req == null || req.name.isBlank()) {
                                newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false,"error":"name required"}""")
                            } else runBlocking {
                                val printer = com.limonpos.app.data.local.entity.PrinterEntity(
                                    id = java.util.UUID.randomUUID().toString(),
                                    name = req.name,
                                    printerType = req.printerType.takeIf { it.isNotBlank() } ?: "kitchen",
                                    ipAddress = req.ipAddress,
                                    port = req.port.coerceIn(1, 65535),
                                    connectionType = req.connectionType.takeIf { it.isNotBlank() } ?: "network"
                                )
                                printerRepository.insertPrinter(printer)
                                newFixedLengthResponse(Response.Status.OK, "application/json", """{"ok":true,"id":"${printer.id}"}""")
                            }
                        }
                        uri.matches(Regex("^/printers/([^/]+)$")) && session.method == Method.PUT -> {
                            val printerId = Regex("^/printers/([^/]+)$").find(uri)?.groupValues?.get(1)
                            if (printerId == null) {
                                newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                            } else runBlocking {
                                val existing = printerRepository.getPrinterById(printerId) ?: return@runBlocking newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", """{"ok":false,"error":"Printer not found"}""")
                                val body = readPostBody(session)
                                val req = try { gson.fromJson(body, PrinterRequest::class.java) } catch (_: Exception) { null }
                                if (req == null || req.name.isBlank()) {
                                    newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false,"error":"name required"}""")
                                } else {
                                    val updated = existing.copy(
                                        name = req.name,
                                        printerType = req.printerType.takeIf { it.isNotBlank() } ?: "kitchen",
                                        ipAddress = req.ipAddress,
                                        port = req.port.coerceIn(1, 65535),
                                        connectionType = req.connectionType.takeIf { it.isNotBlank() } ?: "network"
                                    )
                                    printerRepository.updatePrinter(updated)
                                    newFixedLengthResponse(Response.Status.OK, "application/json", """{"ok":true}""")
                                }
                            }
                        }
                        uri.matches(Regex("^/printers/([^/]+)$")) && session.method == Method.DELETE -> {
                            val printerId = Regex("^/printers/([^/]+)$").find(uri)?.groupValues?.get(1)
                            if (printerId == null) {
                                newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                            } else runBlocking {
                                val printer = printerRepository.getPrinterById(printerId)
                                if (printer != null) {
                                    printerRepository.deletePrinter(printer)
                                    newFixedLengthResponse(Response.Status.OK, "application/json", """{"ok":true}""")
                                } else newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", """{"ok":false}""")
                            }
                        }
                        uri.matches(Regex("^/printers/([^/]+)/test-print$")) && session.method == Method.POST -> {
                            val printerId = Regex("^/printers/([^/]+)/test-print$").find(uri)?.groupValues?.get(1)
                            if (printerId == null) {
                                newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                            } else runBlocking {
                                val printer = printerRepository.getPrinterById(printerId)
                                if (printer == null || printer.ipAddress.isBlank()) {
                                    newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false,"message":"Printer not found or no IP"}""")
                                } else {
                                    val result = printerService.testPrinter(printer.ipAddress, printer.port)
                                    val (status, body) = result.fold(
                                        { Response.Status.OK to """{"ok":true,"message":"Test print sent"}""" },
                                        { Response.Status.INTERNAL_ERROR to """{"ok":false,"message":"${it.message}"}""" }
                                    )
                                    newFixedLengthResponse(status, "application/json", body)
                                }
                            }
                        }
                        uri.matches(Regex("^/printers/([^/]+)/open-drawer$")) && session.method == Method.POST -> {
                            val printerId = Regex("^/printers/([^/]+)/open-drawer$").find(uri)?.groupValues?.get(1)
                            if (printerId != null) {
                                val printer = runBlocking { printerRepository.getPrinterById(printerId) }
                                if (printer != null && printer.ipAddress.isNotBlank()) {
                                    val result = runBlocking { printerService.openCashDrawer(printer.ipAddress, printer.port) }
                                    val (status, body) = result.fold(
                                        { Response.Status.OK to """{"ok":true,"message":"Cash drawer opened"}""" },
                                        { Response.Status.INTERNAL_ERROR to """{"ok":false,"message":"${it.message}"}""" }
                                    )
                                    newFixedLengthResponse(status, "application/json", body)
                                } else newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false,"message":"Printer not found or no IP"}""")
                            } else newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                        }
                        uri == "/reports/summary" && session.method == Method.GET -> {
                            val paidOrders = runBlocking { orderDao.getPaidOrders() }
                            val cal = Calendar.getInstance()
                            cal.set(Calendar.HOUR_OF_DAY, 0)
                            cal.set(Calendar.MINUTE, 0)
                            cal.set(Calendar.SECOND, 0)
                            cal.set(Calendar.MILLISECOND, 0)
                            val startOfDay = cal.timeInMillis
                            val todayOrders = paidOrders.filter { (it.paidAt ?: 0L) >= startOfDay }
                            val todayRevenue = todayOrders.sumOf { it.total }
                            val summary = mapOf(
                                "todayRevenue" to todayRevenue,
                                "todayOrderCount" to todayOrders.size,
                                "totalPaidOrdersCount" to paidOrders.size
                            )
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(summary))
                        }
                        uri == "/reports/orders-paid" && session.method == Method.GET -> {
                            val orders = runBlocking { orderDao.getPaidOrders() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(orders))
                        }
                        uri == "/reports/payments" && session.method == Method.GET -> {
                            val payments = runBlocking { paymentDao.getRecentPayments() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(payments))
                        }
                        uri == "/users" && session.method == Method.GET -> {
                            val users = runBlocking { userDao.getAllUsers().first() }
                            newFixedLengthResponse(Response.Status.OK, "application/json", gson.toJson(users))
                        }
                        uri == "/orders" && session.method == Method.POST -> {
                            val body = readPostBody(session)
                            val req = try { gson.fromJson(body, CreateOrderRequest::class.java) } catch (_: Exception) { null }
                            if (req == null || req.waiterId.isBlank() || req.waiterName.isBlank()) {
                                newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false,"error":"tableId, waiterId, waiterName required"}""")
                            } else {
                                val result = runBlocking {
                                    try {
                                        val table = tableRepository.getTableById(req.tableId)
                                        if (table == null) return@runBlocking Pair(Response.Status.NOT_FOUND, """{"ok":false,"error":"Table not found"}""")
                                        if (table.status == "occupied" && table.currentOrderId != null) {
                                            val existing = orderDao.getOrderById(table.currentOrderId!!)
                                            if (existing != null) Pair(Response.Status.OK, """{"ok":true,"orderId":"${existing.id}","tableNumber":"${existing.tableNumber}"}""")
                                            else Pair(Response.Status.INTERNAL_ERROR, """{"ok":false,"error":"Order not found"}""")
                                        } else {
                                            val order = orderRepository.createOrder(req.tableId, req.guestCount.coerceAtLeast(0), req.waiterId, req.waiterName)
                                            tableRepository.occupyTable(req.tableId, order.id, req.guestCount.coerceAtLeast(0), req.waiterId, req.waiterName)
                                            Pair(Response.Status.OK, """{"ok":true,"orderId":"${order.id}","tableNumber":"${order.tableNumber}"}""")
                                        }
                                    } catch (e: Exception) {
                                        Pair(Response.Status.INTERNAL_ERROR, """{"ok":false,"error":"${e.message?.replace("\"", "'") ?: "Unknown"}"}""")
                                    }
                                }
                                newFixedLengthResponse(result.first, "application/json", result.second)
                            }
                        }
                        uri.matches(Regex("^/orders/([^/]+)$")) && session.method == Method.GET -> {
                            val orderId = Regex("^/orders/([^/]+)$").find(uri)?.groupValues?.get(1)
                            if (orderId == null) {
                                newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                            } else {
                                val result = runBlocking {
                                    try {
                                        val order = orderDao.getOrderById(orderId)
                                        if (order == null) {
                                            Pair(Response.Status.NOT_FOUND, """{"ok":false,"error":"Order not found"}""")
                                        } else {
                                            val items = orderItemDao.getOrderItems(orderId).first()
                                            val resp = mapOf(
                                                "ok" to true,
                                                "id" to order.id,
                                                "tableNumber" to order.tableNumber,
                                                "status" to order.status,
                                                "items" to items.map { it2 ->
                                                    mapOf(
                                                        "id" to it2.id,
                                                        "productName" to it2.productName,
                                                        "quantity" to it2.quantity,
                                                        "price" to it2.price,
                                                        "notes" to it2.notes,
                                                        "status" to it2.status,
                                                        "sentAt" to it2.sentAt,
                                                        "deliveredAt" to it2.deliveredAt
                                                    )
                                                }
                                            )
                                            Pair(Response.Status.OK, gson.toJson(resp))
                                        }
                                    } catch (e: Exception) {
                                        Pair(Response.Status.INTERNAL_ERROR, """{"ok":false,"error":"${e.message?.replace("\"", "'") ?: "Unknown"}"}""")
                                    }
                                }
                                newFixedLengthResponse(result.first, "application/json", result.second)
                            }
                        }
                        uri.matches(Regex("^/orders/([^/]+)/items$")) && session.method == Method.POST -> {
                            val orderId = Regex("^/orders/([^/]+)/items$").find(uri)?.groupValues?.get(1)
                            if (orderId == null) {
                                newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                            } else {
                                val body = readPostBody(session)
                                val req = try { gson.fromJson(body, AddItemRequest::class.java) } catch (_: Exception) { null }
                                if (req == null || req.productId.isBlank()) {
                                    newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false,"error":"productId, productName, price required"}""")
                                } else {
                                    val result = runBlocking {
                                        try {
                                            val item = orderRepository.addItem(orderId, req.productId, req.productName, req.price, req.quantity.coerceAtLeast(1), req.notes)
                                            Pair(Response.Status.OK, """{"ok":true,"itemId":"${item?.id ?: ""}"}""")
                                        } catch (e: Exception) {
                                            Pair(Response.Status.INTERNAL_ERROR, """{"ok":false,"error":"${e.message?.replace("\"", "'") ?: "Unknown"}"}""")
                                        }
                                    }
                                    newFixedLengthResponse(result.first, "application/json", result.second)
                                }
                            }
                        }
                        uri.matches(Regex("^/orders/([^/]+)/send$")) && session.method == Method.POST -> {
                            val orderId = Regex("^/orders/([^/]+)/send$").find(uri)?.groupValues?.get(1)
                            if (orderId != null) {
                                runBlocking {
                                    try {
                                        orderRepository.sendToKitchen(orderId)
                                    } catch (_: Exception) { }
                                }
                                newFixedLengthResponse(Response.Status.OK, "application/json", """{"ok":true}""")
                            } else newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", """{"ok":false}""")
                        }
                        else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
                    }
                    return cors(jsonResponse)
                }
            }
            server!!.start()
            true
        } catch (e: Exception) {
            false
        }
    }

    fun stop() {
        server?.stop()
        server = null
    }

    fun isRunning(): Boolean = server?.isAlive == true

    companion object {
        private val CONTROL_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title></title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#000;color:#e2e8f0;min-height:100vh}
.kds-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #262626}
.kds-printer-btns{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.kds-printer-btns span{color:#94a3b8;font-size:13px;margin-right:6px}
.kds-printer-btn{padding:8px 14px;border-radius:8px;border:1px solid #262626;background:#0f0f0f;color:#e2e8f0;cursor:pointer;font-size:13px;font-weight:500}
.kds-printer-btn:hover{background:#1a1a1a;border-color:#f59e0b}
.kds-printer-btn.active{background:#f59e0b;color:#000;border-color:#f59e0b}
.kds-status{display:flex;align-items:center;gap:16px}
.kds-status-item{display:flex;align-items:center;gap:6px;color:#e2e8f0;font-size:14px;font-weight:600}
.kds-status-pending{color:#3b82f6}
.kds-status-preparing{color:#f59e0b}
.kds-status-delayed{color:#ef4444}
.btn-refresh{background:#f59e0b;color:#000;padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-weight:600}
.kds-speaker{font-size:20px;cursor:pointer;color:#94a3b8;margin-left:8px;user-select:none}
.kds-speaker:hover{color:#f59e0b}
.kds-speaker.muted{color:#64748b;opacity:.7}
.card{background:#0f0f0f;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #262626;min-width:220px;max-width:280px}
.card.sent{border-left:4px solid #f59e0b}
.card.preparing{border-left:4px solid #f59e0b}
.card.late{border-left:4px solid #ef4444;animation:pulse-late 1.5s ease-in-out infinite}
@keyframes pulse-late{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
.card-header{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.card-header .table-num{font-weight:700;color:#e2e8f0;font-size:1.1rem}
.kds-delayed-tag{background:#ef4444;color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700}
.kds-item-line{background:#1a1a2e;padding:10px 12px;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.kds-item-name{color:#e2e8f0;font-size:14px;line-height:1.3}
.kds-btn-start-all{width:100%;padding:12px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer}
.kds-btn-order-ready{width:100%;padding:12px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer}
.btn{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
.btn-start{background:#f59e0b;color:#000}
.btn-ready{background:#22c55e;color:#fff}
#kitchen-orders{display:flex;flex-direction:row;flex-wrap:wrap;gap:16px;align-items:flex-start}
.main{max-width:1200px;margin:0 auto;padding:24px}
.panel{display:none}
.panel.active{display:block}
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999}
.modal-box{background:#0f0f0f;border:2px solid #f59e0b;border-radius:16px;padding:24px;max-width:400px;width:90%}
.modal-box h3{color:#f59e0b;margin:0 0 12px}
.modal-box .btn-close{margin-top:12px;padding:10px 20px;background:#262626;color:#e2e8f0;border:none;border-radius:8px;cursor:pointer}
.report-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.report-cards .stat{background:#0f0f0f;border-radius:12px;padding:20px;border:1px solid #262626;text-align:center}
.section-title{font-size:1.25rem;color:#f59e0b;margin:0 0 16px}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #262626}
th{color:#f59e0b}
.tbl-scroll{overflow-x:auto;max-height:320px}
</style>
</head>
<body>
<main class="main">
<div id="kds" class="panel active">
<div class="kds-header">
<div class="kds-printer-btns">
<span>Printer:</span>
<button type="button" class="kds-printer-btn active" id="kds-printer-all" data-id="all" onclick="toggleKdsPrinterBtn('all')">All</button>
<div id="kds-printer-list" style="display:inline-flex;flex-wrap:wrap;gap:6px"></div>
</div>
<div style="display:flex;align-items:center;gap:16px">
<div class="kds-status">
<span class="kds-status-item kds-status-pending"><span>🔔</span> <span id="kds-pending-count">0</span> Pending</span>
<span class="kds-status-item kds-status-preparing"><span>⏱</span> <span id="kds-preparing-count">0</span> Preparing</span>
<span class="kds-status-item kds-status-delayed"><span>⚠</span> <span id="kds-delayed-count">0</span> Delayed</span>
</div>
<span id="kds-speaker" class="kds-speaker" onclick="toggleKdsSound()" title="Ses açık – tıklayarak kapat">🔊</span>
<button class="btn btn-refresh" onclick="loadKitchen()">Refresh</button>
</div>
</div>
<div id="kitchen-orders"></div>
<div id="late-modal" class="modal-overlay" style="display:none">
<div class="modal-box"><h3>Delayed</h3><ul id="late-list"></ul><button class="btn-close" onclick="closeLateModal()">OK</button></div>
</div>
</div>
<div id="settings" class="panel">
<a href="/floor-plan" class="btn btn-refresh" style="display:inline-block;text-decoration:none">Floor Plan</a>
<h2 class="section-title">Reports</h2>
<div class="report-cards" id="report-summary"></div>
<div class="tbl-scroll"><table><thead><tr><th>Table</th><th>Total</th><th>Payment</th></tr></thead><tbody id="orders-paid-tbody"></tbody></table></div>
</div>
</main>
<script>
const base = location.origin;
var lastSeenItemIds = {};
var kdsKitchenPrinters = [];
var kdsSelectedPrinterIds = null;
var KDS_STORAGE_KEY = 'kds_selected_printers';
var KDS_SOUND_MUTED_KEY = 'kds_sound_muted';
function loadStoredPrinterSelection() {
  try {
    var s = localStorage.getItem(KDS_STORAGE_KEY);
    if (!s || s === 'null') return null;
    var arr = JSON.parse(s);
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch (e) { return null; }
}
function savePrinterSelection() {
  try {
    if (kdsSelectedPrinterIds == null || kdsSelectedPrinterIds.length === 0) localStorage.removeItem(KDS_STORAGE_KEY);
    else localStorage.setItem(KDS_STORAGE_KEY, JSON.stringify(kdsSelectedPrinterIds));
  } catch (e) {}
}
function updateKdsPrinterSelection() {
  var allBtn = document.getElementById('kds-printer-all');
  if (allBtn && allBtn.classList.contains('active')) { kdsSelectedPrinterIds = null; return; }
  var activeIds = [];
  document.querySelectorAll('.kds-printer-id.active').forEach(function(b) {
    var id = b.getAttribute('data-id');
    if (id) activeIds.push(id);
  });
  kdsSelectedPrinterIds = activeIds.length === 0 ? null : activeIds;
}
function loadKdsPrinters() {
  console.log('loadKdsPrinters start');
  kdsSelectedPrinterIds = loadStoredPrinterSelection();
  console.log('KDS selected printers:', kdsSelectedPrinterIds);
  fetch(base + '/printers').then(function(r) { return r.json(); }).then(function(list) {
    kdsKitchenPrinters = (list || []).filter(function(p) { return (p.printerType || '').toLowerCase() === 'kitchen' && p.kdsEnabled !== false; });
    var container = document.getElementById('kds-printer-list');
    if (!container) { console.log('loadKdsPrinters end (no container)'); return; }
    var selected = kdsSelectedPrinterIds || [];
    var allActive = selected.length === 0;
    if (document.getElementById('kds-printer-all')) document.getElementById('kds-printer-all').classList.toggle('active', allActive);
    container.innerHTML = kdsKitchenPrinters.map(function(p) {
      var pid = p.id || '';
      var isActive = !allActive && selected.indexOf(pid) >= 0;
      return '<button type="button" class="kds-printer-btn kds-printer-id' + (isActive ? ' active' : '') + '" data-id="' + pid.replace(/"/g, '&quot;') + '" onclick="toggleKdsPrinterBtn(\'' + pid.replace(/'/g, "\\\\'") + '\')">' + (p.name || p.id) + '</button>';
    }).join('');
    console.log('loadKdsPrinters end, calling loadKitchen');
    loadKitchen();
  });
}
function toggleKdsPrinterBtn(id) {
  if (id === 'all') {
    document.querySelectorAll('.kds-printer-btn').forEach(function(b) { b.classList.remove('active'); });
    var allBtn = document.getElementById('kds-printer-all');
    if (allBtn) allBtn.classList.add('active');
  } else {
    var allBtn = document.getElementById('kds-printer-all');
    if (allBtn) allBtn.classList.remove('active');
    var btn = document.querySelector('.kds-printer-id[data-id="' + id.replace(/"/g, '&quot;') + '"]');
    if (btn) btn.classList.toggle('active');
    var activeIds = [];
    document.querySelectorAll('.kds-printer-id.active').forEach(function(b) {
      var did = b.getAttribute('data-id');
      if (did) activeIds.push(did);
    });
    if (activeIds.length === 0 && allBtn) allBtn.classList.add('active');
  }
  updateKdsPrinterSelection();
  savePrinterSelection();
  loadKitchen();
}
function isKdsSoundMuted() { try { return localStorage.getItem(KDS_SOUND_MUTED_KEY) === '1'; } catch (e) { return false; } }
function setKdsSoundMuted(muted) {
  try { localStorage.setItem(KDS_SOUND_MUTED_KEY, muted ? '1' : '0'); } catch (e) {}
  var el = document.getElementById('kds-speaker');
  if (el) { el.textContent = muted ? '🔇' : '🔊'; el.className = muted ? 'kds-speaker muted' : 'kds-speaker'; el.title = muted ? 'Ses kapalı – tıklayarak aç' : 'Ses açık – tıklayarak kapat'; }
}
function toggleKdsSound() { setKdsSoundMuted(!isKdsSoundMuted()); }
function updateKdsSpeakerUI() {
  var el = document.getElementById('kds-speaker');
  if (!el) return;
  var m = isKdsSoundMuted();
  el.textContent = m ? '🔇' : '🔊';
  el.className = m ? 'kds-speaker muted' : 'kds-speaker';
  el.title = m ? 'Ses kapalı – tıklayarak aç' : 'Ses açık – tıklayarak kapat';
}
function playNewOrderSound() {
  if (isKdsSoundMuted()) return;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator(); var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}
function playLateSound() {
  if (isKdsSoundMuted()) return;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator(); var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 400; osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}
function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatProductNameLines(name) {
  if (!name) return ''; var words = name.trim().split(/\s+/);
  if (words.length <= 2) return escapeHtml(name);
  return escapeHtml(words.slice(0, 2).join(' ')) + '<br>' + escapeHtml(words.slice(2).join(' '));
}
var LATE_MS = 10 * 60 * 1000;
function isLate(it) {
  if (!it.sentAt || it.status === 'ready') return false;
  return (Date.now() - it.sentAt) >= LATE_MS;
}
function closeLateModal() { document.getElementById('late-modal').style.display = 'none'; }
async function loadKitchen() {
  console.log('loadKitchen called');
  try {
    var container = document.getElementById('kds-printer-list');
    if (container && container.children.length > 0) updateKdsPrinterSelection();
    console.log('KDS selected printers:', kdsSelectedPrinterIds);
    var url = base + '/kitchen-orders';
    if (kdsSelectedPrinterIds && kdsSelectedPrinterIds.length > 0) url += '?printers=' + encodeURIComponent(kdsSelectedPrinterIds.join(','));
    var r = await fetch(url);
    var orders = await r.json();
    if (!Array.isArray(orders)) orders = [];
    var allPending = [];
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      var items = (o.items || []).filter(function(x) { return x.status === 'sent' || x.status === 'preparing' || x.status === 'delivered'; });
      for (var j = 0; j < items.length; j++) { allPending.push({ order: o, item: items[j] }); }
    }
    for (var k = 0; k < allPending.length; k++) {
      if (!lastSeenItemIds[allPending[k].item.id]) { lastSeenItemIds[allPending[k].item.id] = true; playNewOrderSound(); break; }
    }
    for (var k = 0; k < allPending.length; k++) { lastSeenItemIds[allPending[k].item.id] = true; }
    var pendingCount = 0, preparingCount = 0, delayedCount = 0;
    var html = '';
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      var items = (o.items || []).filter(function(x) { return x.status === 'sent' || x.status === 'preparing' || x.status === 'delivered'; });
      if (items.length === 0) continue;
      for (var j = 0; j < items.length; j++) {
        if (items[j].status === 'sent' || items[j].status === 'delivered') pendingCount++;
        if (items[j].status === 'preparing') preparingCount++;
        if (isLate(items[j])) delayedCount++;
      }
      var hasLate = items.some(isLate);
      var hasSent = items.some(function(x) { return x.status === 'sent' || x.status === 'delivered'; });
      var hasPreparing = items.some(function(x) { return x.status === 'preparing'; });
      var cardClass = (hasPreparing ? 'preparing' : 'sent');
      if (hasLate) cardClass += ' late';
      var orderElapsed = 0;
      for (var j = 0; j < items.length; j++) { if (items[j].sentAt) orderElapsed = Math.max(orderElapsed, Date.now() - items[j].sentAt); }
      var elapsedStr = orderElapsed >= 3600000 ? Math.floor(orderElapsed/3600000) + 'h ' + Math.floor((orderElapsed%3600000)/60000) + 'm' : Math.floor(orderElapsed/60000) + 'm';
      html += '<div class="card ' + cardClass + '"><div class="card-header"><span class="table-num">Table ' + o.tableNumber + '</span>';
      if (hasLate) html += '<span class="kds-delayed-tag">DELAYED</span>';
      html += '<span style="color:#94a3b8;font-size:12px">⏱ ' + elapsedStr + '</span></div>';
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        html += '<div class="kds-item-line"><span class="kds-item-name">' + (it.quantity > 1 ? it.quantity + 'x ' : '') + formatProductNameLines(it.productName) + (it.notes ? ' — ' + escapeHtml(it.notes) : '') + '</span><span>';
        if (it.status === 'sent' || it.status === 'delivered') html += '<button class="btn btn-start" onclick="startItem(\'' + it.id + '\')">Start</button>';
        if (it.status === 'preparing') html += '<button class="btn btn-ready" onclick="readyItem(\'' + it.id + '\')">✓ Ready</button>';
        html += '</span></div>';
      }
      if (hasSent && hasPreparing) html += '<div style="margin-top:12px"><button class="kds-btn-order-ready" onclick="orderReady(\'' + o.id + '\')">✓ Order Ready</button></div>';
      else if (hasSent) html += '<div style="margin-top:12px"><button class="kds-btn-start-all" onclick="startAll(\'' + o.id + '\')">Start All</button></div>';
      else if (hasPreparing) html += '<div style="margin-top:12px"><button class="kds-btn-order-ready" onclick="orderReady(\'' + o.id + '\')">✓ Order Ready</button></div>';
      html += '</div>';
    }
    document.getElementById('kitchen-orders').innerHTML = html || '<p style="color:#94a3b8">No pending orders</p><p style="color:#64748b;font-size:12px;margin-top:8px">A ve B tablette Ayarlar → Sunucu adresi aynı olmalı (örn. http://LAPTOP_IP:3002/api/)</p>';
    var pendEl = document.getElementById('kds-pending-count');
    var prepEl = document.getElementById('kds-preparing-count');
    var delEl = document.getElementById('kds-delayed-count');
    if (pendEl) pendEl.textContent = pendingCount;
    if (prepEl) prepEl.textContent = preparingCount;
    if (delEl) delEl.textContent = delayedCount;
  } catch (e) {
    var el = document.getElementById('kitchen-orders');
    if (el) el.innerHTML = '<p style="color:#94a3b8">No pending orders</p><p style="color:#64748b;font-size:12px;margin-top:8px">A ve B tablette Ayarlar → Sunucu adresi aynı olmalı.</p>';
  }
}
function startAll(orderId) { fetch(base + '/kitchen-orders/orders/' + encodeURIComponent(orderId) + '/start-all', { method: 'POST' }).then(function() { loadKitchen(); }); }
function orderReady(orderId) { fetch(base + '/kitchen-orders/orders/' + encodeURIComponent(orderId) + '/ready', { method: 'POST' }).then(function() { loadKitchen(); }); }
function startItem(id) { fetch(base + '/kitchen-orders/items/' + encodeURIComponent(id) + '/preparing', { method: 'POST' }).then(function() { loadKitchen(); }); }
function readyItem(id) { fetch(base + '/kitchen-orders/items/' + encodeURIComponent(id) + '/ready', { method: 'POST' }).then(function() { loadKitchen(); }); }
function checkLateAndShowPopup() {
  var url = base + '/kitchen-orders';
  if (kdsSelectedPrinterIds && kdsSelectedPrinterIds.length > 0) url += '?printers=' + encodeURIComponent(kdsSelectedPrinterIds.join(','));
  fetch(url).then(function(r) { return r.json(); }).then(function(orders) {
    if (!Array.isArray(orders)) return;
    var lateItems = [];
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      var items = (o.items || []).filter(function(x) { return (x.status === 'sent' || x.status === 'preparing' || x.status === 'delivered') && isLate(x); });
      for (var j = 0; j < items.length; j++) { lateItems.push({ order: o, item: items[j] }); }
    }
    if (lateItems.length > 0) {
      var listHtml = lateItems.map(function(x) {
        return '<li><strong>Table ' + x.order.tableNumber + '</strong> — ' + x.item.productName + (x.item.quantity > 1 ? ' x' + x.item.quantity : '') + '</li>';
      }).join('');
      document.getElementById('late-list').innerHTML = listHtml;
      document.getElementById('late-modal').style.display = 'flex';
      playLateSound();
    }
  });
}
async function loadReports() {
  try {
    var sum = await fetch(base + '/reports/summary').then(function(r) { return r.json(); });
    var orders = await fetch(base + '/reports/orders-paid').then(function(r) { return r.json(); });
    var payments = await fetch(base + '/reports/payments').then(function(r) { return r.json(); });
    document.getElementById('report-summary').innerHTML = '<div class="stat"><div class="val">' + (sum.todayRevenue != null ? sum.todayRevenue.toFixed(2) : '0') + ' AED</div><div class="lbl">Today</div></div><div class="stat"><div class="val">' + (sum.todayOrderCount != null ? sum.todayOrderCount : 0) + '</div><div class="lbl">Orders</div></div>';
    var ord = '';
    (orders || []).slice(0, 50).forEach(function(o) { ord += '<tr><td>' + (o.tableNumber || '-') + '</td><td>' + (o.total != null ? o.total.toFixed(2) : '') + ' AED</td><td>' + (o.paidAt ? new Date(o.paidAt).toLocaleString() : '-') + '</td></tr>'; });
    document.getElementById('orders-paid-tbody').innerHTML = ord || '<tr><td colspan="3">No records</td></tr>';
  } catch (e) {}
}
function showPage(id) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  if (id === 'kds') { console.log('showPage(kds)'); loadKdsPrinters(); }
  else if (id === 'settings') loadReports();
}
var urlParams = new URLSearchParams(window.location.search);
updateKdsSpeakerUI();
if (urlParams.get('page') === 'settings') showPage('settings'); else loadKdsPrinters();
setInterval(function() { if (document.getElementById('kds') && document.getElementById('kds').classList.contains('active')) loadKitchen(); }, 800);
setInterval(function() { if (document.getElementById('kds') && document.getElementById('kds').classList.contains('active')) checkLateAndShowPopup(); }, 10 * 60 * 1000);
</script>
</body>
</html>
        """.trimIndent()

        private val FLOOR_PLAN_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Floor Plan</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;margin:0;background:#0a0a0a;color:#e2e8f0;min-height:100vh}
.fp-header{background:#0f0f0f;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #262626}
.fp-header h1{margin:0;font-size:1.5rem;color:#f59e0b}
.fp-refresh{background:#f59e0b;color:#000;border:none;padding:10px 20px;border-radius:8px;cursor:pointer}
.fp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px;padding:24px}
.fp-table{aspect-ratio:0.9;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;border:2px solid transparent}
.fp-table.free{background:#166534;border-color:#22c55e}
.fp-table.occupied{background:#1c1917;border-color:#f59e0b}
.fp-table.bill{background:#1e3a5f;border-color:#3b82f6}
.fp-table-name{font-weight:700;font-size:1.1rem;color:#fff}
</style>
</head>
<body>
<header class="fp-header">
<h1>Floor Plan</h1>
<a href="/" style="color:#f59e0b;text-decoration:none">← Back to Kitchen</a>
<button class="fp-refresh" onclick="loadFloorPlan()">Refresh</button>
</header>
<div class="fp-grid" id="fp-tables"></div>
<script>
const base = location.origin;
let tables = [];
function escapeHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
async function loadFloorPlan() {
  try {
    var r = await fetch(base + '/tables');
    tables = await r.json();
    var html = (tables || []).filter(function(t){ return (t.floor||'Main') === 'Main'; }).map(function(t) {
      var status = t.status || 'free';
      return '<div class="fp-table ' + status + '" data-id="' + escapeHtml(t.id) + '">' +
        '<span class="fp-table-name">' + escapeHtml(t.name || t.number || t.id) + '</span></div>';
    }).join('');
    document.getElementById('fp-tables').innerHTML = html || '<p style="color:#94a3b8">No tables</p>';
  } catch (e) { document.getElementById('fp-tables').innerHTML = '<p style="color:#ef4444">Error</p>'; }
}
loadFloorPlan();
setInterval(loadFloorPlan, 3000);
</script>
</body>
</html>
        """.trimIndent()
    }
}
