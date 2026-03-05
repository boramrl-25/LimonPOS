package com.limonpos.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.limonpos.app.ui.theme.LimonPrimary
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.ui.screens.closedbills.ClosedBillsScreen
import com.limonpos.app.ui.screens.floorplan.FloorPlanScreen
import com.limonpos.app.ui.screens.home.HomeScreen
import com.limonpos.app.ui.screens.login.LoginScreen
import com.limonpos.app.ui.screens.order.OrderScreen
import com.limonpos.app.ui.screens.payment.PaymentScreen
import com.limonpos.app.ui.screens.settings.SettingsScreen
import com.limonpos.app.ui.screens.users.UsersScreen
import com.limonpos.app.ui.screens.kds.KdsScreen
import com.limonpos.app.ui.screens.dailysales.DailySalesScreen
import com.limonpos.app.ui.screens.voidreport.VoidReportScreen
import com.limonpos.app.ui.screens.voidapprovals.VoidApprovalsScreen
import com.limonpos.app.ui.screens.printers.PrintersScreen
import com.limonpos.app.ui.screens.products.ProductsScreen
import com.limonpos.app.ui.screens.categories.CategoriesScreen
import com.limonpos.app.ui.screens.modifiers.ModifiersScreen
import com.limonpos.app.ui.screens.serversettings.ServerSettingsScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

object Routes {
    const val GATE = "gate"
    const val FLOOR_PLAN = "floor_plan"
    const val ORDER = "order/{tableId}"
    const val PAYMENT = "order/{tableId}/payment"
    const val HOME = "home"
    const val KDS = "kds"
    const val CLOSED_BILLS = "closed_bills"
    const val USERS = "users"
    const val VOID_REPORT = "void_report"
    const val VOID_APPROVALS = "void_approvals"
    const val CLOSED_BILL_ACCESS_APPROVALS = "closed_bill_access_approvals"
    const val SETTINGS = "settings"
    const val BACK_OFFICE_SETTINGS = "back_office_settings"
    const val PRINTERS = "printers"
    const val PRODUCTS = "products"
    const val CATEGORIES = "categories"
    const val MODIFIERS = "modifiers"
    const val SERVER_SETTINGS = "server_settings"

    fun order(tableId: String) = "order/$tableId"
    fun payment(tableId: String) = "order/$tableId/payment"
}

/** Next scheduled sync delay in ms: runs at 01:00 and 07:00 local time (twice per day). */
private fun computeNextSyncDelayMillis(): Long {
    val now = LocalDateTime.now()
    val schedule = listOf(
        LocalTime.of(1, 0),
        LocalTime.of(7, 0)
    )
    val today = now.toLocalDate()
    val nextDateTime = schedule
        .map { time ->
            var dt = today.atTime(time)
            if (!dt.isAfter(now)) {
                dt = dt.plusDays(1)
            }
            dt
        }
        .minByOrNull { it }
    val target = nextDateTime ?: now.plusHours(1)
    return Duration.between(now, target).toMillis().coerceAtLeast(1_000L)
}

