package com.limonpos.app

import android.app.Application
import android.util.Log
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.limonpos.app.data.local.DatabaseSeeder
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.OverdueWarningHolder
import com.limonpos.app.di.ApplicationScope
import com.limonpos.app.util.NetworkMonitor
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class LimonPOSApp : Application() {

    @Inject lateinit var databaseSeeder: DatabaseSeeder
    @Inject lateinit var apiSyncRepository: ApiSyncRepository
    @Inject lateinit var orderRepository: OrderRepository
    @Inject lateinit var overdueWarningHolder: OverdueWarningHolder
    @Inject lateinit var networkMonitor: NetworkMonitor
    @Inject @ApplicationScope lateinit var applicationScope: CoroutineScope

    private var syncJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        databaseSeeder.seedIfEmpty()
        startCloudSyncWhenOnline()
        startOverdueCheckLoop()
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                applicationScope.launch {
                    try {
                        if (networkMonitor.isOnline.first() && apiSyncRepository.isOnline()) {
                            apiSyncRepository.syncCatalog()
                            Log.d("LimonPOSApp", "App resumed: catalog synced from web")
                        }
                    } catch (e: Exception) {
                        Log.e("LimonPOSApp", "App resume sync failed: ${e.message}")
                    }
                }
            }
        })
    }

    /** Masaya gitmeyen ürün uyarısı: uygulama genelinde her 15 sn kontrol, OverdueWarningHolder güncellenir. */
    private fun startOverdueCheckLoop() {
        applicationScope.launch {
            apiSyncRepository.clearOverdueMinutesCache()
            while (true) {
                try {
                    val minutes = apiSyncRepository.getOverdueUndeliveredMinutes()
                    val list = orderRepository.getOverdueUndelivered(minutes)
                    Log.d("LimonPOSApp", "Overdue check: minutes=$minutes, found=${list.size} items")
                    if (list.isNotEmpty()) {
                        Log.d("LimonPOSApp", "Overdue items: ${list.map { "Table ${it.tableNumber}" }}")
                    }
                    overdueWarningHolder.update(if (list.isNotEmpty()) list else null)
                } catch (e: Exception) {
                    Log.e("LimonPOSApp", "Overdue check error: ${e.message}")
                }
                kotlinx.coroutines.delay(15 * 1000L)
            }
        }
    }

    /** İnternet varken periyodik sync: masalar, siparişler, ürünler web ile senkron kalır. */
    private fun startCloudSyncWhenOnline() {
        applicationScope.launch {
            networkMonitor.isOnline.collect { online ->
                syncJob?.cancel()
                if (online) {
                    syncJob = applicationScope.launch {
                        apiSyncRepository.syncFromApi()
                        while (true) {
                            delay(15 * 1000L) // 15 saniyede bir (web ürün değişiklikleri daha hızlı yansır)
                            if (!networkMonitor.isOnline.first()) break
                            apiSyncRepository.syncFromApi()
                        }
                    }
                }
            }
        }
    }
}
