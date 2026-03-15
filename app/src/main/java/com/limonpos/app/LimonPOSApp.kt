package com.limonpos.app

import android.app.Application
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.limonpos.app.data.local.DatabaseSeeder
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.OverdueWarningHolder
import com.limonpos.app.data.repository.ReservationReminderHolder
import com.limonpos.app.data.repository.ReservationStatusHelper
import com.limonpos.app.data.repository.TableRepository
import com.limonpos.app.data.repository.UpcomingReservationAlert
import com.limonpos.app.sync.CheckBackWorker
import com.limonpos.app.util.FcmTokenHolder
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
    @Inject lateinit var reservationReminderHolder: ReservationReminderHolder
    @Inject lateinit var tableRepository: TableRepository
    @Inject lateinit var networkMonitor: NetworkMonitor
    @Inject @ApplicationScope lateinit var applicationScope: CoroutineScope

    private var syncJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        databaseSeeder.seedIfEmpty()
        CheckBackWorker.enqueue(this)
        startCloudSyncWhenOnline()
        fetchFcmToken()
        startOverdueCheckLoop()
        startReservationReminderLoop()
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

    /** Masaya gitmeyen ürün uyarısı: her 15 sn; sadece product.overdueUndeliveredMinutes, null ise disabled. */
    private fun startOverdueCheckLoop() {
        applicationScope.launch {
            while (true) {
                try {
                    val list = orderRepository.getOverdueUndelivered()
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

    /** Rezervasyon 30 dk kala uyarı: her 45 sn; aynı rezervasyon için tekrar bildirim yok. */
    private fun startReservationReminderLoop() {
        applicationScope.launch {
            while (true) {
                try {
                    val tables = tableRepository.getAllTables().first()
                    val now = System.currentTimeMillis()
                    val list = tables
                        .filter { ReservationStatusHelper.isReservationUpcoming(it, now, 30) }
                        .map { t ->
                            UpcomingReservationAlert(
                                tableId = t.id,
                                tableNumber = t.number,
                                reservationFrom = t.reservationFrom!!,
                                reservationTo = t.reservationTo!!,
                                guestName = t.reservationGuestName,
                                guestPhone = t.reservationGuestPhone
                            )
                        }
                    reservationReminderHolder.update(list)
                } catch (e: Exception) {
                    Log.e("LimonPOSApp", "Reservation reminder check error: ${e.message}")
                }
                kotlinx.coroutines.delay(45 * 1000L)
            }
        }
    }

    /** FCM token al; heartbeat ile backend'e gönderilecek (Force Update push için). */
    private fun fetchFcmToken() {
        Handler(Looper.getMainLooper()).post {
            try {
                FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                    if (!token.isNullOrBlank()) FcmTokenHolder.setToken(token)
                }.addOnFailureListener { e -> Log.e("LimonPOSApp", "FCM token failed: ${e.message}") }
            } catch (e: Exception) {
                Log.e("LimonPOSApp", "FCM token error: ${e.message}")
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
