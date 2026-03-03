package com.limonpos.app.data.local.dao

import androidx.room.*
import com.limonpos.app.data.local.entity.PaymentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PaymentDao {
    @Query("SELECT * FROM payments WHERE orderId = :orderId ORDER BY createdAt")
    fun getPaymentsByOrder(orderId: String): Flow<List<PaymentEntity>>

    @Query("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE orderId = :orderId")
    suspend fun getPaymentsSumByOrder(orderId: String): Double

    @Query("SELECT * FROM payments WHERE id = :id")
    suspend fun getPaymentById(id: String): PaymentEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPayment(payment: PaymentEntity)

    @Query("SELECT * FROM payments WHERE syncStatus = 'PENDING'")
    suspend fun getPendingPayments(): List<PaymentEntity>

    @Query("SELECT * FROM payments ORDER BY createdAt DESC LIMIT 300")
    suspend fun getRecentPayments(): List<PaymentEntity>

    @Update
    suspend fun updatePayment(payment: PaymentEntity)

    @Query("DELETE FROM payments WHERE id = :paymentId")
    suspend fun deletePayment(paymentId: String)

    @Query("DELETE FROM payments WHERE orderId = :orderId")
    suspend fun deletePaymentsByOrder(orderId: String)

    @Query("SELECT * FROM payments WHERE orderId = :orderId ORDER BY createdAt DESC")
    suspend fun getPaymentsByOrderSync(orderId: String): List<PaymentEntity>

    @Query("""
        SELECT COALESCE(SUM(p.amount), 0) FROM payments p
        INNER JOIN orders o ON p.orderId = o.id
        WHERE p.method = 'cash' AND o.status = 'paid' AND o.paidAt >= :since
    """)
    suspend fun getCashTotalSince(since: Long): Double

    @Query("""
        SELECT COALESCE(SUM(p.amount), 0) FROM payments p
        INNER JOIN orders o ON p.orderId = o.id
        WHERE p.method = 'card' AND o.status = 'paid' AND o.paidAt >= :since
    """)
    suspend fun getCardTotalSince(since: Long): Double

    @Query("DELETE FROM payments")
    suspend fun deleteAll()
}
