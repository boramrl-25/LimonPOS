package com.limonpos.app.util

import com.google.gson.Gson
import com.limonpos.app.data.local.entity.UserEntity

/**
 * App + Web permission keys (assign in Web Settings → Users).
 * App: view_all_orders, pre_void, post_void, table_transfer_void, closed_bill_access, kds_mode; cash_drawer = separate field.
 * Web: web_dashboard, web_reports, web_settings, web_users, web_clear_test_data, web_void_approvals, web_closed_bill_approvals.
 */
data class UserPermissions(
    val viewAllOrders: Boolean = false,
    val cashDrawer: Boolean = false,
    val kdsModeAccess: Boolean = false,  // Can access Kitchen Display (KDS) screen
    val preVoid: Boolean = false,   // Remove item before send to kitchen
    val postVoid: Boolean = false,  // Remove item after send to kitchen
    val tableTransferVoid: Boolean = false,  // Table transfer creates void
    val closedBillAccess: Boolean = false   // Can access closed bills (view/refund) without approval; can approve others' requests
)

fun UserEntity.permissionsSet(): Set<String> {
    return runCatching {
        Gson().fromJson(this.permissions, Array<String>::class.java)?.toSet() ?: emptySet()
    }.getOrDefault(emptySet())
}

fun UserEntity.toUserPermissions(): UserPermissions {
    val perms = permissionsSet()
    val isManagerOrAdmin = role in listOf("admin", "manager", "supervisor")
    return UserPermissions(
        viewAllOrders = perms.contains("view_all_orders"),
        cashDrawer = this.cashDrawerPermission,
        kdsModeAccess = perms.contains("kds_mode") || isManagerOrAdmin,
        preVoid = perms.contains("pre_void") || isManagerOrAdmin,
        postVoid = perms.contains("post_void") || isManagerOrAdmin,
        tableTransferVoid = perms.contains("table_transfer_void") || isManagerOrAdmin,
        closedBillAccess = perms.contains("closed_bill_access") || isManagerOrAdmin
    )
}

