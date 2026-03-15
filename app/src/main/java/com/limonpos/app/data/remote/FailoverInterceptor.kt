package com.limonpos.app.data.remote

import com.limonpos.app.data.prefs.ServerPreferences
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Hibrit mimari: Primary → Secondary → Tertiary (Cloud) sırayla dener.
 * Bir URL ulaşılamazsa veya 5xx dönerse sıradakine geçer.
 */
@Singleton
class FailoverInterceptor @Inject constructor(
    private val serverPreferences: ServerPreferences
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val urls = runBlocking { serverPreferences.getBaseUrlList() }
        if (urls.isEmpty()) return chain.proceed(chain.request())

        var lastError: IOException? = null
        var lastUnsuccessfulResponse: Response? = null

        for (baseUrl in urls) {
            val parsed = baseUrl.toHttpUrlOrNull() ?: continue
            val request = chain.request()
            val newUrl = request.url.newBuilder()
                .scheme(parsed.scheme)
                .host(parsed.host)
                .port(parsed.port)
                .build()
            val newRequest = request.newBuilder().url(newUrl).build()

            try {
                val response = chain.proceed(newRequest)
                if (response.isSuccessful) return response
                if (shouldFailover(response.code)) {
                    response.close()
                    lastUnsuccessfulResponse = response
                } else {
                    return response
                }
            } catch (e: IOException) {
                lastError = e
            }
        }

        lastUnsuccessfulResponse?.let { return it }
        throw lastError ?: IOException("All API URLs failed")
    }

    private fun shouldFailover(code: Int): Boolean = code in listOf(408, 429, 500, 502, 503, 504)
}
