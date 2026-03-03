package com.limonpos.app.ui.screens.closedbills

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.OrderEntity
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.OrderWithItems
import com.limonpos.app.data.repository.TableRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

@HiltViewModel
class ClosedBillsViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val tableRepository: TableRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _paidOrders = MutableStateFlow<List<OrderEntity>>(emptyList())
    val paidOrders: StateFlow<List<OrderEntity>> = _paidOrders.asStateFlow()

    private val _freeTables = MutableStateFlow<List<TableEntity>>(emptyList())
    val freeTables: StateFlow<List<TableEntity>> = _freeTables.asStateFlow()

    private val _selectedOrderWithItems = MutableStateFlow<OrderWithItems?>(null)
    val selectedOrderWithItems: StateFlow<OrderWithItems?> = _selectedOrderWithItems.asStateFlow()

    private val _showTableSelection = MutableStateFlow(false)
    val showTableSelection: StateFlow<Boolean> = _showTableSelection.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun loadPaidOrders() {
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                _paidOrders.value = orderRepository.getPaidOrders()
            }
        }
    }

    fun loadFreeTables() {
        viewModelScope.launch {
            _freeTables.value = tableRepository.getAllTables().first().filter { it.status == "free" }
        }
    }

    fun selectOrderForRecall(order: OrderEntity) {
        viewModelScope.launch {
            val ow = withContext(Dispatchers.IO) {
                orderRepository.getOrderWithItems(order.id).first()
            }
            _selectedOrderWithItems.value = ow
            _showTableSelection.value = false
            loadFreeTables()
        }
    }

    fun onRecallToTableClicked() {
        _showTableSelection.value = true
        loadFreeTables()
    }

    fun dismissBillDialog() {
        _selectedOrderWithItems.value = null
        _showTableSelection.value = false
    }

    fun recallToTable(orderId: String, targetTableId: String, onSuccess: (String) -> Unit) {
        viewModelScope.launch {
            val uid = authRepository.getCurrentUserIdSync() ?: return@launch
            val uname = authRepository.getCurrentUserNameSync() ?: "Staff"
            val ok = withContext(Dispatchers.IO) {
                orderRepository.recallOrderToTable(orderId, targetTableId, uid, uname)
            }
            if (ok) {
                _message.value = "Bill recalled to table"
                _selectedOrderWithItems.value = null
                _showTableSelection.value = false
                loadPaidOrders()
                onSuccess(targetTableId)
            } else {
                _message.value = "Recall failed"
            }
        }
    }

    fun clearMessage() {
        _message.value = null
    }
}
