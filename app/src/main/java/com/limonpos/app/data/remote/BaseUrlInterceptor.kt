package com.limonpos.app.data.remote

import com.limonpos.app.data.prefs.ServerPreferences
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Her istekte güncel Server URL kullanılır (Ayarlar'dan değiştirilse bile uygulama yeniden başlamadan geçerli olur).
 */
@Singleton
class BaseUrlInterceptor @Inject constructor(
    private val serverPreferences: ServerPreferences
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val currentBase = runBlocking { serverPreferences.getBaseUrl() }
        val parsed = currentBase.toHttpUrlOrNull() ?: return chain.proceed(request)
        val newUrl = request.url.newBuilder()
            .scheme(parsed.scheme)
            .host(parsed.host)
            .port(parsed.port)
            .build()
        return chain.proceed(request.newBuilder().url(newUrl).build())
    }
}
