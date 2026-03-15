package com.limonpos.app.service

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Triggers instant KDS WebView refresh when orders are sent to kitchen.
 * OrderViewModel calls requestRefresh() after markItemsAsSent; KdsScreen
 * collects and calls loadKitchen() without waiting for the 2s poll.
 */
@Singleton
class KdsRefreshHolder @Inject constructor() {
    private val _refreshRequests = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 1)
    val refreshRequests: SharedFlow<Unit> = _refreshRequests.asSharedFlow()

    fun requestRefresh() {
        _refreshRequests.tryEmit(Unit)
    }
}
