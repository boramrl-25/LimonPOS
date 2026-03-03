package com.limonpos.app.util

import com.google.gson.Gson
import com.limonpos.app.data.local.entity.UserEntity

data class UserPermissions(
    val viewAllOrders: Boolean = false,
    val cashDrawer: Boolean = false,
    val kdsModeAccess: Boolean = false,  // Can access Kitchen Display (KDS) screen
    val preVoid: Boolean = false,   // Remove item before send to kitchen
    val postVoid: Boolean = false,  // Remove item after send to kitchen
    val tableTransferVoid: Boolean = false  // Table transfer creates void
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
        tableTransferVoid = perms.contains("table_transfer_void") || isManagerOrAdmin
    )
}

