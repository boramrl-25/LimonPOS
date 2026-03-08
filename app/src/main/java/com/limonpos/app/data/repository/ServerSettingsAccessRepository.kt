package com.limonpos.app.data.repository

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Maintenance PIN for Server URL screen only.
 * Does NOT create session, does NOT use users table, does NOT grant app access.
 * 1234 and 2222 open only the Server Settings screen (API URL config).
 */
@Singleton
class ServerSettingsAccessRepository @Inject constructor() {

    private val validPins = setOf("1234", "2222")

    fun isValidMaintenancePin(pin: String): Boolean =
        pin in validPins
}
