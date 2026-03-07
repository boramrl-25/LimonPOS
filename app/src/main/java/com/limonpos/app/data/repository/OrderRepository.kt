package com.limonpos.app.data.repository

import androidx.room.withTransaction
import com.limonpos.app.data.local.AppDatabase
import com.limonpos.app.data.local.dao.AppliedClientActionDao
import com.limonpos.app.data.local.dao.OrderDao
import com.limonpos.app.data.local.dao.OrderItemDao
import com.limonpos.app.data.local.dao.PaymentDao
import com.limonpos.app.data.local.dao.ProductDao
import com.limonpos.app.data.local.dao.VoidLogDao
import com.limonpos.app.data.local.entity.AppliedClientActionEntity
import com.limonpos.app.data.local.entity.OrderEntity
import com.limonpos.app.data.local.entity.VoidLogEntity
import com.limonpos.app.data.local.entity.OrderItemEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import java.util.UUID
import javax.inject.Inject

data class OrderWithItems(
    val order: OrderEntity,
    val items: List<OrderItemEntity>
)

data class OverdueUndelivered(
    val tableNumber: String,
    val tableId: String,
    val orderId: String,
    val items: List<OrderItemEntity>
)

class OrderRepository @Inject constructor(
    private val database: AppDatabase,
    private val orderDao: OrderDao,
    private val orderItemDao: OrderItemDao,
    private val appliedClientActionDao: AppliedClientActionDao,
    private val paymentDao: PaymentDao,
    private val tableRepository: TableRepository,
    private val voidLogDao: VoidLogDao,
    private val productDao: ProductDao
) {
    suspend fun createOrder(
        tableId: String,
        guestCount: Int,
        waiterId: String,
        waiterName: String
    ): OrderEntity {
        val table = tableRepository.getTableById(tableId) ?: throw Exception("Table not found")
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val order = OrderEntity(
            id = id,
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
            createdAt = now,
            paidAt = null,
            syncStatus = "PENDING"
        )
        orderDao.insertOrder(order)
        return order
    }

    /**
     * Add item to order. If [clientActionId] is provided and was already applied, this is a no-op (idempotent).
     * Returns the created/updated item when [clientActionId] is null (e.g. server/KDS); null when idempotent skip.
     */
    suspend fun addItem(
        orderId: String,
        productId: String,
        productName: String,
        price: Double,
        quantity: Int,
        notes: String = "",
        clientActionId: String? = null
    ): OrderItemEntity? {
        if (clientActionId != null) {
            database.withTransaction {
                if (appliedClientActionDao.countById(clientActionId) > 0) return@withTransaction
                doAddOrMergeItem(orderId, productId, productName, price, quantity, notes)
                appliedClientActionDao.insert(AppliedClientActionEntity(clientActionId))
            }
            return null
        }
        return doAddOrMergeItem(orderId, productId, productName, price, quantity, notes)
    }

    private suspend fun doAddOrMergeItem(
        orderId: String,
        productId: String,
        productName: String,
        price: Double,
        quantity: Int,
        notes: String
    ): OrderItemEntity? {
        orderDao.getOrderById(orderId) ?: throw Exception("Order not found")
        val existing = orderItemDao.getOrderItems(orderId).first()
            .firstOrNull { it.status == "pending" && it.productId == productId && it.price == price && it.notes == notes }
        return if (existing != null) {
            val safeQty = quantity.coerceAtLeast(1)
            updateItemQuantityAndNotes(existing.id, existing.quantity + safeQty, existing.notes)
            orderItemDao.getOrderItemById(existing.id)
        } else {
            val clientLineId = UUID.randomUUID().toString()
            val item = OrderItemEntity(
                id = clientLineId,
                orderId = orderId,
                productId = productId,
                productName = productName,
                quantity = quantity.coerceAtLeast(1),
                price = price,
                notes = notes,
                status = "pending",
                sentAt = null,
                clientLineId = clientLineId,
                apiId = null,
                syncStatus = "PENDING"
            )
            orderItemDao.insertOrderItem(item)
            updateOrderTotals(orderId)
            item
        }
    }

    private suspend fun updateOrderTotals(orderId: String) {
        val order = orderDao.getOrderById(orderId) ?: return
        val items = orderItemDao.getOrderItems(orderId).first()
        val subtotal = items.sumOf { it.price * it.quantity }
        val taxAmount = order.taxAmount
        val discount = order.discountPercent / 100.0 * subtotal + order.discountAmount
        val total = (subtotal + taxAmount - discount).coerceAtLeast(0.0)
        val updated = order.copy(
            subtotal = subtotal,
            total = total,
            syncStatus = "PENDING"
        )
        orderDao.updateOrder(updated)
    }

    suspend fun sendToKitchen(orderId: String) {
        val order = orderDao.getOrderById(orderId) ?: throw Exception("Order not found")
        orderDao.updateOrder(order.copy(status = "sent", syncStatus = "PENDING"))
        val now = System.currentTimeMillis()
        val items = orderItemDao.getOrderItems(orderId).first()
        for (item in items) {
            if (item.sentAt == null) {
                orderItemDao.updateOrderItem(item.copy(status = "sent", sentAt = now, syncStatus = "PENDING"))
            }
        }
    }

    /** Mark items as sent. sentAt = first send time, set only when null (immutable once set). Retry/reprint do not touch sentAt. */
    suspend fun markItemsAsSent(orderId: String, itemIds: List<String>) {
        if (itemIds.isEmpty()) return
        val order = orderDao.getOrderById(orderId) ?: return
        val now = System.currentTimeMillis()
        for (item in orderItemDao.getOrderItems(orderId).first()) {
            if (item.id in itemIds) {
                if (item.sentAt == null) {
                    orderItemDao.updateOrderItem(item.copy(status = "sent", sentAt = now, syncStatus = "PENDING"))
                } else {
                    orderItemDao.updateOrderItem(item.copy(status = "sent", syncStatus = "PENDING"))
                }
            }
        }
        orderDao.updateOrder(order.copy(status = "sent", syncStatus = "PENDING"))
    }

    suspend fun markItemPreparing(itemId: String) {
        val item = orderItemDao.getOrderItemById(itemId) ?: return
        orderItemDao.updateOrderItem(item.copy(status = "preparing", syncStatus = "PENDING"))
    }

    suspend fun markItemReady(itemId: String) {
        val item = orderItemDao.getOrderItemById(itemId) ?: return
        orderItemDao.updateOrderItem(item.copy(status = "ready", syncStatus = "PENDING"))
    }

    suspend fun markItemDelivered(itemId: String): Boolean {
        val item = orderItemDao.getOrderItemById(itemId) ?: return false
        if (item.sentAt == null) return false
        val now = System.currentTimeMillis()
        orderItemDao.markDelivered(itemId, now)
        return true
    }

    /**
     * Items sent to kitchen but not delivered, past their due time.
     * Only product.overdueUndeliveredMinutes (1..1440). If null, feature disabled for that item.
     * Excludes sentAt == null and deliveredAt != null.
     */
    suspend fun getOverdueUndelivered(): List<OverdueUndelivered> {
        val orders = orderDao.getOpenAndSentOrders()
        val result = mutableListOf<OverdueUndelivered>()
        val now = System.currentTimeMillis()
        for (order in orders) {
            if (order.status == "paid" || order.status == "closed") continue
            val table = tableRepository.getTableById(order.tableId)
            if (table == null || table.status == "free") continue
            if (table.currentOrderId == null || table.currentOrderId != order.id) continue
            val totalPaid = paymentDao.getPaymentsSumByOrder(order.id)
            if (totalPaid >= order.total - 0.01) continue
            val items = orderItemDao.getOrderItems(order.id).first()
            val overdue = items.filter { item ->
                if (item.sentAt == null) return@filter false
                if (item.deliveredAt != null) return@filter false
                val product = productDao.getProductById(item.productId)
                val minutes = product?.overdueUndeliveredMinutes ?: return@filter false
                if (minutes !in 1..1440) return@filter false
                val cutoff = now - minutes * 60 * 1000L
                item.sentAt < cutoff
            }
            if (overdue.isNotEmpty()) {
                result.add(OverdueUndelivered(tableNumber = order.tableNumber, tableId = order.tableId, orderId = order.id, items = overdue))
            }
        }
        return result
    }

    suspend fun updateItemNotes(itemId: String, notes: String) {
        val item = orderItemDao.getOrderItemById(itemId) ?: return
        orderItemDao.updateOrderItem(item.copy(notes = notes, syncStatus = "PENDING"))
    }

    suspend fun updateItemQuantityAndNotes(itemId: String, quantity: Int, notes: String) {
        val item = orderItemDao.getOrderItemById(itemId) ?: return
        val safeQty = quantity.coerceAtLeast(1)
        val updated = item.copy(quantity = safeQty, notes = notes, syncStatus = "PENDING")
        orderItemDao.updateOrderItem(updated)
        updateOrderTotals(updated.orderId)
    }

    suspend fun removeItem(itemId: String) {
        val item = orderItemDao.getOrderItemById(itemId) ?: return
        val order = orderDao.getOrderById(item.orderId) ?: return
        orderItemDao.deleteOrderItem(item)
        updateOrderTotals(order.id)
    }

    /** Refund full bill: Remove all items from recalled order, delete payments, close table. Logs refund_full. */
    suspend fun refundFullOrder(orderId: String, userId: String, userName: String): Boolean {
        val order = orderDao.getOrderById(orderId) ?: return false
        val isRecalled = voidLogDao.existsRecalledForOrder(orderId)
        if (!isRecalled) return false
        val items = orderItemDao.getOrderItems(orderId).first()
        if (items.isEmpty()) return false
        val totalAmount = items.sumOf { it.price * it.quantity }
        for (item in items) {
            orderItemDao.deleteOrderItem(item)
        }
        voidLogDao.insert(
            VoidLogEntity(
                type = "refund_full",
                orderId = orderId,
                productName = items.joinToString(", ") { "${it.quantity}x ${it.productName}" },
                quantity = items.sumOf { it.quantity },
                amount = totalAmount,
                sourceTableId = order.tableId,
                sourceTableNumber = order.tableNumber,
                userId = userId,
                userName = userName,
                details = "Full bill refund - all items"
            )
        )
        paymentDao.deletePaymentsByOrder(orderId)
        orderDao.deleteOrder(order)
        tableRepository.closeTable(order.tableId)
        return true
    }

    /** Refund: Remove item from recalled order. Logs to void_logs with type refund. No PIN required. */
    suspend fun refundItem(itemId: String, userId: String, userName: String): Boolean {
        val item = orderItemDao.getOrderItemById(itemId) ?: return false
        val order = orderDao.getOrderById(item.orderId) ?: return false
        val isRecalled = voidLogDao.existsRecalledForOrder(order.id)
        if (!isRecalled) return false
        val amount = item.price * item.quantity
        orderItemDao.deleteOrderItem(item)
        updateOrderTotals(order.id)
        voidLogDao.insert(
            VoidLogEntity(
                type = "refund",
                orderId = order.id,
                orderItemId = item.id,
                productName = item.productName,
                quantity = item.quantity,
                price = item.price,
                amount = amount,
                sourceTableId = order.tableId,
                sourceTableNumber = order.tableNumber,
                userId = userId,
                userName = userName,
                details = "Refund from recalled order"
            )
        )
        return true
    }

    suspend fun isOrderRecalled(orderId: String): Boolean = voidLogDao.existsRecalledForOrder(orderId)

    /** Post-void: Remove item that was sent to kitchen (sent/preparing/ready). Logs to void_logs with type post_void. */
    suspend fun voidItem(itemId: String, userId: String, userName: String): Boolean {
        val item = orderItemDao.getOrderItemById(itemId) ?: return false
        if (item.status == "pending") return false
        val order = orderDao.getOrderById(item.orderId) ?: return false
        val amount = item.price * item.quantity
        orderItemDao.deleteOrderItem(item)
        updateOrderTotals(order.id)
        voidLogDao.insert(
            VoidLogEntity(
                type = "post_void",
                orderId = order.id,
                orderItemId = item.id,
                productName = item.productName,
                quantity = item.quantity,
                price = item.price,
                amount = amount,
                sourceTableId = order.tableId,
                sourceTableNumber = order.tableNumber,
                userId = userId,
                userName = userName,
                details = "Voided after send to kitchen"
            )
        )
        return true
    }

    suspend fun markOrderPreparing(orderId: String) {
        val items = orderItemDao.getOrderItems(orderId).first()
        for (item in items) {
            if (item.status == "sent") {
                orderItemDao.updateOrderItem(item.copy(status = "preparing", syncStatus = "PENDING"))
            }
        }
    }

    suspend fun markOrderReady(orderId: String) {
        val items = orderItemDao.getOrderItems(orderId).first()
        for (item in items) {
            if (item.status == "sent" || item.status == "preparing") {
                orderItemDao.updateOrderItem(item.copy(status = "ready", syncStatus = "PENDING"))
            }
        }
    }

    fun getKitchenOrders(): Flow<List<OrderWithItems>> = orderDao.getOrdersSentToKitchen().flatMapLatest { orders ->
        if (orders.isEmpty()) flowOf(emptyList())
        else {
            val itemFlows = orders.map { order -> orderItemDao.getOrderItems(order.id) }
            combine(itemFlows) { itemsPerOrder ->
                orders.zip(itemsPerOrder.toList()).map { (order, items) -> OrderWithItems(order, items) }
            }
        }
    }

    suspend fun getPaidOrders(): List<OrderEntity> = orderDao.getPaidOrders()

    suspend fun getActiveOrderByTable(tableId: String): OrderEntity? =
        orderDao.getActiveOrderByTable(tableId)

    suspend fun closeTableIfOrderEmpty(tableId: String) {
        val order = orderDao.getActiveOrderByTable(tableId) ?: return
        val items = orderItemDao.getOrderItems(order.id).first()
        if (items.isEmpty()) {
            tableRepository.closeTable(tableId)
            orderItemDao.deleteOrderItems(order.id)
            orderDao.deleteOrder(order)
        }
    }

    /** Returns error message if table cannot be closed (has items and not paid), null if close is allowed. */
    suspend fun getCloseTableBlockReason(tableId: String): String? {
        val order = orderDao.getActiveOrderByTable(tableId) ?: return null
        val items = orderItemDao.getOrderItems(order.id).first()
        if (items.isEmpty()) return null
        if (order.status == "paid") return null
        return "Cannot close table. Complete payment or remove all items first."
    }

    suspend fun closeTableManually(tableId: String) {
        val order = orderDao.getActiveOrderByTable(tableId)
        if (order != null) {
            orderItemDao.deleteOrderItems(order.id)
            orderDao.deleteOrder(order)
        }
        tableRepository.closeTable(tableId)
    }

    fun getOrderWithItems(orderId: String): Flow<OrderWithItems?> =
        combine(
            orderDao.getOrderFlow(orderId),
            orderItemDao.getOrderItems(orderId)
        ) { order, items ->
            order?.let { OrderWithItems(it, items) }
        }

    suspend fun markOrderPaid(orderId: String) {
        val now = System.currentTimeMillis()
        orderDao.markOrderPaid(orderId, now)
    }

    /**
     * Recall closed bill to table: reverses all payment operations, order becomes editable.
     * - Order status: paid -> sent, paidAt cleared
     * - Table occupied with order (as if never closed)
     * - User can then change payment or add/remove items
     */
    /** Refund single item from a closed (paid) bill. Logs refund to void_logs. */
    suspend fun refundItemFromClosedBill(orderId: String, itemId: String, userId: String, userName: String): Boolean {
        val order = orderDao.getOrderById(orderId) ?: return false
        if (order.status != "paid") return false
        val item = orderItemDao.getOrderItemById(itemId) ?: return false
        if (item.orderId != orderId) return false
        val amount = item.price * item.quantity
        orderItemDao.deleteOrderItem(item)
        updateOrderTotals(orderId)
        voidLogDao.insert(
            VoidLogEntity(
                type = "refund",
                orderId = orderId,
                orderItemId = item.id,
                productName = item.productName,
                quantity = item.quantity,
                price = item.price,
                amount = amount,
                sourceTableId = order.tableId,
                sourceTableNumber = order.tableNumber,
                userId = userId,
                userName = userName,
                details = "Refund from closed bill"
            )
        )
        return true
    }

    /** Full refund of a closed (paid) bill. Logs refund_full, removes items/payments/order, frees table. */
    suspend fun refundFullClosedBill(orderId: String, userId: String, userName: String): Boolean {
        val order = orderDao.getOrderById(orderId) ?: return false
        if (order.status != "paid") return false
        val items = orderItemDao.getOrderItems(orderId).first()
        val totalAmount = if (items.isEmpty()) order.total else items.sumOf { it.price * it.quantity }
        voidLogDao.insert(
            VoidLogEntity(
                type = "refund_full",
                orderId = orderId,
                productName = items.joinToString(", ") { "${it.quantity}x ${it.productName}" }.ifEmpty { "Full bill" },
                quantity = items.sumOf { it.quantity },
                amount = totalAmount,
                sourceTableId = order.tableId,
                sourceTableNumber = order.tableNumber,
                userId = userId,
                userName = userName,
                details = "Full bill refund - closed bill"
            )
        )
        orderItemDao.deleteOrderItems(orderId)
        paymentDao.deletePaymentsByOrder(orderId)
        orderDao.deleteOrder(order)
        tableRepository.closeTable(order.tableId)
        return true
    }

    /** Change payment method on a closed (paid) bill. Logs to void_logs as payment_method_change for dashboard. */
    suspend fun changePaymentMethodOnClosedBill(orderId: String, paymentId: String, newMethod: String, userId: String, userName: String): Boolean {
        val order = orderDao.getOrderById(orderId) ?: return false
        if (order.status != "paid") return false
        val payment = paymentDao.getPaymentById(paymentId) ?: return false
        if (payment.orderId != orderId) return false
        val normalizedMethod = newMethod.lowercase().let { if (it == "cash" || it == "card") it else payment.method }
        if (payment.method == normalizedMethod) return true
        paymentDao.updatePayment(payment.copy(method = normalizedMethod))
        val details = "${payment.method} → $normalizedMethod"
        voidLogDao.insert(
            VoidLogEntity(
                type = "payment_method_change",
                orderId = orderId,
                amount = payment.amount,
                sourceTableId = order.tableId,
                sourceTableNumber = order.tableNumber,
                userId = userId,
                userName = userName,
                details = details
            )
        )
        return true
    }

    suspend fun recallOrderToTable(orderId: String, targetTableId: String, userId: String, userName: String): Boolean {
        val order = orderDao.getOrderById(orderId) ?: return false
        if (order.status != "paid") return false
        val targetTable = tableRepository.getTableById(targetTableId) ?: return false
        if (targetTable.status != "free") return false
        orderDao.updateOrderTable(orderId, targetTableId, targetTable.number)
        orderDao.markOrderRecalled(orderId)
        tableRepository.occupyTable(
            tableId = targetTableId,
            orderId = orderId,
            guestCount = 1,
            waiterId = order.waiterId,
            waiterName = order.waiterName
        )
        voidLogDao.insert(
            VoidLogEntity(
                type = "recalled_void",
                orderId = orderId,
                sourceTableId = order.tableId,
                sourceTableNumber = order.tableNumber,
                targetTableId = targetTableId,
                targetTableNumber = targetTable.number,
                amount = order.total,
                userId = userId,
                userName = userName,
                details = "Recall to table: payments reversed, order editable (payment or items)"
            )
        )
        return true
    }
}
