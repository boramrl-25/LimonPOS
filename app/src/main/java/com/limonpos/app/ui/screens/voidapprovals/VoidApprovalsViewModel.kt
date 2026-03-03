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
import com.limonpos.app.util.toUserPermissions
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
        val isSupervisor: Boolean,
        val hasKds: Boolean
    )

    val approvalCapability = flow {
        try {
            val user = authRepository.getCurrentUser()
            if (user != null) {
                val perms = user.toUserPermissions()
                emit(ApprovalCapability(
                    userId = user.id,
                    isSupervisor = user.role in listOf("admin", "manager", "supervisor"),
                    hasKds = perms.kdsModeAccess
                ))
            } else {
                emit(null)
            }
        } catch (_: Exception) {
            emit(null)
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun canCurrentUserApprove(request: VoidRequestEntity, cap: ApprovalCapability?): Boolean {
        if (cap == null) return true
        if (request.approvedBySupervisorUserId == cap.userId || request.approvedByKdsUserId == cap.userId) return false
        val canBoth = cap.isSupervisor && cap.hasKds && request.approvedBySupervisorUserId == null && request.approvedByKdsUserId == null
        val canSupervisor = cap.isSupervisor && request.approvedBySupervisorUserId == null && cap.userId != request.approvedByKdsUserId
        val canKds = cap.hasKds && request.approvedByKdsUserId == null && cap.userId != request.approvedBySupervisorUserId
        return canBoth || canSupervisor || canKds
    }

    fun approveRequest(request: VoidRequestEntity) {
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: ""
            val isSupervisor = authRepository.isSupervisorRole()
            val hasKds = authRepository.hasKdsAccess()

            if (request.approvedBySupervisorUserId == userId || request.approvedByKdsUserId == userId) return@launch

            val now = System.currentTimeMillis()
            val updated = when {
                isSupervisor && hasKds && request.approvedBySupervisorUserId == null && request.approvedByKdsUserId == null -> {
                    request.copy(
                        approvedBySupervisorUserId = userId,
                        approvedBySupervisorUserName = userName,
                        approvedBySupervisorAt = now,
                        approvedByKdsUserId = userId,
                        approvedByKdsUserName = userName,
                        approvedByKdsAt = now
                    )
                }
                isSupervisor && request.approvedBySupervisorUserId == null && userId != request.approvedByKdsUserId -> {
                    request.copy(
                        approvedBySupervisorUserId = userId,
                        approvedBySupervisorUserName = userName,
                        approvedBySupervisorAt = now
                    )
                }
                hasKds && request.approvedByKdsUserId == null && userId != request.approvedBySupervisorUserId -> {
                    request.copy(
                        approvedByKdsUserId = userId,
                        approvedByKdsUserName = userName,
                        approvedByKdsAt = now
                    )
                }
                else -> return@launch
            }

            val bothApproved = updated.approvedBySupervisorUserId != null && updated.approvedByKdsUserId != null
            val finalRequest = if (bothApproved) updated.copy(status = "approved") else updated
            voidRequestRepository.updateRequest(finalRequest)
            apiSyncRepository.pushVoidRequestUpdate(finalRequest)

            if (bothApproved) {
                val ow = orderRepository.getOrderWithItems(request.orderId).first() ?: return@launch
                val order = ow.order
                if (!orderRepository.voidItem(request.orderItemId, userId, userName)) return@launch
                val voidSlip = printerService.buildVoidSlip(
                    order = order,
                    productName = request.productName,
                    quantity = request.quantity,
                    price = request.price,
                    userName = userName
                )
                val kitchenPrinters = printerRepository.getAllPrinters().first()
                    .filter { it.printerType == "kitchen" && it.ipAddress.isNotBlank() }
                for (printer in kitchenPrinters) {
                    printerService.sendToPrinter(printer.ipAddress, printer.port, voidSlip)
                }
            }
        }
    }

    fun rejectRequest(request: VoidRequestEntity) {
        viewModelScope.launch {
            val rejected = request.copy(status = "rejected")
            voidRequestRepository.updateRequest(rejected)
            apiSyncRepository.pushVoidRequestUpdate(rejected)
        }
    }
}
