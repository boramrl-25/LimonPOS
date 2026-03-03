package com.limonpos.app.ui.screens.dailysales

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.CategorySaleRow
import com.limonpos.app.data.local.entity.ItemSaleRow
import com.limonpos.app.data.local.entity.VoidLogEntity
import com.limonpos.app.data.repository.DailySalesRepository
import com.limonpos.app.data.repository.RecallPaymentDetail
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import javax.inject.Inject

data class DailySalesState(
    val totalCash: Double = 0.0,
    val totalCard: Double = 0.0,
    val totalVoidAmount: Double = 0.0,
    val voids: List<VoidLogEntity> = emptyList(),
    val totalRefundAmount: Double = 0.0,
    val refunds: List<VoidLogEntity> = emptyList(),
    val recallPaymentDetails: List<RecallPaymentDetail> = emptyList(),
    val categorySales: List<CategorySaleRow> = emptyList(),
    val itemSales: List<ItemSaleRow> = emptyList(),
    val isLoading: Boolean = false
)

@HiltViewModel
class DailySalesViewModel @Inject constructor(
    private val dailySalesRepository: DailySalesRepository
) : ViewModel() {

    private val _state = MutableStateFlow(DailySalesState())
    val state: StateFlow<DailySalesState> = _state.asStateFlow()

    fun loadDailySales() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true)
            val since = dailySalesRepository.getStartOfTodayMillis()
            withContext(Dispatchers.IO) {
                val cash = dailySalesRepository.getDailyCashTotal(since)
                val card = dailySalesRepository.getDailyCardTotal(since)
                val voids = dailySalesRepository.getDailyVoids(since)
                val refunds = dailySalesRepository.getDailyRefunds(since)
                val recallDetails = dailySalesRepository.getRecallPaymentDetails(since)
                val categories = dailySalesRepository.getDailyCategorySales(since)
                val items = dailySalesRepository.getDailyItemSales(since)
                val voidTotal = voids.filter { it.type !in listOf("refund", "refund_full") }.sumOf { it.amount }
                val refundTotal = refunds.sumOf { it.amount }
                val voidsExcludingRefund = voids.filter { it.type !in listOf("refund", "refund_full") }
                _state.value = DailySalesState(
                    totalCash = cash,
                    totalCard = card,
                    totalVoidAmount = voidTotal,
                    voids = voidsExcludingRefund,
                    totalRefundAmount = refundTotal,
                    refunds = refunds,
                    recallPaymentDetails = recallDetails,
                    categorySales = categories,
                    itemSales = items,
                    isLoading = false
                )
            }
        }
    }

    fun refresh() {
        loadDailySales()
    }
}
