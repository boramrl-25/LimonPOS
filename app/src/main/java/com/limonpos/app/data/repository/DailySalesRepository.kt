package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.OrderItemDao
import com.limonpos.app.data.local.dao.PaymentDao
import com.limonpos.app.data.local.dao.VoidLogDao
import com.limonpos.app.data.local.entity.CategorySaleRow
import com.limonpos.app.data.local.entity.ItemSaleRow
import com.limonpos.app.data.local.entity.VoidLogEntity
import java.util.Calendar
import javax.inject.Inject

class DailySalesRepository @Inject constructor(
    private val paymentDao: PaymentDao,
    private val orderItemDao: OrderItemDao,
    private val voidLogDao: VoidLogDao
) {

    /** Start of today in local timezone (00:00:00.000). */
    fun getStartOfTodayMillis(): Long {
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    suspend fun getDailyCashTotal(since: Long): Double = paymentDao.getCashTotalSince(since)
    suspend fun getDailyCardTotal(since: Long): Double = paymentDao.getCardTotalSince(since)
    suspend fun getDailyVoids(since: Long): List<VoidLogEntity> = voidLogDao.getVoidsSince(since)
    suspend fun getDailyRefunds(since: Long): List<VoidLogEntity> = voidLogDao.getRefundsSince(since)
    suspend fun getRecallPaymentDetails(since: Long): List<RecallPaymentDetail> {
        val recalls = voidLogDao.getVoidsSince(since).filter { it.type == "recalled_void" }
        return recalls.map { log ->
            val orderId = log.orderId ?: ""
            val payments = paymentDao.getPaymentsByOrderSync(orderId)
            val cashReversed = payments.filter { it.method == "cash" }.sumOf { it.amount }
            val cardReversed = payments.filter { it.method == "card" }.sumOf { it.amount }
            RecallPaymentDetail(
                orderId = orderId,
                sourceTableNumber = log.sourceTableNumber ?: "",
                targetTableNumber = log.targetTableNumber ?: "",
                totalReversed = log.amount,
                cashReversed = cashReversed,
                cardReversed = cardReversed,
                userId = log.userId,
                userName = log.userName,
                createdAt = log.createdAt
            )
        }
    }
    suspend fun getDailyCategorySales(since: Long): List<CategorySaleRow> = orderItemDao.getCategorySalesSince(since)
    suspend fun getDailyItemSales(since: Long): List<ItemSaleRow> = orderItemDao.getItemSalesSince(since)
}

data class RecallPaymentDetail(
    val orderId: String,
    val sourceTableNumber: String,
    val targetTableNumber: String,
    val totalReversed: Double,
    val cashReversed: Double,
    val cardReversed: Double,
    val userId: String,
    val userName: String,
    val createdAt: Long
)
