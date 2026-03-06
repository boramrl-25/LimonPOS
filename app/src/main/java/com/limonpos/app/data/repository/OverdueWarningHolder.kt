package com.limonpos.app.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Global holder for overdue undelivered items. Updated by app-wide check; observed by Order/FloorPlan UI. */
@Singleton
class OverdueWarningHolder @Inject constructor() {
    private val _overdue = MutableStateFlow<List<OverdueUndelivered>?>(null)
    val overdue: StateFlow<List<OverdueUndelivered>?> = _overdue.asStateFlow()

    fun update(list: List<OverdueUndelivered>?) {
        _overdue.value = list
    }
}
