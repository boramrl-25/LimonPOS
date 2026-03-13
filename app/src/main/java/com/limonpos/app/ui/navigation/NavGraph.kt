package com.limonpos.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import android.content.Intent
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
import com.limonpos.app.data.repository.OverdueWarningHolder
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
import com.limonpos.app.ui.screens.dailycashentry.DailyCashEntryScreen
import com.limonpos.app.ui.screens.serversettings.ServerSettingsScreen
import com.limonpos.app.util.showOverdueNotification
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
    const val DAILY_CASH_ENTRY = "daily_cash_entry"

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
    overdueWarningHolder: OverdueWarningHolder
) {
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val onSync: () -> Unit = { scope.launch { if (apiSyncRepository.isOnline()) apiSyncRepository.syncFromApi() } }
    val isLoggedIn by authRepository.isLoggedIn().collectAsState(initial = false)
    val loginScreenKey by authRepository.loginScreenKey.collectAsState(initial = 0)
    var showMaintenanceServerSettings by remember { mutableStateOf(false) }

    if (!isLoggedIn) {
        if (showMaintenanceServerSettings) {
            ServerSettingsScreen(
                isMaintenanceAccess = true,
                onBack = { showMaintenanceServerSettings = false }
            )
        } else {
            key(loginScreenKey) {
                LoginScreen(
                    onLoginSuccess = {
                        val intent = Intent(context, com.limonpos.app.MainActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                        }
                        context.startActivity(intent)
                        (context as? android.app.Activity)?.finish()
                    },
                    onServerSettingsAccessGranted = { showMaintenanceServerSettings = true },
                    loginScreenKey = loginScreenKey
                )
            }
        }
    } else {
        // Her logout+login sonrası yeni NavController: Hangi sayfadan çıkış yapılırsa yapılsın Floor Plan'a gel (1234 hariç)
        key(loginScreenKey) {
            val navController = rememberNavController()
            val context = LocalContext.current
            LaunchedEffect(Unit) {
                overdueWarningHolder.overdue.collect { list ->
                    if (!list.isNullOrEmpty() && overdueWarningHolder.shouldShowNotification(list)) {
                        showOverdueNotification(context, list)
                    }
                }
            }
            LaunchedEffect(Unit) {
                val activity = context as? android.app.Activity
                val tableId = activity?.intent?.getStringExtra("open_table_id")
                if (!tableId.isNullOrBlank()) {
                    activity?.intent?.removeExtra("open_table_id")
                    navController.navigate(Routes.FLOOR_PLAN) {
                        popUpTo(Routes.GATE) { inclusive = true }
                        launchSingleTop = true
                    }
                    navController.navigate(Routes.order(tableId)) { launchSingleTop = true }
                }
            }
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
                    // 1234 hariç tüm girişler Floor Plan'a (1234 = Server Settings, login yok)
                    navController.navigate(Routes.FLOOR_PLAN) {
                        popUpTo(Routes.GATE) { inclusive = true }
                        launchSingleTop = true
                    }
                }
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = LimonPrimary)
                }
            }
            composable(Routes.FLOOR_PLAN) {
                var isKdsUser by remember { mutableStateOf<Boolean?>(null) }
                LaunchedEffect(Unit) {
                    isKdsUser = (authRepository.getCurrentUser()?.role == "kds")
                }
                LaunchedEffect(isKdsUser) {
                    if (isKdsUser == true) {
                        navController.navigate(Routes.SETTINGS) {
                            popUpTo(Routes.FLOOR_PLAN) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                }
                when (isKdsUser) {
                    true -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = LimonPrimary)
                    }
                    false -> {
                        val scope = rememberCoroutineScope()
                        val canAccessKds by authRepository.canAccessKds().collectAsState(initial = false)
                        val canAccessVoidApprovals by authRepository.canAccessVoidApprovals().collectAsState(initial = false)
                        var canAccessClosedBillApprovals by remember { mutableStateOf(false) }
                        val canAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                        LaunchedEffect(Unit) {
                            canAccessClosedBillApprovals = authRepository.hasClosedBillAccess()
                        }
                        FloorPlanScreen(
                            onNavigateToOrder = { tableId -> navController.navigate(Routes.order(tableId)) },
                            onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                            canAccessSettings = canAccessSettings,
                            onNavigateToClosedBills = { navController.navigate(Routes.CLOSED_BILLS) },
                            onNavigateToDailyCashEntry = { navController.navigate(Routes.DAILY_CASH_ENTRY) },
                            onNavigateToVoidApprovals = { navController.navigate(Routes.VOID_APPROVALS) },
                            canAccessVoidApprovals = canAccessVoidApprovals,
                            onNavigateToClosedBillAccessApprovals = { navController.navigate(Routes.CLOSED_BILL_ACCESS_APPROVALS) },
                            canAccessClosedBillAccessApprovals = canAccessClosedBillApprovals,
                            onSync = onSync,
                            onLogout = { scope.launch { authRepository.logout() } }
                        )
                    }
                    null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = LimonPrimary)
                    }
                }
            }
            composable(
                route = Routes.ORDER,
                arguments = listOf(navArgument("tableId") { type = NavType.StringType })
            ) { backStackEntry ->
                val tableId = backStackEntry.arguments?.getString("tableId") ?: ""
                var isKdsUser by remember { mutableStateOf<Boolean?>(null) }
                LaunchedEffect(Unit) {
                    isKdsUser = (authRepository.getCurrentUser()?.role == "kds")
                }
                LaunchedEffect(isKdsUser) {
                    if (isKdsUser == true) {
                        navController.navigate(Routes.SETTINGS) {
                            popUpTo(Routes.FLOOR_PLAN) { inclusive = true }
                            popUpTo(Routes.ORDER) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                }
                when {
                    isKdsUser == true || isKdsUser == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = LimonPrimary)
                    }
                    tableId.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        LaunchedEffect(Unit) { navController.popBackStack() }
                    }
                    else -> {
                        val orderCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                        OrderScreen(
                            onBack = { navController.popBackStack() },
                            onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                            onLogout = {
                                android.util.Log.d("LimonDebug", "NavGraph: onLogout tetiklendi (OrderScreen)")
                                scope.launch { authRepository.logout() }
                            },
                            onNavigateToTable = { targetTableId ->
                                navController.popBackStack()
                                navController.navigate(Routes.order(targetTableId))
                            },
                            onNavigateToPayment = { tid -> navController.navigate(Routes.payment(tid)) },
                            onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                            canAccessSettings = orderCanAccessSettings,
                            onSync = onSync
                        )
                    }
                }
            }
            composable(
                route = Routes.PAYMENT,
                arguments = listOf(navArgument("tableId") { type = NavType.StringType })
            ) {
                val paymentCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                PaymentScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onPaymentComplete = {
                        android.util.Log.d("LimonDebug", "NavGraph: onLogout tetiklendi (PaymentScreen)")
                        scope.launch { authRepository.logout() }
                    },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = paymentCanAccessSettings,
                    onSync = onSync
                )
            }
            composable(Routes.HOME) {
                val canAccessKds by authRepository.canAccessKds().collectAsState(initial = false)
                val canAccessVoidApprovals by authRepository.canAccessVoidApprovals().collectAsState(initial = false)
                val homeCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                HomeScreen(
                    canAccessKds = canAccessKds,
                    canAccessVoidApprovals = canAccessVoidApprovals,
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToClosedBills = { navController.navigate(Routes.CLOSED_BILLS) },
                    onNavigateToKds = { navController.navigate(Routes.KDS) },
                    onNavigateToUsers = { navController.navigate(Routes.USERS) },
                    onNavigateToVoidReport = { navController.navigate(Routes.VOID_REPORT) },
                    onNavigateToVoidApprovals = { navController.navigate(Routes.VOID_APPROVALS) },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = homeCanAccessSettings
                )
            }
            composable(Routes.KDS) {
                var hasAccess by remember { mutableStateOf<Boolean?>(null) }
                LaunchedEffect(Unit) {
                    hasAccess = authRepository.hasKdsAccess()
                }
                LaunchedEffect(hasAccess) {
                    if (hasAccess == false) navController.popBackStack()
                }
                if (hasAccess == true) {
                    KdsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToVoidApprovals = { navController.navigate(Routes.VOID_APPROVALS) },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    onSync = onSync
                )
                }
            }
            composable(Routes.CLOSED_BILLS) {
                val closedBillsCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                ClosedBillsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = closedBillsCanAccessSettings,
                    onSync = onSync
                )
            }
            composable(Routes.USERS) {
                val usersCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                UsersScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = usersCanAccessSettings,
                    onSync = onSync
                )
            }
            composable(Routes.VOID_APPROVALS) {
                val voidApprovalsCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                VoidApprovalsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = voidApprovalsCanAccessSettings,
                    onSync = onSync
                )
            }
            composable(Routes.CLOSED_BILL_ACCESS_APPROVALS) {
                val cbaCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                com.limonpos.app.ui.screens.closedbillaccessapprovals.ClosedBillAccessApprovalsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = cbaCanAccessSettings,
                    onSync = onSync
                )
            }
            composable(Routes.VOID_REPORT) {
                val voidReportCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                VoidReportScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = voidReportCanAccessSettings,
                    onSync = onSync
                )
            }
            composable(Routes.PRINTERS) {
                val printersCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                PrintersScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = printersCanAccessSettings,
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
                val categoriesCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                CategoriesScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = categoriesCanAccessSettings,
                    onSync = onSync
                )
            }
            composable(Routes.MODIFIERS) {
                val modifiersCanAccessSettings by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                ModifiersScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                    canAccessSettings = modifiersCanAccessSettings,
                    onSync = onSync
                )
            }
            composable(Routes.SERVER_SETTINGS) {
                var userRole by remember { mutableStateOf<String?>(null) }
                LaunchedEffect(Unit) {
                    userRole = authRepository.getCurrentUser()?.role
                }
                ServerSettingsScreen(
                    isSetupUser = userRole == "setup",
                    onBack = {
                        if (userRole == "setup") {
                            scope.launch { authRepository.logout() }
                        } else {
                            navController.popBackStack()
                        }
                    }
                )
            }
            composable(Routes.SETTINGS) {
                val settingsCanAccess by authRepository.canAccessSettingsFlow().collectAsState(initial = true)
                LaunchedEffect(settingsCanAccess) {
                    if (!settingsCanAccess) {
                        navController.navigate(Routes.FLOOR_PLAN) {
                            popUpTo(Routes.FLOOR_PLAN) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                }
                if (settingsCanAccess) SettingsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToFloorPlan = { navController.navigate(Routes.FLOOR_PLAN) { popUpTo(Routes.FLOOR_PLAN) { inclusive = true }; launchSingleTop = true } },
                    onNavigateToKds = { navController.navigate(Routes.KDS) },
                    onNavigateToBackOfficeSettings = { navController.navigate(Routes.BACK_OFFICE_SETTINGS) },
                    onNavigateToServerSettings = { navController.navigate(Routes.SERVER_SETTINGS) },
                    onNavigateToPrinters = { navController.navigate(Routes.PRINTERS) },
                    onSync = onSync,
                    onLogout = { /* handled by SettingsViewModel.logout() */ }
                ) else Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = LimonPrimary)
                }
            }
            composable(Routes.BACK_OFFICE_SETTINGS) {
                DailySalesScreen(
                    onBack = { navController.popBackStack() }
                )
            }
            composable(Routes.DAILY_CASH_ENTRY) {
                DailyCashEntryScreen(
                    onBack = { navController.popBackStack() }
                )
            }
        }
        }
    }
}