@Composable
fun NavGraph(
    authRepository: AuthRepository,
    apiSyncRepository: ApiSyncRepository,
    navController: NavHostController = rememberNavController()
) {
    val scope = rememberCoroutineScope()
    val onSync: () -> Unit = { scope.launch { if (apiSyncRepository.isOnline()) apiSyncRepository.syncFromApi() } }
    val isLoggedIn by authRepository.isLoggedIn().collectAsState(initial = false)
    val loginScreenKey by authRepository.loginScreenKey.collectAsState(initial = 0)

    if (!isLoggedIn) {
        key(loginScreenKey) {
            LoginScreen(
                onLoginSuccess = { /* isLoggedIn flow will trigger recomposition */ },
                loginScreenKey = loginScreenKey
            )
        }
    } else {
        // Scheduled sync: only at fixed times when online (no continuous background polling)
        LaunchedEffect(Unit) {
            while (true) {
                val delayMillis = computeNextSyncDelayMillis()
                delay(delayMillis)
                if (apiSyncRepository.isOnline()) {
                    apiSyncRepository.syncFromApi()
                }
            }
        }
        NavHost(
            navController = navController,
            startDestination = Routes.GATE
        ) {
            composable(Routes.GATE) {
                LaunchedEffect(Unit) {
                    val user = authRepository.getCurrentUser()
                    val dest = if (user?.role == "kds") Routes.SETTINGS else Routes.FLOOR_PLAN
                    navController.navigate(dest) {
                        popUpTo(Routes.GATE) { inclusive = true }
                        launchSingleTop = true
                    }
                }
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = LimonPrimary)
                }
            }
            composable(Routes.FLOOR_PLAN) {
                val scope = rememberCoroutineScope()
                val canAccessKds by authRepository.canAccessKds().collectAsState(initial = false)
                var canAccessClosedBillApprovals by remember { mutableStateOf(false) }
                LaunchedEffect(Unit) {
                    canAccessClosedBillApprovals = authRepository.hasClosedBillAccess()
                }
                FloorPlanScreen(
                    onNavigateToOrder = { tableId -> navController.navigate(Routes.order(tableId)) },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onNavigateToClosedBills = { navController.navigate(Routes.CLOSED_BILLS) },
                    onNavigateToVoidApprovals = { navController.navigate(Routes.VOID_APPROVALS) },
                    canAccessVoidApprovals = canAccessKds,
                    onNavigateToClosedBillAccessApprovals = { navController.navigate(Routes.CLOSED_BILL_ACCESS_APPROVALS) },
                    canAccessClosedBillAccessApprovals = canAccessClosedBillApprovals,
                    onSync = onSync,
                    onLogout = { scope.launch { authRepository.logout() } }
                )
            }
            composable(
                route = Routes.ORDER,
                arguments = listOf(navArgument("tableId") { type = NavType.StringType })
            ) { backStackEntry ->
                val tableId = backStackEntry.arguments?.getString("tableId") ?: ""
                if (tableId.isNotEmpty()) {
                    OrderScreen(
                        onBack = { navController.popBackStack() },
                        onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                        onNavigateToTable = { targetTableId ->
                            navController.popBackStack()
                            navController.navigate(Routes.order(targetTableId))
                        },
                        onNavigateToPayment = { tid -> navController.navigate(Routes.payment(tid)) },
                        onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                        onSync = onSync
                    )
                } else {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        LaunchedEffect(Unit) { navController.popBackStack() }
                    }
                }
            }
            composable(
                route = Routes.PAYMENT,
                arguments = listOf(navArgument("tableId") { type = NavType.StringType })
            ) {
                PaymentScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onPaymentComplete = { navController.popBackStack(Routes.FLOOR_PLAN, false) },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.HOME) {
                val canAccessKds by authRepository.canAccessKds().collectAsState(initial = false)
                HomeScreen(
                    canAccessKds = canAccessKds,
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToClosedBills = { navController.navigate(Routes.CLOSED_BILLS) },
                    onNavigateToKds = { navController.navigate(Routes.KDS) },
                    onNavigateToUsers = { navController.navigate(Routes.USERS) },
                    onNavigateToVoidReport = { navController.navigate(Routes.VOID_REPORT) },
                    onNavigateToVoidApprovals = { navController.navigate(Routes.VOID_APPROVALS) },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) }
                )
            }
            composable(Routes.KDS) {
                KdsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToVoidApprovals = { navController.navigate(Routes.VOID_APPROVALS) },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.CLOSED_BILLS) {
                ClosedBillsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.USERS) {
                UsersScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.VOID_APPROVALS) {
                VoidApprovalsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) }
                )
            }
            composable(Routes.CLOSED_BILL_ACCESS_APPROVALS) {
                com.limonpos.app.ui.screens.closedbillaccessapprovals.ClosedBillAccessApprovalsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.VOID_REPORT) {
                VoidReportScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.PRINTERS) {
                PrintersScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.PRODUCTS) {
                ProductsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.CATEGORIES) {
                CategoriesScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.MODIFIERS) {
                ModifiersScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
            }
            composable(Routes.SERVER_SETTINGS) {
                ServerSettingsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToKds = { navController.navigate(Routes.KDS) },
                    onNavigateToBackOfficeSettings = { navController.navigate(Routes.BACK_OFFICE_SETTINGS) },
                    onNavigateToServerSettings = { navController.navigate(Routes.SERVER_SETTINGS) },
                    onNavigateToPrinters = { navController.navigate(Routes.PRINTERS) },
                    onNavigateToVoidReport = { navController.navigate(Routes.VOID_REPORT) },
                    onSync = onSync,
                    onLogout = { /* handled by SettingsViewModel.logout() */ }
                )
            }
            composable(Routes.BACK_OFFICE_SETTINGS) {
                DailySalesScreen(
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}
