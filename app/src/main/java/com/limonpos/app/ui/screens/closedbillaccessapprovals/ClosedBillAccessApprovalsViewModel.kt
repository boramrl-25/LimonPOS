package com.limonpos.app.ui.screens.closedbillaccessapprovals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.dao.ClosedBillAccessRequestDao
import com.limonpos.app.data.local.entity.ClosedBillAccessRequestEntity
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ClosedBillAccessApprovalsViewModel @Inject constructor(
    private val closedBillAccessRequestDao: ClosedBillAccessRequestDao,
    private val apiSyncRepository: ApiSyncRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    val pendingRequests = closedBillAccessRequestDao.getPendingRequests()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        viewModelScope.launch {
            apiSyncRepository.syncFromApi()
        }
    }

    fun approveRequest(request: ClosedBillAccessRequestEntity) {
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: "—"
            val now = System.currentTimeMillis()
            val expiresAt = now + 20 * 60 * 1000L // 20 minutes access window
            val updated = request.copy(
                status = "approved",
                approvedByUserId = userId,
                approvedByUserName = userName,
                approvedAt = now,
                expiresAt = expiresAt
            )
            closedBillAccessRequestDao.update(updated)
            apiSyncRepository.pushClosedBillAccessRequestUpdate(updated)
        }
    }

    fun rejectRequest(request: ClosedBillAccessRequestEntity) {
        viewModelScope.launch {
            val updated = request.copy(status = "rejected")
            closedBillAccessRequestDao.update(updated)
            apiSyncRepository.pushClosedBillAccessRequestUpdate(updated)
        }
    }
}

