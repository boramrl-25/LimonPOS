package com.limonpos.app.util

/**
 * FCM token cache. LimonFcmService (onNewToken) ve LimonPOSApp (ilk getToken) günceller.
 * Heartbeat ile backend'e gönderilir.
 */
object FcmTokenHolder {
    @Volatile
    var token: String? = null
        private set

    fun setToken(value: String?) {
        token = value
    }
}
