package com.limonpos.app.data.remote

import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthTokenProvider @Inject constructor() {
    private val tokenRef = AtomicReference<String?>(null)

    fun getToken(): String? = tokenRef.get()

    fun setToken(token: String?) {
        tokenRef.set(token)
    }
}
