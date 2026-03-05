package com.limonpos.app.data.local.dao

import androidx.room.*
import com.limonpos.app.data.local.entity.CategorySaleRow
import com.limonpos.app.data.local.entity.ItemSaleRow
import com.limonpos.app.data.local.entity.OrderItemEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OrderItemDao {
    @Query("SELECT * FROM order_items WHERE orderId = :orderId ORDER BY id")
    fun getOrderItems(orderId: String): Flow<List<OrderItemEntity>>

    @Query("SELECT * FROM order_items WHERE id = :id")
    suspend fun getOrderItemById(id: String): OrderItemEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrderItem(item: OrderItemEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrderItems(items: List<OrderItemEntity>)

    @Update
    suspend fun updateOrderItem(item: OrderItemEntity)

    @Query("UPDATE order_items SET deliveredAt = :deliveredAt WHERE id = :itemId")
    suspend fun markDelivered(itemId: String, deliveredAt: Long)

    @Query("UPDATE order_items SET deliveredAt = :deliveredAt WHERE orderId = :orderId AND sentAt IS NOT NULL AND deliveredAt IS NULL")
    suspend fun markAllDeliveredForOrder(orderId: String, deliveredAt: Long)

    @Delete
    suspend fun deleteOrderItem(item: OrderItemEntity)

    @Query("DELETE FROM order_items WHERE orderId = :orderId")
    suspend fun deleteOrderItems(orderId: String)

    @Query("SELECT * FROM order_items WHERE syncStatus = 'PENDING'")
    suspend fun getPendingOrderItems(): List<OrderItemEntity>

    @Query("""
        SELECT p.categoryId, c.name AS categoryName,
               SUM(oi.quantity * oi.price) AS totalAmount, SUM(oi.quantity) AS totalQuantity
        FROM order_items oi
        INNER JOIN orders o ON oi.orderId = o.id
        INNER JOIN products p ON oi.productId = p.id
        LEFT JOIN categories c ON p.categoryId = c.id
        WHERE o.status = 'paid' AND o.paidAt >= :since
        GROUP BY p.categoryId
        ORDER BY totalAmount DESC
    """)
    suspend fun getCategorySalesSince(since: Long): List<CategorySaleRow>

    @Query("""
        SELECT oi.productId, oi.productName, p.categoryId,
               SUM(oi.quantity) AS totalQuantity, SUM(oi.quantity * oi.price) AS totalAmount
        FROM order_items oi
        INNER JOIN orders o ON oi.orderId = o.id
        INNER JOIN products p ON oi.productId = p.id
        WHERE o.status = 'paid' AND o.paidAt >= :since
        GROUP BY oi.productId
        ORDER BY totalAmount DESC
    """)
    suspend fun getItemSalesSince(since: Long): List<ItemSaleRow>

    @Query("DELETE FROM order_items")
    suspend fun deleteAll()
}
