package com.limonpos.app.data.remote

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RetryInterceptor @Inject constructor() : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var lastException: IOException? = null

        repeat(MAX_RETRIES) { attempt ->
            try {
                val response = chain.proceed(request)
                if (response.isSuccessful) return response
                if (!shouldRetryCode(response.code) || attempt == MAX_RETRIES - 1) return response
                response.close()
            } catch (e: IOException) {
                lastException = e
                if (!shouldRetryException(e)) throw e
                if (attempt == MAX_RETRIES - 1) throw e
            }
        }

        throw lastException ?: IOException("Connection failed after $MAX_RETRIES attempts")
    }

    private fun shouldRetryException(e: IOException): Boolean = when (e) {
        is SocketTimeoutException -> true
        is ConnectException -> true
        is UnknownHostException -> true
        is SSLException -> true
        else -> e.message?.contains("timeout", ignoreCase = true) == true
    }

    private fun shouldRetryCode(code: Int): Boolean = code in listOf(408, 429, 500, 502, 503, 504)

    companion object {
        private const val MAX_RETRIES = 3
    }
}
