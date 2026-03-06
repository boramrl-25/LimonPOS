package com.limonpos.app.data.local.dao

import androidx.room.*
import com.limonpos.app.data.local.entity.OrderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OrderDao {
    @Query("SELECT * FROM orders WHERE id = :id")
    suspend fun getOrderById(id: String): OrderEntity?

    @Query("SELECT * FROM orders WHERE id = :id")
    fun getOrderFlow(id: String): Flow<OrderEntity?>

    @Query("SELECT * FROM orders WHERE tableId = :tableId AND status IN ('open', 'sent') ORDER BY createdAt DESC LIMIT 1")
    suspend fun getActiveOrderByTable(tableId: String): OrderEntity?

    @Query("SELECT * FROM orders WHERE status = 'paid' ORDER BY paidAt DESC LIMIT 100")
    suspend fun getPaidOrders(): List<OrderEntity>

    @Query("SELECT * FROM orders WHERE status = 'paid' AND paidAt >= :since ORDER BY paidAt DESC")
    suspend fun getPaidOrdersSince(since: Long): List<OrderEntity>

    @Query("SELECT * FROM orders WHERE status = 'sent' ORDER BY createdAt ASC")
    fun getOrdersSentToKitchen(): Flow<List<OrderEntity>>

    @Query("SELECT * FROM orders WHERE tableId = :tableId ORDER BY createdAt DESC")
    fun getOrdersByTable(tableId: String): Flow<List<OrderEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrder(order: OrderEntity)

    @Update
    suspend fun updateOrder(order: OrderEntity)

    @Delete
    suspend fun deleteOrder(order: OrderEntity)

    @Query("SELECT * FROM orders WHERE syncStatus = 'PENDING'")
    suspend fun getPendingOrders(): List<OrderEntity>

    @Query("SELECT * FROM orders WHERE status IN ('open', 'sent')")
    suspend fun getOpenAndSentOrders(): List<OrderEntity>

    @Query("UPDATE orders SET tableId = :tableId, tableNumber = :tableNumber, syncStatus = 'PENDING' WHERE id = :orderId")
    suspend fun updateOrderTable(orderId: String, tableId: String, tableNumber: String)

    @Query("UPDATE orders SET waiterId = :waiterId, waiterName = :waiterName, syncStatus = 'PENDING' WHERE id = :orderId")
    suspend fun updateOrderWaiter(orderId: String, waiterId: String, waiterName: String)

    @Query("UPDATE orders SET status = 'paid', paidAt = :paidAt, syncStatus = 'PENDING' WHERE id = :orderId")
    suspend fun markOrderPaid(orderId: String, paidAt: Long)

    /** Recall: reverse payment, order becomes editable (status = sent, paidAt = null). */
    @Query("UPDATE orders SET status = 'sent', paidAt = NULL, syncStatus = 'PENDING' WHERE id = :orderId")
    suspend fun markOrderRecalled(orderId: String)

    @Query("DELETE FROM orders")
    suspend fun deleteAll()
}
