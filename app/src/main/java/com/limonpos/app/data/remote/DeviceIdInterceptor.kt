package com.limonpos.app.data.remote

import com.limonpos.app.data.prefs.ServerPreferences
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/** Hibrit mimari audit: Her isteğe X-Device-Id header ekler. */
@Singleton
class DeviceIdInterceptor @Inject constructor(
    private val serverPreferences: ServerPreferences
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val deviceId = runBlocking { serverPreferences.getDeviceId() }
        val request = chain.request().newBuilder()
            .addHeader("X-Device-Id", deviceId)
            .build()
        return chain.proceed(request)
    }
}
