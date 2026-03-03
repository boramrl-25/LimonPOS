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
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.data.repository.TableRepository
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
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
                    val fullUri = session.uri ?: ""
                    val uri = fullUri.split("?").first()
                    val query = fullUri.split("?").getOrNull(1) ?: ""
                    val queryParams = query.split("&").associate { part ->
                        val kv = part.split("=", limit = 2)
                        (kv.getOrNull(0) ?: "") to (kv.getOrNull(1)?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "")
                    }
                    val jsonResponse = when {
                        uri == "/" || uri == "/control" || uri == "/index.html" ->
                            newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", CONTROL_HTML)
                        uri == "/floor-plan" || uri == "/floor-plan/" ->
                            newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", FLOOR_PLAN_HTML)
                        uri == "/kitchen-orders" && session.method == Method.GET -> {
                            val printerFilter = queryParams["printers"]?.takeIf { it.isNotBlank() }
                            val selectedPrinterIds = when {
                                printerFilter == null || printerFilter.equals("all", ignoreCase = true) -> null
                                else -> printerFilter.split(",").map { it.trim() }.filter { it.isNotBlank() }.toSet()
                            }
                            val orders = try {
                                runBlocking {
                                    orderDao.getOrdersSentToKitchen().first().mapNotNull { order ->
                                        val allItems = orderItemDao.getOrderItems(order.id).first()
                                        val items = if (selectedPrinterIds == null) {
                                            allItems
                                        } else {
                                            allItems.filter { item ->
                                                val product = productDao.getProductById(item.productId) ?: return@filter false
                                                val productPrinterIds = try {
                                                    (gson.fromJson(product.printers, Array<String>::class.java)?.toSet() ?: emptySet())
                                                } catch (_: Exception) { emptySet() }
                                                productPrinterIds.isNotEmpty() && productPrinterIds.any { it in selectedPrinterIds }
                                            }
                                        }
                                        if (items.isEmpty()) null
                                        else KdsOrderDto(order.id, order.tableNumber, order.waiterName, order.status, order.createdAt,
                                            items.map { KdsItemDto(it.id, it.productName, it.quantity, it.notes, it.status, it.sentAt) })
                                    }
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
                                            Pair(Response.Status.OK, """{"ok":true,"itemId":"${item.id}"}""")
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
<title>Limon POS — Back Office</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#000;color:#e2e8f0;min-height:100vh}
.site-header{background:#0a0a0a;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid #262626}
.site-header h1{margin:0;font-size:1.4rem;color:#f59e0b}
.site-header .info{font-size:0.85rem;color:#94a3b8}
.site-nav{background:#0a0a0a;padding:0 24px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #262626}
.site-nav a{padding:12px 16px;color:#94a3b8;text-decoration:none;font-weight:500;border-bottom:3px solid transparent}
.site-nav a:hover{color:#f59e0b}
.site-nav a.active{color:#f59e0b;border-bottom-color:#f59e0b}
.main{max-width:1200px;margin:0 auto;padding:24px}
.panel{display:none}
.panel.active{display:block}
.section-title{font-size:1.25rem;color:#f59e0b;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #262626}
.card{background:#0f0f0f;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #262626}
#kitchen-orders{display:flex;flex-direction:row;flex-wrap:wrap;gap:16px;align-items:flex-start}
.kds-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #262626}
.kds-title{display:flex;align-items:center;gap:8px;color:#e2e8f0;font-size:1.3rem;font-weight:700}
.kds-printer-btns{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.kds-printer-btns span{color:#94a3b8;font-size:13px;margin-right:6px}
.kds-printer-btn{padding:8px 14px;border-radius:8px;border:1px solid #262626;background:#0f0f0f;color:#e2e8f0;cursor:pointer;font-size:13px;font-weight:500}
.kds-printer-btn:hover{background:#1a1a1a;border-color:#f59e0b}
.kds-printer-btn.active{background:#f59e0b;color:#000;border-color:#f59e0b}
.kds-status{display:flex;align-items:center;gap:16px}
.kds-status-item{display:flex;align-items:center;gap:6px;color:#e2e8f0;font-size:14px;font-weight:600}
.kds-status-item .icon{font-size:18px}
.kds-status-pending{color:#3b82f6}
.kds-status-preparing{color:#f59e0b}
.kds-status-delayed{color:#ef4444}
.kds-speaker{font-size:20px;cursor:pointer;color:#94a3b8;margin-left:8px}
.kds-speaker:hover{color:#f59e0b}
.card{background:#0f0f0f;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #262626;min-width:220px;max-width:280px}
.card.sent{border-left:4px solid #f59e0b}
.card.preparing{border-left:4px solid #f59e0b}
.card.late{border-left:4px solid #ef4444;animation:pulse-late 1.5s ease-in-out infinite}
@keyframes pulse-late{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
.card-header{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.card-header .table-num{font-weight:700;color:#e2e8f0;font-size:1.1rem}
.kds-delayed-tag{background:#ef4444;color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700}
.kds-elapsed{color:#94a3b8;font-size:12px;display:flex;align-items:center;gap:4px}
.kds-item-line{background:#1a1a2e;padding:10px 12px;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.kds-item-line:last-of-type{margin-bottom:12px}
.kds-item-name{color:#e2e8f0;font-size:14px;line-height:1.3}
.kds-card-actions{margin-top:12px}
.kds-btn-order-ready{width:100%;padding:12px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px}
.kds-btn-order-ready:hover{opacity:.9}
.kds-btn-start-all{width:100%;padding:12px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px}
.kds-btn-start-all:hover{opacity:.9}
.item{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #262626}
.item:last-child{border:none}
.item .product-name{display:inline-block;line-height:1.3;max-width:100%}
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999}
.modal-box{background:#0f0f0f;border:2px solid #f59e0b;border-radius:16px;padding:24px;max-width:400px;width:90%;max-height:80vh;overflow:auto}
.modal-box.late{border-color:#f59e0b}
.modal-box h3{margin:0 0 12px;color:#f59e0b;font-size:1.25rem}
.modal-box.late h3{color:#f59e0b}
.modal-box ul{margin:0 0 16px;padding-left:20px;color:#e2e8f0}
.modal-box .btn-close{margin-top:12px;padding:10px 20px;background:#262626;color:#e2e8f0;border:none;border-radius:8px;cursor:pointer;font-weight:600}
.modal-box .btn-close:hover{background:#404040}
.btn{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
.btn-start{background:#f59e0b;color:#000}
.btn-ready{background:#22c55e;color:#fff}
.btn-kasa{background:#22c55e;color:#fff;padding:10px 20px}
.btn-refresh{background:#f59e0b;color:#000;padding:8px 16px}
.btn-sale{background:#10b981;color:#fff}
.btn:hover{opacity:.9}
.report-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.report-cards .stat{background:linear-gradient(135deg,#0f0f0f,#1a1a1a);border-radius:12px;padding:20px;border:1px solid #262626;text-align:center}
.report-cards .stat .val{font-size:1.75rem;font-weight:700;color:#f59e0b}
.report-cards .stat .lbl{font-size:0.8rem;color:#94a3b8;margin-top:4px}
.sales-row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end}
.sales-row label{display:flex;flex-direction:column;gap:4px;color:#94a3b8;font-size:13px}
.sales-row select,.sales-row input{min-width:140px;padding:8px 12px;border-radius:8px;border:1px solid #262626;background:#0f0f0f;color:#e2e8f0}
.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.product-grid .prod-btn{padding:12px;background:#0f0f0f;border:1px solid #262626;border-radius:8px;color:#e2e8f0;cursor:pointer;text-align:center;font-size:13px}
.product-grid .prod-btn:hover{background:#1a1a1a;border-color:#f59e0b}
.cart-list{background:#0f0f0f;border-radius:12px;padding:16px;margin-top:16px;border:1px solid #262626;max-height:280px;overflow:auto}
.cart-list .cart-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #262626}
.settings-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.settings-block{background:#0f0f0f;border-radius:12px;padding:20px;border:1px solid #262626}
.settings-block h3{color:#f59e0b;margin:0 0 12px;font-size:1rem}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #262626}
th{color:#f59e0b;font-weight:600}
pre{background:#0a0a0a;padding:16px;border-radius:8px;overflow:auto;font-size:13px;border:1px solid #262626}
.msg{padding:8px 12px;border-radius:8px;margin-top:8px;font-size:13px}
.msg.ok{background:#166534;color:#bbf7d0}
.msg.err{background:#991b1b;color:#fecaca}
.tbl-scroll{overflow-x:auto;max-height:320px}
.kds-printer-filter{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.kds-printer-chk{display:inline-flex;align-items:center;gap:4px;color:#e2e8f0;font-size:13px;cursor:pointer}
.kds-printer-chk input{margin:0;cursor:pointer}
.printer-card{background:#0f0f0f;border:1px solid #262626;border-radius:12px;padding:20px;margin-bottom:16px}
.printer-card h4{margin:0 0 12px;color:#e2e8f0;font-size:1.1rem}
.printer-card .info{color:#94a3b8;font-size:13px;margin:4px 0}
.printer-card .status{display:inline-block;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;margin:8px 0}
.printer-card .status.online{background:#166534;color:#bbf7d0}
.printer-card .status.offline{background:#444;color:#94a3b8}
.printer-card .actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
.printer-card .btn-small{padding:6px 12px;font-size:12px}
</style>
</head>
<body>
<header class="site-header">
  <h1>Limon POS — Back Office</h1>
  <div class="info">Device: <code id="url"></code> — Synced with API</div>
</header>
<nav class="site-nav">
  <a href="#" class="nav-link active" data-page="kds">KDS</a>
</nav>
<main class="main">
  <div id="kds" class="panel active">
    <div class="kds-header">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="kds-title">🍳 Kitchen Display</div>
        <div class="kds-printer-btns">
          <span>Printer:</span>
          <button type="button" class="kds-printer-btn active" id="kds-printer-all" data-id="all" onclick="selectKdsPrinter('all')">All</button>
          <div id="kds-printer-list" style="display:inline-flex;flex-wrap:wrap;gap:6px"></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:16px">
        <div class="kds-status">
          <span class="kds-status-item kds-status-pending"><span class="icon">🔔</span> <span id="kds-pending-count">0</span> Pending</span>
          <span class="kds-status-item kds-status-preparing"><span class="icon">⏱</span> <span id="kds-preparing-count">0</span> Preparing</span>
          <span class="kds-status-item kds-status-delayed"><span class="icon">⚠</span> <span id="kds-delayed-count">0</span> Delayed</span>
        </div>
        <span class="kds-speaker" title="Sound on">🔊</span>
        <button class="btn btn-refresh" onclick="loadKitchen()">Refresh</button>
      </div>
    </div>
    <div id="kitchen-orders"></div>
    <div id="late-modal" class="modal-overlay" style="display:none">
      <div class="modal-box late">
        <h3>Delayed (Late)</h3>
        <p style="color:#94a3b8;margin:0 0 12px">Items not prepared for 10 minutes or not removed from KDS:</p>
        <ul id="late-list"></ul>
        <button class="btn-close" onclick="closeLateModal()">OK</button>
      </div>
    </div>
  </div>
  <div id="settings" class="panel">
    <div style="margin-bottom:20px">
      <a href="/floor-plan" class="btn btn-refresh" style="display:inline-block;text-decoration:none">Floor Plan</a>
    </div>
    <h2 class="section-title">Reports</h2>
    <div class="report-cards" id="report-summary"></div>
    <h3 style="color:#94a3b8;margin:24px 0 8px">Paid Orders</h3>
    <div class="tbl-scroll"><table><thead><tr><th>Table</th><th>Total</th><th>Payment</th></tr></thead><tbody id="orders-paid-tbody"></tbody></table></div>
    <h3 style="color:#94a3b8;margin:24px 0 8px">Payments</h3>
    <div class="tbl-scroll"><table><thead><tr><th>Amount</th><th>Method</th><th>Date</th></tr></thead><tbody id="payments-tbody"></tbody></table></div>
  </div>
</main>
<script>
const base = location.origin;
document.getElementById('url').textContent = base;
let currentOrderId = null, currentTableNumber = null, products = [], tables = [], waiters = [], orderItems = [];
var lastSeenItemIds = {};
var kdsKitchenPrinters = [];
var kdsSelectedPrinterIds = null;
function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatProductNameLines(name) {
  if (!name) return ''; var words = name.trim().split(/\s+/);
  if (words.length <= 2) return escapeHtml(name);
  return escapeHtml(words.slice(0, 2).join(' ')) + '<br>' + escapeHtml(words.slice(2).join(' '));
}
function playNewOrderSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator(); var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    setTimeout(function() {
      osc = ctx.createOscillator(); osc.connect(gain);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.frequency.value = 880; osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    }, 200);
  } catch (e) {}
}
function playLateSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 400;
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

document.querySelectorAll('.nav-link').forEach(function(a) {
  a.addEventListener('click', function(e) { e.preventDefault(); showPage(a.getAttribute('data-page')); });
});
function showPage(id) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-link').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  var lnk = document.querySelector('[data-page="' + id + '"]');
  if (lnk) lnk.classList.add('active');
  if (id === 'kds') { loadKdsPrinters(); loadKitchen(); }
  else if (id === 'settings') loadReports();
}
var LATE_MS = 10 * 60 * 1000;
function isLate(it) {
  if (!it.sentAt || it.status === 'ready') return false;
  return (Date.now() - it.sentAt) >= LATE_MS;
}
function closeLateModal() { document.getElementById('late-modal').style.display = 'none'; }
function loadKdsPrinters() {
  fetch(base + '/printers').then(function(r) { return r.json(); }).then(function(list) {
    kdsKitchenPrinters = (list || []).filter(function(p) { return (p.printerType || '').toLowerCase() === 'kitchen' && p.kdsEnabled !== false; });
    var container = document.getElementById('kds-printer-list');
    if (!container) return;
    container.innerHTML = kdsKitchenPrinters.map(function(p) {
      return '<button type="button" class="kds-printer-btn kds-printer-id" data-id="' + (p.id || '').replace(/"/g, '&quot;') + '" onclick="selectKdsPrinter(\'' + (p.id || '').replace(/'/g, "\\\\'") + '\')">' + (p.name || p.id) + '</button>';
    }).join('');
  });
}
function selectKdsPrinter(id) {
  document.querySelectorAll('.kds-printer-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = id === 'all' ? document.getElementById('kds-printer-all') : document.querySelector('.kds-printer-id[data-id="' + id.replace(/"/g, '&quot;') + '"]');
  if (btn) btn.classList.add('active');
  kdsSelectedPrinterIds = (id === 'all' || !id) ? null : (id ? [id] : null);
  loadKitchen();
}
function updateKdsPrinterSelection() {
  var activeBtn = document.querySelector('.kds-printer-btn.active');
  if (!activeBtn) { kdsSelectedPrinterIds = null; return; }
  var id = activeBtn.getAttribute('data-id');
  kdsSelectedPrinterIds = (id === 'all' || !id) ? null : (id ? [id] : null);
}
async function loadKitchen() {
  try {
  updateKdsPrinterSelection();
  var url = base + '/kitchen-orders';
  if (kdsSelectedPrinterIds && kdsSelectedPrinterIds.length > 0) url += '?printers=' + encodeURIComponent(kdsSelectedPrinterIds.join(','));
  var r = await fetch(url);
  var orders = await r.json();
  if (!Array.isArray(orders)) orders = [];
  var allPending = [];
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var items = (o.items || []).filter(function(x) { return x.status === 'sent' || x.status === 'preparing'; });
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
    var items = (o.items || []).filter(function(x) { return x.status === 'sent' || x.status === 'preparing'; });
    if (items.length === 0) continue;
    var hasLate = items.some(isLate);
    var hasSent = items.some(function(x) { return x.status === 'sent'; });
    var hasPreparing = items.some(function(x) { return x.status === 'preparing'; });
    for (var j = 0; j < items.length; j++) {
      if (items[j].status === 'sent') pendingCount++;
      if (items[j].status === 'preparing') preparingCount++;
      if (isLate(items[j])) delayedCount++;
    }
    var cardClass = (hasPreparing ? 'preparing' : 'sent');
    if (hasLate) cardClass += ' late';
    var orderElapsed = 0;
    for (var j = 0; j < items.length; j++) {
      if (items[j].sentAt) orderElapsed = Math.max(orderElapsed, Date.now() - items[j].sentAt);
    }
    var elapsedStr = orderElapsed >= 3600000 ? Math.floor(orderElapsed/3600000) + 'h ' + Math.floor((orderElapsed%3600000)/60000) + 'm' : Math.floor(orderElapsed/60000) + 'm';
    html += '<div class="card ' + cardClass + '">';
    html += '<div class="card-header">';
    html += '<span class="table-num">Table ' + o.tableNumber + '</span>';
    if (hasLate) html += '<span class="kds-delayed-tag">DELAYED</span>';
    html += '<span class="kds-elapsed">⏱ ' + elapsedStr + '</span>';
    html += '</div>';
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      html += '<div class="kds-item-line"><span class="kds-item-name">' + (it.quantity > 1 ? it.quantity + 'x ' : '') + formatProductNameLines(it.productName) + (it.notes ? ' — ' + escapeHtml(it.notes) : '') + '</span><span>';
      if (it.status === 'sent') html += '<button class="btn btn-start" onclick="startItem(\'' + it.id + '\')">Start</button>';
      if (it.status === 'preparing') html += '<button class="btn btn-ready" onclick="readyItem(\'' + it.id + '\')">✓ Ready</button>';
      html += '</span></div>';
    }
    if (hasSent && hasPreparing) {
      html += '<div class="kds-card-actions"><button class="kds-btn-order-ready" onclick="orderReady(\'' + o.id + '\')">✓ Order Ready</button></div>';
    } else if (hasSent) {
      html += '<div class="kds-card-actions"><button class="kds-btn-start-all" onclick="startAll(\'' + o.id + '\')">Start All</button></div>';
    } else if (hasPreparing) {
      html += '<div class="kds-card-actions"><button class="kds-btn-order-ready" onclick="orderReady(\'' + o.id + '\')">✓ Order Ready</button></div>';
    }
    html += '</div>';
  }
  document.getElementById('kitchen-orders').innerHTML = html || '<p style="color:#94a3b8">No pending orders</p>';
  var pendEl = document.getElementById('kds-pending-count');
  var prepEl = document.getElementById('kds-preparing-count');
  var delEl = document.getElementById('kds-delayed-count');
  if (pendEl) pendEl.textContent = pendingCount;
  if (prepEl) prepEl.textContent = preparingCount;
  if (delEl) delEl.textContent = delayedCount;
  } catch (e) {
    var el = document.getElementById('kitchen-orders');
    if (el) el.innerHTML = '<p style="color:#94a3b8">No pending orders</p>';
  }
}
function startAll(orderId) {
  fetch(base + '/kitchen-orders/orders/' + encodeURIComponent(orderId) + '/start-all', { method: 'POST' }).then(function() { loadKitchen(); });
}
function orderReady(orderId) {
  fetch(base + '/kitchen-orders/orders/' + encodeURIComponent(orderId) + '/ready', { method: 'POST' }).then(function() { loadKitchen(); });
}
function checkLateAndShowPopup() {
  var url = base + '/kitchen-orders';
  if (kdsSelectedPrinterIds && kdsSelectedPrinterIds.length > 0) url += '?printers=' + encodeURIComponent(kdsSelectedPrinterIds.join(','));
  fetch(url).then(function(r) { return r.json(); }).then(function(orders) {
    if (!Array.isArray(orders)) return;
    var lateItems = [];
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      var items = (o.items || []).filter(function(x) { return (x.status === 'sent' || x.status === 'preparing') && isLate(x); });
      for (var j = 0; j < items.length; j++) {
        lateItems.push({ order: o, item: items[j] });
      }
    }
    if (lateItems.length > 0) {
      var listHtml = lateItems.map(function(x) {
        var it = x.item;
        return '<li><strong>Table ' + x.order.tableNumber + '</strong> — ' + it.productName + (it.quantity > 1 ? ' x' + it.quantity : '') + '</li>';
      }).join('');
      document.getElementById('late-list').innerHTML = listHtml;
      document.getElementById('late-modal').style.display = 'flex';
      playLateSound();
    }
  });
}
function startItem(id) { fetch(base + '/kitchen-orders/items/' + encodeURIComponent(id) + '/preparing', { method: 'POST' }).then(function() { loadKitchen(); }); }
function readyItem(id) { fetch(base + '/kitchen-orders/items/' + encodeURIComponent(id) + '/ready', { method: 'POST' }).then(function() { loadKitchen(); }); }
async function loadReports() {
  try {
    var sum = await fetch(base + '/reports/summary').then(function(r) { return r.json(); });
    var orders = await fetch(base + '/reports/orders-paid').then(function(r) { return r.json(); });
    var payments = await fetch(base + '/reports/payments').then(function(r) { return r.json(); });
    document.getElementById('report-summary').innerHTML =
      '<div class="stat"><div class="val">' + (sum.todayRevenue != null ? sum.todayRevenue.toFixed(2) : '0') + ' AED</div><div class="lbl">Today\'s Revenue</div></div>' +
      '<div class="stat"><div class="val">' + (sum.todayOrderCount != null ? sum.todayOrderCount : 0) + '</div><div class="lbl">Orders Today</div></div>' +
      '<div class="stat"><div class="val">' + (sum.totalPaidOrdersCount != null ? sum.totalPaidOrdersCount : 0) + '</div><div class="lbl">Total Closed</div></div>';
    var ord = '';
    (orders || []).slice(0, 50).forEach(function(o) { ord += '<tr><td>' + (o.tableNumber || '-') + '</td><td>' + (o.total != null ? o.total.toFixed(2) : '') + ' AED</td><td>' + (o.paidAt ? new Date(o.paidAt).toLocaleString() : '-') + '</td></tr>'; });
    document.getElementById('orders-paid-tbody').innerHTML = ord || '<tr><td colspan="3">No records</td></tr>';
    var pay = '';
    (payments || []).slice(0, 80).forEach(function(p) { pay += '<tr><td>' + (p.amount != null ? p.amount.toFixed(2) : '') + ' AED</td><td>' + (p.method || '-') + '</td><td>' + (p.createdAt ? new Date(p.createdAt).toLocaleString() : '-') + '</td></tr>'; });
    document.getElementById('payments-tbody').innerHTML = pay || '<tr><td colspan="3">No records</td></tr>';
  } catch (e) { document.getElementById('report-summary').innerHTML = '<p class="msg err">' + e.message + '</p>'; }
}
async function loadSalesData() {
  try {
    var tRes = await fetch(base + '/tables');
    var pRes = await fetch(base + '/products');
    var uRes = await fetch(base + '/users');
    tables = await tRes.json();
    products = await pRes.json();
    waiters = await uRes.json();
    var selT = document.getElementById('sel-table');
    var selW = document.getElementById('sel-waiter');
    selT.innerHTML = '<option value="">— Select table —</option>' + (tables || []).map(function(t) { return '<option value="' + t.id + '">' + (t.number || t.name || t.id) + (t.status === 'occupied' ? ' (occupied)' : '') + '</option>'; }).join('');
    selW.innerHTML = '<option value="">— Select waiter —</option>' + (waiters || []).filter(function(u) { return u.name; }).map(function(u) { return '<option value="' + u.id + '">' + u.name + '</option>'; }).join('');
    var grid = document.getElementById('product-grid');
    grid.innerHTML = (products || []).filter(function(p) { return p.active !== false; }).map(function(p) { return '<button type="button" class="prod-btn" onclick="addToCart(\'' + p.id + '\',\'' + (p.name || '').replace(/'/g, "\\\\'") + '\',' + (p.price != null ? p.price : 0) + ')">' + (p.name || '') + '<br><small>' + (p.price != null ? p.price.toFixed(2) : '') + ' AED</small></button>'; }).join('');
  } catch (e) { document.getElementById('sales-msg').innerHTML = '<p class="msg err">' + e.message + '</p>'; }
}
function addToCart(pid, name, price) {
  if (!currentOrderId) { document.getElementById('sales-msg').innerHTML = '<p class="msg err">Open an order first.</p>'; return; }
  orderItems.push({ productId: pid, productName: name, price: price, quantity: 1 });
  renderCart();
}
function renderCart() {
  var el = document.getElementById('cart-list');
  if (!orderItems.length) { el.innerHTML = '<p style="color:#94a3b8">Cart is empty.</p>'; return; }
  var html = '';
  var total = 0;
  for (var i = 0; i < orderItems.length; i++) {
    var it = orderItems[i];
    total += it.price * it.quantity;
    html += '<div class="cart-item"><span>' + it.productName + ' x ' + it.quantity + ' — ' + (it.price * it.quantity).toFixed(2) + ' AED</span><span><button class="btn" style="padding:4px 8px;font-size:11px" onclick="removeCartItem(' + i + ')">Remove</button></span></div>';
  }
  html += '<div class="cart-item" style="border:none;font-weight:600">Total: ' + total.toFixed(2) + ' AED</div>';
  el.innerHTML = html;
}
function removeCartItem(i) { orderItems.splice(i, 1); renderCart(); }
async function createOrGetOrder() {
  var tableId = document.getElementById('sel-table').value;
  var waiterId = document.getElementById('sel-waiter').value;
  var waiterName = document.getElementById('sel-waiter').selectedOptions[0] ? document.getElementById('sel-waiter').selectedOptions[0].text : '';
  var guestCount = parseInt(document.getElementById('guest-count').value, 10) || 1;
  if (!tableId || !waiterId) { document.getElementById('sales-msg').innerHTML = '<p class="msg err">Select table and waiter.</p>'; return; }
  try {
    var r = await fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableId: tableId, guestCount: guestCount, waiterId: waiterId, waiterName: waiterName }) });
    var j = await r.json();
    if (j.ok && j.orderId) { currentOrderId = j.orderId; currentTableNumber = j.tableNumber || tableId; orderItems = []; document.getElementById('sales-order-info').textContent = 'Order: ' + currentTableNumber + ' (ID: ' + currentOrderId + ')'; renderCart(); document.getElementById('sales-msg').innerHTML = '<p class="msg ok">Order opened / selected.</p>'; }
    else document.getElementById('sales-msg').innerHTML = '<p class="msg err">' + (j.error || 'Error') + '</p>';
  } catch (e) { document.getElementById('sales-msg').innerHTML = '<p class="msg err">' + e.message + '</p>'; }
}
async function sendOrderToKitchen() {
  if (!currentOrderId) { document.getElementById('sales-msg').innerHTML = '<p class="msg err">Open an order and add products first.</p>'; return; }
  for (var i = 0; i < orderItems.length; i++) {
    var it = orderItems[i];
    await fetch(base + '/orders/' + encodeURIComponent(currentOrderId) + '/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: it.productId, productName: it.productName, price: it.price, quantity: it.quantity, notes: '' }) });
  }
  var r = await fetch(base + '/orders/' + encodeURIComponent(currentOrderId) + '/send', { method: 'POST' });
  var j = await r.json();
  document.getElementById('sales-msg').innerHTML = j.ok ? '<p class="msg ok">Sent to kitchen.</p>' : '<p class="msg err">' + (j.error || 'Error') + '</p>';
  if (j.ok) orderItems = [];
  renderCart();
}
async function loadTables() { var r = await fetch(base + '/tables'); var d = await r.json(); document.getElementById('tables-data').textContent = JSON.stringify(d, null, 2); }
async function loadProducts() { var r = await fetch(base + '/products'); var d = await r.json(); document.getElementById('products-data').textContent = JSON.stringify(d, null, 2); }
async function loadCategories() { var r = await fetch(base + '/categories'); var d = await r.json(); document.getElementById('categories-data').textContent = JSON.stringify(d, null, 2); }
async function loadPrinters() {
  var r = await fetch(base + '/printers');
  var list = await r.json();
  var html = '<table><tr><th>Name</th><th>Type</th><th>IP</th><th>Cash</th></tr>';
  var cashier = (list || []).filter(function(p) { return p.printerType === 'cashier' && p.ipAddress; });
  (list || []).forEach(function(p) {
    html += '<tr><td>' + (p.name || '') + '</td><td>' + (p.printerType || '') + '</td><td>' + (p.ipAddress || '-') + '</td><td>';
    if (p.printerType === 'cashier' && p.ipAddress) html += '<button class="btn btn-kasa" data-id="' + p.id + '" data-name="' + (p.name || '').replace(/"/g, '&quot;') + '" onclick="openDrawer(this)">Open Drawer</button>';
    else html += '-';
    html += '</td></tr>';
  });
  html += '</table>';
  document.getElementById('printers-list').innerHTML = html;
  var kasaHtml = '';
  cashier.forEach(function(p) { kasaHtml += '<button class="btn btn-kasa" data-id="' + p.id + '" data-name="' + (p.name || '').replace(/"/g, '&quot;') + '" onclick="openDrawer(this)" style="margin-right:8px;margin-bottom:8px">' + (p.name || '') + ' — Open Drawer</button>'; });
  document.getElementById('kasa-buttons').innerHTML = kasaHtml || '<span style="color:#94a3b8">No cashier printer defined</span>';
}
function openDrawer(btn) {
  var printerId = btn.getAttribute('data-id');
  var name = btn.getAttribute('data-name') || 'Printer';
  var msgEl = document.getElementById('kasa-msg');
  msgEl.innerHTML = '';
  fetch(base + '/printers/' + encodeURIComponent(printerId) + '/open-drawer', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(j) {
    msgEl.className = 'msg ' + (j.ok ? 'ok' : 'err');
    msgEl.textContent = j.ok ? (name + ' — Drawer opened') : (j.message || 'Error');
  }).catch(function(e) { msgEl.className = 'msg err'; msgEl.textContent = e.message; });
}
async function loadModifiers() { var r = await fetch(base + '/modifier-groups'); var d = await r.json(); document.getElementById('modifiers-data').textContent = JSON.stringify(d, null, 2); }
var urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('page') === 'settings') { showPage('settings'); } else { loadKdsPrinters(); loadKitchen(); }
setInterval(function() { if (document.getElementById('kds').classList.contains('active')) loadKitchen(); }, 2000);
setInterval(function() { if (document.getElementById('kds').classList.contains('active')) checkLateAndShowPopup(); }, 10 * 60 * 1000);
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
<title>Limon POS — Floor Plan</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#0a0a0a;color:#e2e8f0;min-height:100vh}
.fp-header{background:#0f0f0f;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid #262626}
.fp-header h1{margin:0;font-size:1.5rem;color:#f59e0b}
.fp-header .info{font-size:0.85rem;color:#94a3b8}
.fp-refresh{background:#f59e0b;color:#000;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer}
.fp-refresh:hover{opacity:.9}
.fp-legend{display:flex;gap:20px;flex-wrap:wrap;align-items:center;padding:12px 24px;background:#0f0f0f;border-bottom:1px solid #262626}
.fp-legend span{display:flex;align-items:center;gap:6px;font-size:13px;color:#94a3b8}
.fp-legend .dot{width:12px;height:12px;border-radius:50%}
.fp-legend .dot.free{background:#22c55e}
.fp-legend .dot.occupied{background:#f59e0b}
.fp-legend .dot.bill{background:#3b82f6}
.fp-floors{display:flex;gap:8px;padding:12px 24px;flex-wrap:wrap}
.fp-floor-btn{padding:10px 18px;border-radius:8px;border:1px solid #262626;background:#0f0f0f;color:#e2e8f0;cursor:pointer;font-weight:500}
.fp-floor-btn:hover{background:#1a1a1a;border-color:#f59e0b}
.fp-floor-btn.active{background:#f59e0b;color:#000;border-color:#f59e0b}
.fp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px;padding:24px;max-width:1400px;margin:0 auto}
.fp-table{aspect-ratio:0.9;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:transform .15s;border:2px solid transparent}
.fp-table:hover{transform:scale(1.02)}
.fp-table.free{background:#166534;border-color:#22c55e}
.fp-table.occupied{background:#1c1917;border-color:#f59e0b}
.fp-table.bill{background:#1e3a5f;border-color:#3b82f6}
.fp-table.reserved{background:#1e293b;border-color:#64748b}
.fp-table-name{font-weight:700;font-size:1.1rem;color:#fff}
.fp-table-num{font-size:0.85rem;color:rgba(255,255,255,0.7)}
.fp-table-status{font-size:0.75rem;margin-top:4px;font-weight:600}
.fp-table.free .fp-table-status{color:#86efac}
.fp-table.occupied .fp-table-status{color:#fcd34d}
.fp-table.bill .fp-table-status{color:#93c5fd}
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;z-index:9999}
.modal-box{background:#0f0f0f;border:2px solid #f59e0b;border-radius:16px;padding:24px;max-width:420px;width:90%}
.modal-box h3{margin:0 0 16px;color:#f59e0b}
.modal-box label{display:block;margin-bottom:8px;color:#94a3b8;font-size:13px}
.modal-box select,.modal-box input{width:100%;padding:12px;border-radius:8px;border:1px solid #262626;background:#0a0a0a;color:#e2e8f0;margin-bottom:16px}
.modal-btns{display:flex;gap:12px;margin-top:20px}
.modal-btns button{padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;border:none}
.modal-btns .btn-ok{background:#f59e0b;color:#000}
.modal-btns .btn-cancel{background:#262626;color:#e2e8f0}
.msg{padding:10px;border-radius:8px;margin:12px 0;font-size:14px}
.msg.ok{background:#166534;color:#bbf7d0}
.msg.err{background:#991b1b;color:#fecaca}
.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;max-height:200px;overflow-y:auto}
.prod-btn{padding:10px;background:#1a1a1a;border:1px solid #262626;border-radius:8px;color:#e2e8f0;cursor:pointer;font-size:12px;text-align:center}
.prod-btn:hover{background:#262626;border-color:#f59e0b}
.cart-list{max-height:120px;overflow-y:auto;margin:12px 0}
.cart-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #262626}
</style>
</head>
<body>
<header class="fp-header">
  <h1>Floor Plan — Synced with App</h1>
  <div class="info">Device: <code id="fp-url"></code> — Auto-refresh every 3s</div>
  <a href="/" style="color:#f59e0b;text-decoration:none;margin-right:12px">← Back to KDS</a>
  <button class="fp-refresh" onclick="loadFloorPlan()">Refresh</button>
</header>
<div class="fp-legend">
  <span><span class="dot free"></span>Free</span>
  <span><span class="dot occupied"></span>Occupied</span>
  <span><span class="dot bill"></span>Bill</span>
</div>
<div class="fp-floors" id="fp-floors"></div>
<div class="fp-grid" id="fp-tables"></div>
<div id="open-table-modal" class="modal-overlay" style="display:none">
  <div class="modal-box">
    <h3>Open Table <span id="open-table-name"></span></h3>
    <label>Waiter</label>
    <select id="open-waiter"></select>
    <label>Guest count</label>
    <input type="number" id="open-guests" value="1" min="1" max="20">
    <div id="open-msg"></div>
    <div class="modal-btns">
      <button class="btn-ok" onclick="confirmOpenTable()">Open</button>
      <button class="btn-cancel" onclick="closeOpenModal()">Cancel</button>
    </div>
  </div>
</div>
<div id="add-order-modal" class="modal-overlay" style="display:none">
  <div class="modal-box" style="max-width:500px">
    <h3>Add Order — Table <span id="add-table-name"></span></h3>
    <label>Products</label>
    <div class="product-grid" id="add-products"></div>
    <label>Cart</label>
    <div class="cart-list" id="add-cart"></div>
    <div id="add-msg"></div>
    <div class="modal-btns">
      <button class="btn-ok" onclick="sendOrderToKitchen()">Send to Kitchen</button>
      <button class="btn-cancel" onclick="closeAddModal()">Cancel</button>
    </div>
  </div>
</div>
<script>
const base = location.origin;
document.getElementById('fp-url').textContent = base;
let tables = [], users = [], products = [];
let selectedFloor = 'Main';
let openTableId = null;
let addOrderId = null, addTableName = '', addCart = [];

function escapeHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function loadFloorPlan() {
  try {
    var tRes = await fetch(base + '/tables');
    var uRes = await fetch(base + '/users');
    tables = await tRes.json();
    users = await uRes.json();
    var floors = [...new Set((tables || []).map(function(t){return t.floor||'Main'}))].sort();
    var floorHtml = floors.map(function(f) {
      return '<button class="fp-floor-btn' + (f === selectedFloor ? ' active' : '') + '" onclick="selectFloor(\'' + escapeHtml(f).replace(/'/g,"\\\\'") + '\')">' + escapeHtml(f) + '</button>';
    }).join('');
    document.getElementById('fp-floors').innerHTML = floorHtml || '<button class="fp-floor-btn active">Main</button>';
    var onFloor = (tables || []).filter(function(t){ return (t.floor||'Main') === selectedFloor; });
    var tableHtml = onFloor.map(function(t) {
      var status = t.status || 'free';
      var statusText = status === 'free' ? 'Free' : (status === 'bill' ? 'Bill' : (status === 'reserved' ? 'Reserved' : 'Occupied'));
      return '<div class="fp-table ' + status + '" data-id="' + escapeHtml(t.id) + '" data-status="' + status + '" onclick="onTableClick(\'' + escapeHtml(t.id).replace(/'/g,"\\\\'") + '\',\'' + status.replace(/'/g,"\\\\'") + '\')">' +
        '<span class="fp-table-name">' + escapeHtml(t.name || t.number || t.id) + '</span>' +
        '<span class="fp-table-num">' + escapeHtml(t.number || '') + '</span>' +
        '<span class="fp-table-status">' + statusText + (t.waiterName ? ' — ' + escapeHtml(t.waiterName) : '') + '</span>' +
        '</div>';
    }).join('');
    document.getElementById('fp-tables').innerHTML = tableHtml || '<p style="color:#94a3b8">No tables on this floor</p>';
  } catch (e) {
    document.getElementById('fp-tables').innerHTML = '<p class="msg err">Error: ' + escapeHtml(e.message) + '</p>';
  }
}

function selectFloor(f) { selectedFloor = f; loadFloorPlan(); }

function onTableClick(tableId, status) {
  if (status === 'free') {
    openTableId = tableId;
    var tbl = (tables || []).find(function(t){ return t.id === tableId; });
    document.getElementById('open-table-name').textContent = (tbl && tbl.number) ? tbl.number : tableId;
    var waiterOpts = '<option value="">— Select waiter —</option>' + (users || []).filter(function(u){ return u.name; }).map(function(u) {
      return '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(u.name) + '</option>';
    }).join('');
    document.getElementById('open-waiter').innerHTML = waiterOpts;
    document.getElementById('open-msg').innerHTML = '';
    document.getElementById('open-table-modal').style.display = 'flex';
  } else {
    var tbl = (tables || []).find(function(t){ return t.id === tableId; });
    if (!tbl || !tbl.currentOrderId) return;
    addOrderId = tbl.currentOrderId;
    addTableName = (tbl && tbl.number) ? tbl.number : tableId;
    addCart = [];
    document.getElementById('add-table-name').textContent = addTableName;
    loadProductsForAdd();
    renderAddCart();
    document.getElementById('add-msg').innerHTML = '';
    document.getElementById('add-order-modal').style.display = 'flex';
  }
}

async function confirmOpenTable() {
  var waiterId = document.getElementById('open-waiter').value;
  var waiterOpt = document.getElementById('open-waiter').selectedOptions[0];
  var waiterName = waiterOpt ? waiterOpt.text : '';
  var guestCount = parseInt(document.getElementById('open-guests').value, 10) || 1;
  if (!waiterId || !waiterName) {
    document.getElementById('open-msg').innerHTML = '<p class="msg err">Select waiter.</p>';
    return;
  }
  try {
    var r = await fetch(base + '/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId: openTableId, guestCount: guestCount, waiterId: waiterId, waiterName: waiterName })
    });
    var j = await r.json();
    if (j.ok) {
      closeOpenModal();
      loadFloorPlan();
    } else {
      document.getElementById('open-msg').innerHTML = '<p class="msg err">' + (j.error || 'Error') + '</p>';
    }
  } catch (e) {
    document.getElementById('open-msg').innerHTML = '<p class="msg err">' + escapeHtml(e.message) + '</p>';
  }
}

function closeOpenModal() {
  document.getElementById('open-table-modal').style.display = 'none';
  openTableId = null;
}

async function loadProductsForAdd() {
  try {
    var r = await fetch(base + '/products');
    products = await r.json();
    var html = (products || []).filter(function(p){ return p.active !== false; }).map(function(p) {
      return '<button class="prod-btn" onclick="addToCart(\'' + escapeHtml(p.id).replace(/'/g,"\\\\'") + '\',\'' + escapeHtml(p.name||'').replace(/'/g,"\\\\'") + '\',' + (p.price != null ? p.price : 0) + ')">' + escapeHtml(p.name||'') + '<br><small>' + (p.price != null ? p.price.toFixed(2) : '') + '</small></button>';
    }).join('');
    document.getElementById('add-products').innerHTML = html || '<p style="color:#94a3b8">No products</p>';
  } catch (e) {}
}

function addToCart(pid, name, price) {
  addCart.push({ productId: pid, productName: name, price: price, quantity: 1 });
  renderAddCart();
}

function renderAddCart() {
  var el = document.getElementById('add-cart');
  if (!addCart.length) { el.innerHTML = '<p style="color:#94a3b8">Cart empty</p>'; return; }
  var html = '';
  var total = 0;
  for (var i = 0; i < addCart.length; i++) {
    var it = addCart[i];
    total += it.price * it.quantity;
    html += '<div class="cart-item"><span>' + escapeHtml(it.productName) + ' x' + it.quantity + ' — ' + (it.price * it.quantity).toFixed(2) + '</span><button class="btn-cancel" style="padding:4px 8px;font-size:11px" onclick="removeCartItem(' + i + ')">Remove</button></div>';
  }
  html += '<div class="cart-item" style="border:none;font-weight:600">Total: ' + total.toFixed(2) + '</div>';
  el.innerHTML = html;
}

function removeCartItem(i) { addCart.splice(i, 1); renderAddCart(); }

async function sendOrderToKitchen() {
  if (!addCart.length) {
    document.getElementById('add-msg').innerHTML = '<p class="msg err">Add products first.</p>';
    return;
  }
  try {
    for (var i = 0; i < addCart.length; i++) {
      var it = addCart[i];
      await fetch(base + '/orders/' + encodeURIComponent(addOrderId) + '/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: it.productId, productName: it.productName, price: it.price, quantity: it.quantity, notes: '' })
      });
    }
    var r = await fetch(base + '/orders/' + encodeURIComponent(addOrderId) + '/send', { method: 'POST' });
    var j = await r.json();
    if (j.ok) {
      document.getElementById('add-msg').innerHTML = '<p class="msg ok">Sent to kitchen. Synced with app.</p>';
      addCart = [];
      renderAddCart();
      setTimeout(function(){ closeAddModal(); loadFloorPlan(); }, 800);
    } else {
      document.getElementById('add-msg').innerHTML = '<p class="msg err">' + (j.error || 'Error') + '</p>';
    }
  } catch (e) {
    document.getElementById('add-msg').innerHTML = '<p class="msg err">' + escapeHtml(e.message) + '</p>';
  }
}

function closeAddModal() {
  document.getElementById('add-order-modal').style.display = 'none';
  addOrderId = null;
  addCart = [];
}

loadFloorPlan();
setInterval(loadFloorPlan, 3000);
</script>
</body>
</html>
        """.trimIndent()
    }
}
