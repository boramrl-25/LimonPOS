package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.PaymentDao
import com.limonpos.app.data.local.entity.PaymentEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject

class PaymentRepository @Inject constructor(
    private val paymentDao: PaymentDao,
    private val apiSyncRepository: ApiSyncRepository
) {
    fun getPaymentsByOrder(orderId: String): Flow<List<PaymentEntity>> = paymentDao.getPaymentsByOrder(orderId)

    suspend fun getPaymentsSumByOrder(orderId: String): Double = paymentDao.getPaymentsSumByOrder(orderId)

    suspend fun deletePayment(paymentId: String) {
        paymentDao.deletePayment(paymentId)
    }

    suspend fun deleteAllPaymentsForOrder(orderId: String) {
        paymentDao.deletePaymentsByOrder(orderId)
    }

    suspend fun getPaymentsByOrderSync(orderId: String): List<PaymentEntity> =
        paymentDao.getPaymentsByOrderSync(orderId)

    suspend fun fixOverpayment(orderId: String, orderTotal: Double) {
        val payments = paymentDao.getPaymentsByOrderSync(orderId)
        var total = payments.sumOf { it.amount }
        for (p in payments) {
            if (total <= orderTotal) break
            paymentDao.deletePayment(p.id)
            total -= p.amount
        }
    }

    suspend fun createPayment(orderId: String, amount: Double, method: String, receivedAmount: Double, changeAmount: Double, userId: String) {
        withContext(Dispatchers.IO) {
            val payment = PaymentEntity(
                id = UUID.randomUUID().toString(),
                orderId = orderId,
                amount = amount,
                method = method,
                receivedAmount = receivedAmount,
                changeAmount = changeAmount,
                userId = userId,
                createdAt = System.currentTimeMillis(),
                syncStatus = "PENDING"
            )
            paymentDao.insertPayment(payment)
            // Her ödeme alındığında, bağlantı durumundan bağımsız olarak backend'e push etmeyi dene.
            // ApiSyncRepository.pushPayment zaten kendi içinde isOnline + retry mantığını yönetiyor.
            val pushed = apiSyncRepository.pushPayment(orderId, amount, method, receivedAmount, changeAmount, userId)
            if (pushed) paymentDao.updatePayment(payment.copy(syncStatus = "SYNCED"))
        }
    }
}
