package com.limonpos.app.ui.screens.closedbills

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.ClosedBillAccessRequestEntity
import com.limonpos.app.data.local.entity.OrderEntity
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.local.dao.ClosedBillAccessRequestDao
import com.limonpos.app.data.repository.ApiSyncRepository
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
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class ClosedBillsViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val tableRepository: TableRepository,
    private val authRepository: AuthRepository,
    private val closedBillAccessRequestDao: ClosedBillAccessRequestDao,
    private val apiSyncRepository: ApiSyncRepository
) : ViewModel() {

    private val _paidOrders = MutableStateFlow<List<OrderEntity>>(emptyList())
    val paidOrders: StateFlow<List<OrderEntity>> = _paidOrders.asStateFlow()

    private val _freeTables = MutableStateFlow<List<TableEntity>>(emptyList())
    val freeTables: StateFlow<List<TableEntity>> = _freeTables.asStateFlow()

    private val _selectedOrderWithItems = MutableStateFlow<OrderWithItems?>(null)
    val selectedOrderWithItems: StateFlow<OrderWithItems?> = _selectedOrderWithItems.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _pinError = MutableStateFlow<String?>(null)
    val pinError: StateFlow<String?> = _pinError.asStateFlow()

    /** True if user has closed_bill_access permission (can approve others; uses PIN to enter). */
    private val _hasClosedBillAccess = MutableStateFlow(false)
    val hasClosedBillAccess: StateFlow<Boolean> = _hasClosedBillAccess.asStateFlow()

    /** Access granted: either PIN verified (for approvers) or request was approved. */
    private val _accessGranted = MutableStateFlow(false)
    val accessGranted: StateFlow<Boolean> = _accessGranted.asStateFlow()

    /** Current user's latest closed-bill access request (pending or approved). */
    private val _myAccessRequest = MutableStateFlow<ClosedBillAccessRequestEntity?>(null)
    val myAccessRequest: StateFlow<ClosedBillAccessRequestEntity?> = _myAccessRequest.asStateFlow()

    private val _requestingAccess = MutableStateFlow(false)
    val requestingAccess: StateFlow<Boolean> = _requestingAccess.asStateFlow()

    init {
        viewModelScope.launch {
            _hasClosedBillAccess.value = authRepository.hasClosedBillAccess()
            refreshMyAccessRequest()
        }
    }

    fun refreshMyAccessRequest() {
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            withContext(Dispatchers.IO) {
                apiSyncRepository.syncFromApi()
                val approved = closedBillAccessRequestDao.getLatestApprovedByUser(userId)
                val pending = closedBillAccessRequestDao.getPendingRequests().first()
                    .firstOrNull { it.requestedByUserId == userId }
                _myAccessRequest.value = approved ?: pending
                updateAccessGranted()
            }
        }
    }

    private fun updateAccessGranted() {
        val req = _myAccessRequest.value
        val grantedByApproval = req != null && req.status == "approved" && (
            req.expiresAt == null || System.currentTimeMillis() < req.expiresAt
        )
        _accessGranted.value = grantedByApproval
    }

    fun setAccessGrantedByPin(granted: Boolean) {
        _accessGranted.value = granted
    }

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
        }
    }

    fun dismissBillDialog() {
        _selectedOrderWithItems.value = null
    }

    fun clearMessage() {
        _message.value = null
    }

    fun clearPinError() {
        _pinError.value = null
    }

    /** Request closed bill access (for users without permission). Creates request and pushes to server. */
    fun requestAccess() {
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: "—"
            _requestingAccess.value = true
            withContext(Dispatchers.IO) {
                val entity = ClosedBillAccessRequestEntity(
                    id = "cbar_${UUID.randomUUID().toString().take(8)}",
                    requestedByUserId = userId,
                    requestedByUserName = userName,
                    status = "pending"
                )
                closedBillAccessRequestDao.insert(entity)
                apiSyncRepository.pushClosedBillAccessRequest(entity)
                _myAccessRequest.value = entity
                _requestingAccess.value = false
            }
            _message.value = "Access requested. Wait for approval from manager/supervisor (app or web)."
        }
    }

    /** Verify PIN belongs to a user allowed to work with closed bills (post_void / closed_bill_access). */
    suspend fun verifyClosedBillsPin(pin: String): Boolean {
        return try {
            val result = authRepository.verifyPostVoidPin(pin)
            val ok = result.isSuccess && (result.getOrNull() == true)
            if (!ok) {
                _pinError.value = "Invalid or unauthorized PIN"
            } else {
                _pinError.value = null
            }
            ok
        } catch (e: Exception) {
            _pinError.value = e.message ?: "PIN verification failed"
            false
        }
    }

    /** Refund a single item from closed bill. Call after access granted. */
    fun refundItemFromClosedBill(orderId: String, itemId: String) {
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: "—"
            val ok = withContext(Dispatchers.IO) {
                orderRepository.refundItemFromClosedBill(orderId, itemId, userId, userName)
            }
            if (ok) {
                _message.value = "Item refunded."
                _selectedOrderWithItems.value = null
                loadPaidOrders()
                val ow = orderRepository.getOrderWithItems(orderId).first()
                _selectedOrderWithItems.value = ow
            } else {
                _message.value = "Refund failed."
            }
        }
    }

    /** Full bill refund. Call after access granted. */
    fun refundFullClosedBill(orderId: String) {
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: "—"
            val ok = withContext(Dispatchers.IO) {
                orderRepository.refundFullClosedBill(orderId, userId, userName)
            }
            if (ok) {
                _message.value = "Full bill refunded."
                _selectedOrderWithItems.value = null
                loadPaidOrders()
            } else {
                _message.value = "Refund failed."
            }
        }
    }
}
