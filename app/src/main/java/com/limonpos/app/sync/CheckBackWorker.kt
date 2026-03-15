package com.limonpos.app.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.limonpos.app.data.prefs.ServerPreferences
import com.limonpos.app.data.repository.ApiSyncRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Hibrit mimari Check-Back: Her 15 dk Primary/Secondary (Local) URL'lere ping atar.
 * Biri ulaşılabilirse sync tetikler — Cloud'dayken Local geri geldiğinde hemen veri çekilir.
 */
@HiltWorker
class CheckBackWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val serverPreferences: ServerPreferences,
    private val apiSyncRepository: ApiSyncRepository
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val urls = serverPreferences.getBaseUrlList()
            val localUrls = urls.take(2) // Primary, Secondary (skip Tertiary/Cloud)
            if (localUrls.isEmpty()) return@withContext Result.success()
            val client = OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(5, TimeUnit.SECONDS)
                .build()
            for (baseUrl in localUrls) {
                val healthUrl = baseUrl.trimEnd('/') + "/health"
                try {
                    val req = Request.Builder().url(healthUrl).get().build()
                    val resp = client.newCall(req).execute()
                    if (resp.isSuccessful) {
                        Log.d(TAG, "CheckBack: Local reachable at $baseUrl, triggering sync")
                        apiSyncRepository.syncFromApi()
                        return@withContext Result.success()
                    }
                } catch (_: Exception) { /* try next */ }
            }
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "CheckBack error: ${e.message}")
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "CheckBackWorker"
        private const val WORK_NAME = "check_back_hybrid"

        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<CheckBackWorker>(15, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}
