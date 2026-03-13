package com.limonpos.app.ui.screens.voidapprovals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.VoidRequestEntity
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.VoidRequestRepository
import com.limonpos.app.service.PrinterService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class VoidApprovalsViewModel @Inject constructor(
    private val voidRequestRepository: VoidRequestRepository,
    private val apiSyncRepository: ApiSyncRepository,
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository,
    private val printerRepository: PrinterRepository,
    private val printerService: PrinterService
) : ViewModel() {

    val pendingRequests = voidRequestRepository.getPendingRequests()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        viewModelScope.launch {
            apiSyncRepository.syncFromApi()
        }
    }

    data class ApprovalCapability(
        val userId: String,
        val isSupervisor: Boolean
    )

    val approvalCapability = flow {
        try {
            val user = authRepository.getCurrentUser()
            if (user != null) {
                emit(ApprovalCapability(
                    userId = user.id,
                    isSupervisor = user.role in listOf("admin", "manager", "supervisor")
                ))
            } else {
                emit(null)
            }
        } catch (_: Exception) {
            emit(null)
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** Only supervisor can approve. KDS removed — single approval. */
    fun canCurrentUserApprove(request: VoidRequestEntity, cap: ApprovalCapability?): Boolean {
        if (cap == null) return false
        if (request.approvedBySupervisorUserId != null) return false
        return cap.isSupervisor
    }

    fun approveRequest(request: VoidRequestEntity) {
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: ""
            if (!authRepository.isSupervisorRole()) return@launch
            if (request.approvedBySupervisorUserId != null) return@launch

            val now = System.currentTimeMillis()
            val updated = request.copy(
                approvedBySupervisorUserId = userId,
                approvedBySupervisorUserName = userName,
                approvedBySupervisorAt = now,
                status = "approved"
            )
            val finalRequest = updated
            voidRequestRepository.updateRequest(finalRequest)
            apiSyncRepository.pushVoidRequestUpdate(finalRequest)
            voidRequestRepository.deleteRequest(request.id)

            val ow = orderRepository.getOrderWithItems(request.orderId).first() ?: return@launch
            val order = ow.order
            val itemToVoid = ow.items.find { it.id == request.orderItemId }
            if (!orderRepository.voidItem(request.orderItemId, userId, userName)) return@launch
            itemToVoid?.let { apiSyncRepository.pushDeleteOrderItem(request.orderId, it) }
            apiSyncRepository.pushPendingVoidsNow()
            val voidSlip = printerService.buildVoidSlip(
                order = order,
                productName = request.productName,
                quantity = request.quantity,
                price = request.price,
                userName = userName
            )
            val kitchenPrinters = printerRepository.getAllPrinters().first()
                .filter { it.printerType == "kitchen" && it.ipAddress.isNotBlank() && it.enabled }
            for (printer in kitchenPrinters) {
                printerService.sendToPrinter(printer.ipAddress, printer.port, voidSlip)
            }
        }
    }

    fun rejectRequest(request: VoidRequestEntity) {
        viewModelScope.launch {
            val rejected = request.copy(status = "rejected")
            voidRequestRepository.updateRequest(rejected)
            apiSyncRepository.pushVoidRequestUpdate(rejected)
            voidRequestRepository.deleteRequest(request.id)
        }
    }
}
