package com.limonpos.app.service

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.util.FcmTokenHolder
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Hibrit mimari Force Update: catalog_updated alınca hemen sync tetiklenir.
 * Backoffice "Zorunlu Güncelle" → Cloud FCM → bu service → syncFromApi()
 */
@AndroidEntryPoint
class LimonFcmService : FirebaseMessagingService() {

    @Inject lateinit var apiSyncRepository: ApiSyncRepository

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(message: RemoteMessage) {
        val type = message.data["type"] ?: message.data["Type"]
        if (type == "catalog_updated") {
            Log.d(TAG, "Force Update: catalog_updated received, triggering sync")
            scope.launch {
                try {
                    apiSyncRepository.syncFromApi()
                    Log.d(TAG, "Force Update: sync completed")
                } catch (e: Exception) {
                    Log.e(TAG, "Force Update sync failed: ${e.message}")
                }
            }
        }
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "FCM new token: ${token.take(20)}...")
        FcmTokenHolder.setToken(token)
    }

    companion object {
        private const val TAG = "LimonFcmService"
    }
}
