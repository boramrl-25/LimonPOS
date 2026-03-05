package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.OrderDao
import com.limonpos.app.data.local.dao.OrderItemDao
import com.limonpos.app.data.local.dao.PaymentDao
import com.limonpos.app.data.local.dao.VoidLogDao
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
    val orderId: String,
    val items: List<OrderItemEntity>
)

class OrderRepository @Inject constructor(
    private val orderDao: OrderDao,
    private val orderItemDao: OrderItemDao,
    private val paymentDao: PaymentDao,
    private val tableRepository: TableRepository,
    private val voidLogDao: VoidLogDao
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

    suspend fun addItem(
        orderId: String,
        productId: String,
        productName: String,
        price: Double,
        quantity: Int,
        notes: String = ""
    ): OrderItemEntity {
        val order = orderDao.getOrderById(orderId) ?: throw Exception("Order not found")
        val itemId = UUID.randomUUID().toString()
        val item = OrderItemEntity(
            id = itemId,
            orderId = orderId,
            productId = productId,
            productName = productName,
            quantity = quantity,
            price = price,
            notes = notes,
            status = "pending",
            sentAt = null,
            apiId = null,
            syncStatus = "PENDING"
        )
        orderItemDao.insertOrderItem(item)
        updateOrderTotals(orderId)
        return item
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
    }

    suspend fun markItemsAsSent(orderId: String, itemIds: List<String>) {
        if (itemIds.isEmpty()) return
        val order = orderDao.getOrderById(orderId) ?: return
        val now = System.currentTimeMillis()
        for (item in orderItemDao.getOrderItems(orderId).first()) {
            if (item.id in itemIds) {
                orderItemDao.updateOrderItem(item.copy(status = "sent", sentAt = now, syncStatus = "PENDING"))
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

    suspend fun markAllItemsDeliveredForOrder(orderId: String) {
        val now = System.currentTimeMillis()
        orderItemDao.markAllDeliveredForOrder(orderId, now)
    }

    suspend fun getOverdueUndelivered(olderThanMs: Long): List<OverdueUndelivered> {
        val orders = orderDao.getOpenAndSentOrders()
        val result = mutableListOf<OverdueUndelivered>()
        val now = System.currentTimeMillis()
        val cutoff = now - olderThanMs
        for (order in orders) {
            val items = orderItemDao.getOrderItems(order.id).first()
            val overdue = items.filter { it.sentAt != null && it.deliveredAt == null && it.sentAt < cutoff }
            if (overdue.isNotEmpty()) {
                result.add(OverdueUndelivered(tableNumber = order.tableNumber, orderId = order.id, items = overdue))
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
