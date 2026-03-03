package com.limonpos.app.data.zoho

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class ZohoAuthInterceptor @Inject constructor(
    private val preferences: ZohoBooksPreferences
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { preferences.getAccessToken() }
        val request = if (!token.isNullOrBlank()) {
            chain.request().newBuilder()
                .addHeader("Authorization", "Zoho-oauthtoken $token")
                .build()
        } else {
            chain.request()
        }
        return chain.proceed(request)
    }
}
