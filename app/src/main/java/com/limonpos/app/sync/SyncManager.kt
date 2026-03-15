package com.limonpos.app.sync

import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.util.NetworkMonitor
import kotlinx.coroutines.flow.first
import javax.inject.Inject

class SyncManager @Inject constructor(
    private val apiService: ApiService,
    private val networkMonitor: NetworkMonitor,
    private val authRepository: AuthRepository,
    private val apiSyncRepository: ApiSyncRepository
) {
    suspend fun syncIfOnline() {
        if (!networkMonitor.isOnline.first()) return
        apiSyncRepository.syncFromApi()
    }
}
