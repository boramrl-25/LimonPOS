package com.limonpos.app.ui.screens.floorplan

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import android.media.AudioManager
import android.media.ToneGenerator
import kotlinx.coroutines.delay
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.repository.ReservationStatusHelper
import com.limonpos.app.data.repository.UpcomingReservationAlert
import com.limonpos.app.data.repository.OverdueUndelivered
import com.limonpos.app.ui.theme.*
import com.limonpos.app.ui.components.PrinterWarningDialog
import kotlinx.coroutines.flow.StateFlow

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FloorPlanScreen(
    viewModel: FloorPlanViewModel = hiltViewModel(),
    onNavigateToOrder: (tableId: String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToClosedBills: () -> Unit,
    onNavigateToDailyCashEntry: () -> Unit = {},
    onNavigateToVoidApprovals: () -> Unit = {},
    canAccessVoidApprovals: Boolean = false,
    onNavigateToClosedBillAccessApprovals: () -> Unit = {},
    canAccessClosedBillAccessApprovals: Boolean = false,
    onSync: () -> Unit = {},
    onLogout: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val currencySymbol by viewModel.currencySymbol.collectAsState(initial = "AED")
    val waiterName by viewModel.waiterName.collectAsState()
    val printerWarningState by viewModel.printerWarningState.collectAsState()
    val overdueWarning by viewModel.overdueWarning.collectAsState(initial = null)
    val reservationUpcoming by viewModel.reservationUpcoming.collectAsState(initial = emptyList())
    val canCancelReservation by viewModel.canCancelReservation.collectAsState(initial = false)
    val pendingVoidCount by viewModel.pendingVoidRequestCount.collectAsState(0)
    val pendingClosedBillAccessCount by viewModel.pendingClosedBillAccessRequestCount.collectAsState(0)
    var tableToClose by remember { mutableStateOf<TableEntity?>(null) }
    var showVoidRequestPopup by remember { mutableStateOf(true) }
    var showClosedBillAccessRequestPopup by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        showVoidRequestPopup = true
        showClosedBillAccessRequestPopup = true
    }

    if (canAccessVoidApprovals && pendingVoidCount > 0 && showVoidRequestPopup) {
        AlertDialog(
            onDismissRequest = { showVoidRequestPopup = false },
            title = { Text("Void Request", fontWeight = FontWeight.Bold, color = LimonText) },
            text = {
                Text(
                    "You have $pendingVoidCount pending void request(s) waiting for approval.",
                    color = LimonTextSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showVoidRequestPopup = false
                        onNavigateToVoidApprovals()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                ) {
                    Text("Go to Void Approvals", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showVoidRequestPopup = false }) {
                    Text("Dismiss", color = LimonTextSecondary)
                }
            },
            containerColor = LimonSurface
        )
    }

    if (canAccessClosedBillAccessApprovals && pendingClosedBillAccessCount > 0 && showClosedBillAccessRequestPopup) {
        // Short beep when a closed bill access request is pending
        LaunchedEffect(pendingClosedBillAccessCount) {
            if (pendingClosedBillAccessCount > 0) {
                val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80)
                try {
                    tg.startTone(ToneGenerator.TONE_PROP_BEEP2, 200)
                    delay(250)
                } finally {
                    tg.release()
                }
            }
        }
        AlertDialog(
            onDismissRequest = { showClosedBillAccessRequestPopup = false },
            title = { Text("Closed Bill Access Request", fontWeight = FontWeight.Bold, color = LimonText) },
            text = {
                Text(
                    "You have $pendingClosedBillAccessCount closed bill access request(s) waiting for approval.",
                    color = LimonTextSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showClosedBillAccessRequestPopup = false
                        onNavigateToClosedBillAccessApprovals()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                ) {
                    Text("Go to Closed Bill Access Requests", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showClosedBillAccessRequestPopup = false }) {
                    Text("Dismiss", color = LimonTextSecondary)
                }
            },
            containerColor = LimonSurface
        )
    }

    LaunchedEffect(printerWarningState) {
        if (printerWarningState == null) return@LaunchedEffect
        val tg = ToneGenerator(AudioManager.STREAM_ALARM, 80)
        try {
            while (true) {
                tg.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 400)
                delay(1500)
            }
        } finally {
            tg.release()
        }
    }

    overdueWarning?.let { list ->
        OverdueUndeliveredDialogFloor(
            list = list,
            onDismiss = { viewModel.dismissOverdueWarning() },
            onGoToTable = { tableId ->
                viewModel.dismissOverdueWarning()
                onNavigateToOrder(tableId)
            }
        )
    }

    LaunchedEffect(reservationUpcoming) {
        if (reservationUpcoming.isNotEmpty() && viewModel.shouldPlayReservationNotification(reservationUpcoming)) {
            val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80)
            try {
                tg.startTone(ToneGenerator.TONE_PROP_BEEP2, 300)
                delay(200)
                tg.startTone(ToneGenerator.TONE_PROP_BEEP2, 300)
            } finally {
                tg.release()
            }
        }
    }
    if (reservationUpcoming.isNotEmpty()) {
        ReservationUpcomingDialog(
            list = reservationUpcoming,
            onDismiss = { viewModel.dismissReservationReminder() },
            onGoToTable = { tableId ->
                viewModel.dismissReservationReminder()
                onNavigateToOrder(tableId)
            }
        )
    }
    LaunchedEffect(overdueWarning) {
        if (overdueWarning.isNullOrEmpty()) return@LaunchedEffect
        val tg = ToneGenerator(AudioManager.STREAM_ALARM, 80)
        try {
            repeat(3) {
                tg.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 400)
                delay(500)
            }
        } finally {
            tg.release()
        }
    }

    val sections by viewModel.floorPlanSections.collectAsState(initial = emptyMap())
    val currentUserId by viewModel.currentUserId.collectAsState(initial = null)
    val viewAllOrders by viewModel.viewAllOrders.collectAsState(initial = false)
    var tablesRaw = uiState.tablesByFloor[uiState.selectedFloor].orEmpty()
    val section = uiState.selectedSection
    if (section != "Main" && sections.isNotEmpty()) {
        val nums = sections[section].orEmpty()
        if (nums.isNotEmpty()) {
            tablesRaw = tablesRaw.filter { t -> t.number.toIntOrNull()?.let { nums.contains(it) } == true }
        }
    }
    if (currentUserId != null && !viewAllOrders) {
        tablesRaw = tablesRaw.filter { t ->
            t.status == "free" || t.waiterId == currentUserId
        }
    }
    val query = uiState.tableSearchQuery.trim().lowercase()
    val tables = if (query.isEmpty()) tablesRaw else tablesRaw.filter { t ->
        t.name.lowercase().contains(query) ||
        t.number.lowercase().contains(query) ||
        t.floor.lowercase().contains(query)
    }
    val filteredFreeCount = tables.count { it.status == "free" }
    val filteredOccupiedCount = tables.count { it.status == "occupied" || it.status == "bill" }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Floor Plan",
                        fontWeight = FontWeight.Bold,
                        color = LimonText,
                        fontSize = 20.sp
                    )
                },
                actions = {
                    if (!uiState.isLocked) {
                        IconButton(onClick = { viewModel.lockFloor() }) {
                            Icon(Icons.Default.Lock, contentDescription = "Lock", tint = LimonPrimary)
                        }
                    }
                    IconButton(
                        onClick = { viewModel.showCashDrawerDialog() },
                        modifier = Modifier.semantics { contentDescription = "Cash Drawer" }
                    ) {
                        Text(
                            text = currencySymbol,
                            color = LimonPrimary,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    waiterName?.let { name ->
                        Text(
                            name,
                            color = LimonTextSecondary,
                            fontSize = 14.sp,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                    }
                    IconButton(onClick = onNavigateToClosedBills) {
                        Icon(Icons.Default.Receipt, contentDescription = "Closed Bills", tint = LimonPrimary)
                    }
                    Box {
                        IconButton(onClick = { viewModel.toggleMenu() }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Menu", tint = LimonPrimary)
                        }
                        DropdownMenu(
                            expanded = uiState.showMenu,
                            onDismissRequest = { viewModel.dismissMenu() }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Sync Data", color = LimonText) },
                                onClick = {
                                    viewModel.dismissMenu()
                                    onSync()
                                },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Daily Cash Entry", color = LimonText) },
                                onClick = {
                                    viewModel.dismissMenu()
                                    onNavigateToDailyCashEntry()
                                },
                                leadingIcon = { Icon(Icons.Default.AccountBalance, contentDescription = null, tint = LimonPrimary) }
                            )
                            if (canAccessVoidApprovals) {
                                DropdownMenuItem(
                                    text = { Text("Void Approvals", color = LimonText) },
                                    onClick = {
                                        viewModel.dismissMenu()
                                        onNavigateToVoidApprovals()
                                    },
                                    leadingIcon = { Icon(Icons.Default.Check, contentDescription = null, tint = LimonPrimary) }
                                )
                            }
                            if (canAccessClosedBillAccessApprovals) {
                                DropdownMenuItem(
                                    text = { Text("Closed Bill Access Requests", color = LimonText) },
                                    onClick = {
                                        viewModel.dismissMenu()
                                        onNavigateToClosedBillAccessApprovals()
                                    },
                                    leadingIcon = { Icon(Icons.Default.Receipt, contentDescription = null, tint = LimonPrimary) }
                                )
                            }
                            DropdownMenuItem(
                                text = { Text("Settings", color = LimonText) },
                                onClick = {
                                    viewModel.dismissMenu()
                                    onNavigateToSettings()
                                },
                                leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Logout", color = LimonError) },
                                onClick = {
                                    viewModel.dismissMenu()
                                    onLogout()
                                },
                                leadingIcon = { Icon(Icons.Default.Logout, contentDescription = null, tint = LimonError) }
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = LimonSurface,
                    titleContentColor = LimonText
                )
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (!uiState.isLocked) {
            Column(modifier = Modifier.fillMaxSize()) {
            uiState.closeTableError?.let { err ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = LimonError.copy(alpha = 0.15f),
                    shadowElevation = 2.dp
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(err, color = LimonError, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        TextButton(onClick = { viewModel.clearCloseTableError() }) {
                            Text("Cancel", color = LimonTextSecondary)
                        }
                    }
                }
            }
            OutlinedTextField(
                value = uiState.tableSearchQuery,
                onValueChange = { viewModel.setTableSearchQuery(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Search tables...", color = LimonTextSecondary) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = LimonPrimary) },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = LimonText,
                    unfocusedTextColor = LimonText,
                    focusedBorderColor = LimonPrimary,
                    unfocusedBorderColor = LimonTextSecondary,
                    cursorColor = LimonPrimary
                )
            )
            if (uiState.floors.size > 1) {
                FlowRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    uiState.floors.forEach { floor ->
                        FilterChip(
                            selected = floor == uiState.selectedFloor,
                            onClick = { viewModel.selectFloor(floor) },
                            label = { Text(floor, maxLines = 2) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = LimonPrimary,
                                selectedLabelColor = Color.Black,
                                containerColor = LimonSurface,
                                labelColor = LimonText
                            )
                        )
                    }
                }
            }
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                for (sec in listOf("Main", "A", "B", "C", "D", "E")) {
                    FilterChip(
                        selected = sec == uiState.selectedSection,
                        onClick = { viewModel.selectSection(sec) },
                        label = { Text(sec, maxLines = 2) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = LimonPrimary,
                            selectedLabelColor = Color.Black,
                            containerColor = LimonSurface,
                            labelColor = LimonText
                        )
                    )
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(12.dp).background(LimonFree, CircleShape))
                    Spacer(Modifier.width(4.dp))
                    Text("Free", color = LimonTextSecondary, fontSize = 12.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(12.dp).background(LimonPrimary, CircleShape))
                    Spacer(Modifier.width(4.dp))
                    Text("Occupied", color = LimonTextSecondary, fontSize = 12.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(12.dp).background(LimonInfo, CircleShape))
                    Spacer(Modifier.width(4.dp))
                    Text("Reserved", color = LimonTextSecondary, fontSize = 12.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(12.dp).background(LimonSuccess, CircleShape))
                    Spacer(Modifier.width(4.dp))
                    Text("Bill", color = LimonTextSecondary, fontSize = 12.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(12.dp).background(LimonError, CircleShape))
                    Spacer(Modifier.width(4.dp))
                    Text("Res soon", color = LimonTextSecondary, fontSize = 12.sp)
                }
            }
            LazyVerticalGrid(
                modifier = Modifier.weight(1f),
                columns = GridCells.Fixed(4),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(tables, key = { it.id }) { table ->
                    val now = System.currentTimeMillis()
                    val isOccupiedWithUpcoming = (table.status == "occupied" || table.status == "bill") &&
                        ReservationStatusHelper.isReservationUpcoming(table, now, 30)
                    val isOtherUsersTable = viewAllOrders && currentUserId != null &&
                        table.waiterId != null && table.waiterId != currentUserId
                    TableCard(
                        table = table,
                        isOccupiedWithUpcomingReservation = isOccupiedWithUpcoming,
                        isOtherUsersTable = isOtherUsersTable,
                        onClick = { viewModel.onTableClick(table, onNavigateToOrder) },
                        onCloseTable = if ((table.status == "occupied" || table.status == "bill") && !isOtherUsersTable) {
                            { tableToClose = table }
                        } else null
                    )
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Free: $filteredFreeCount", color = LimonTextSecondary, fontSize = 14.sp)
                Text("Occupied: $filteredOccupiedCount", color = LimonTextSecondary, fontSize = 14.sp)
            }
        }
        }
        }
    }

    printerWarningState?.let { warning ->
        PrinterWarningDialog(
            message = warning.message,
            onRetry = { viewModel.retryKitchenPrint() },
            onDismiss = { viewModel.dismissPrinterWarning() },
            dismissLabel = "Kapat"
        )
    }

    if (uiState.showLockDialog) {
        LockFloorDialog(
            error = uiState.lockError,
            onVerify = { pin -> viewModel.unlockFloor(pin) }
        )
    }

    uiState.showOpenTableDialog?.let { table ->
        OpenTableDialog(
            table = table,
            onDismiss = { viewModel.dismissOpenTableDialog() },
            onConfirm = { guestCount -> viewModel.openTable(table.id, guestCount, onNavigateToOrder) },
            onReserve = { viewModel.showReserveTableDialog(table) }
        )
    }

    uiState.showReserveTableDialog?.let { table ->
        ReserveTableDialog(
            table = table,
            loading = uiState.reserveTableLoading,
            error = uiState.reserveTableError,
            onDismiss = { viewModel.dismissReserveTableDialog() },
            onSubmit = { name, phone, fromMs, toMs -> viewModel.reserveTable(table.id, name, phone, fromMs, toMs) }
        )
    }

    uiState.showReservationInfoDialog?.let { table ->
        ReservationInfoDialog(
            table = table,
            loading = uiState.reserveTableLoading,
            error = uiState.reserveTableError,
            canCancelReservation = canCancelReservation,
            onDismiss = { viewModel.dismissReservationInfoDialog() },
            onCancelReservation = { viewModel.cancelReservation(table.id) },
            onOpenTable = { viewModel.openTableFromReservation(table) }
        )
    }

    if (uiState.showCashDrawerDialog) {
        CashDrawerDialog(
            error = uiState.cashDrawerError,
            onDismiss = { viewModel.dismissCashDrawerDialog() },
            onVerify = { pin -> viewModel.verifyCashDrawer(pin) }
        )
    }

    if (uiState.showOtherTablePinDialog) {
        OtherTablePinDialog(
            error = uiState.otherTablePinError,
            onDismiss = { viewModel.dismissOtherTablePinDialog() },
            onVerify = { pin -> viewModel.verifyOtherTableAccess(pin) }
        )
    }

    LaunchedEffect(uiState.navigateToTableId) {
        uiState.navigateToTableId?.let { tableId ->
            onNavigateToOrder(tableId)
            viewModel.clearNavigateToTableId()
        }
    }

    tableToClose?.let { table ->
        val willReturnToReserved = ReservationStatusHelper.shouldReturnToReservedAfterClose(table, System.currentTimeMillis())
        AlertDialog(
            onDismissRequest = { tableToClose = null; viewModel.clearCloseTableError() },
            title = { Text("Close Table ${table.name}", color = LimonText) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Items will be discarded. Continue?", color = LimonTextSecondary)
                    if (willReturnToReserved) {
                        Text("Table will remain reserved for the upcoming reservation.", color = LimonInfo, fontSize = 13.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.closeTable(table.id)
                        tableToClose = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White, modifier = Modifier.size(24.dp))
                }
            },
            dismissButton = { TextButton(onClick = { tableToClose = null }) { Text("Cancel", color = LimonTextSecondary) } },
            containerColor = LimonSurface
        )
    }

    val showTransferTable by viewModel.showTransferTableDialog.collectAsState()
    if (showTransferTable) {
        TransferTableDialog(
            occupiedTables = viewModel.occupiedTables,
            freeTables = viewModel.freeTables,
            initialSource = viewModel.transferSourceTable,
            onDismiss = { viewModel.closeTransferTableDialog() },
            onTransfer = { src, tgt -> viewModel.transferTable(src, tgt) }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OpenTableDialog(
    table: TableEntity,
    onDismiss: () -> Unit,
    onConfirm: (Int) -> Unit,
    onReserve: (() -> Unit)? = null
) {
    var guestCount by remember { mutableStateOf(2) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Open Table ${table.number}", color = LimonText) },
        text = {
            Column {
                Text("Number of guests:", color = LimonTextSecondary)
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(onClick = { if (guestCount > 1) guestCount-- }) { Text("-") }
                    Spacer(Modifier.width(16.dp))
                    Text("$guestCount", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = LimonText)
                    Spacer(Modifier.width(16.dp))
                    Button(onClick = { if (guestCount < 20) guestCount++ }) { Text("+") }
                }
                if (onReserve != null) {
                    Spacer(Modifier.height(12.dp))
                    TextButton(onClick = onReserve) {
                        Text("Reserve table", color = LimonPrimary)
                    }
                }
            }
        },
        confirmButton = { Button(onClick = { onConfirm(guestCount) }) { Text("Open") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

private val RESERVE_TIME_SLOTS = (8..22).flatMap { h -> listOf("${h.toString().padStart(2, '0')}:00", "${h.toString().padStart(2, '0')}:30") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReserveTableDialog(
    table: TableEntity,
    loading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (guestName: String, guestPhone: String, fromTimeMs: Long, toTimeMs: Long) -> Unit
) {
    var guestName by remember { mutableStateOf("") }
    var guestPhone by remember { mutableStateOf("") }
    val calendar = remember { java.util.Calendar.getInstance() }
    val dateOptions = remember {
        calendar.apply {
            set(java.util.Calendar.HOUR_OF_DAY, 0)
            set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }
        (0..13).map { i ->
            val c = java.util.Calendar.getInstance().apply {
                set(java.util.Calendar.HOUR_OF_DAY, 0)
                set(java.util.Calendar.MINUTE, 0)
                set(java.util.Calendar.SECOND, 0)
                set(java.util.Calendar.MILLISECOND, 0)
                add(java.util.Calendar.DAY_OF_YEAR, i)
            }
            val label = when (i) {
                0 -> "Today"
                1 -> "Tomorrow"
                else -> java.text.SimpleDateFormat("EEE, d MMM", java.util.Locale.US).format(c.time)
            }
            label to c.timeInMillis
        }
    }
    var selectedDateIndex by remember { mutableStateOf(0) }
    var selectedFromIndex by remember { mutableStateOf(20) } // 18:00
    var selectedToIndex by remember { mutableStateOf(24) }   // 20:00
    var dateExpanded by remember { mutableStateOf(false) }
    var fromExpanded by remember { mutableStateOf(false) }
    var toExpanded by remember { mutableStateOf(false) }

    fun computeFromMs(): Long {
        val dayStart = dateOptions.getOrNull(selectedDateIndex)?.second ?: return 0L
        val minutesFromMidnight = 8 * 60 + selectedFromIndex * 30
        return dayStart + minutesFromMidnight * 60 * 1000L
    }
    fun computeToMs(): Long {
        val dayStart = dateOptions.getOrNull(selectedDateIndex)?.second ?: return 0L
        val minutesFromMidnight = 8 * 60 + selectedToIndex * 30
        return dayStart + minutesFromMidnight * 60 * 1000L
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Reserve Table ${table.number}", color = LimonText) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = guestName,
                    onValueChange = { guestName = it },
                    label = { Text("Guest name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = LimonText,
                        unfocusedTextColor = LimonText,
                        focusedBorderColor = LimonPrimary,
                        unfocusedBorderColor = LimonTextSecondary,
                        cursorColor = LimonPrimary
                    )
                )
                OutlinedTextField(
                    value = guestPhone,
                    onValueChange = { guestPhone = it },
                    label = { Text("Phone") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = LimonText,
                        unfocusedTextColor = LimonText,
                        focusedBorderColor = LimonPrimary,
                        unfocusedBorderColor = LimonTextSecondary,
                        cursorColor = LimonPrimary
                    )
                )
                ExposedDropdownMenuBox(
                    expanded = dateExpanded,
                    onExpandedChange = { dateExpanded = it }
                ) {
                    OutlinedTextField(
                        value = dateOptions.getOrNull(selectedDateIndex)?.first ?: "",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Date") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = LimonText,
                            unfocusedTextColor = LimonText,
                            focusedBorderColor = LimonPrimary,
                            unfocusedBorderColor = LimonTextSecondary,
                            cursorColor = LimonPrimary
                        )
                    )
                    DropdownMenu(
                        expanded = dateExpanded,
                        onDismissRequest = { dateExpanded = false },
                        modifier = Modifier.exposedDropdownSize()
                    ) {
                        dateOptions.forEachIndexed { index, (label, _) ->
                            DropdownMenuItem(
                                text = { Text(label, color = LimonText) },
                                onClick = { selectedDateIndex = index; dateExpanded = false }
                            )
                        }
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ExposedDropdownMenuBox(
                        expanded = fromExpanded,
                        onExpandedChange = { fromExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = RESERVE_TIME_SLOTS.getOrNull(selectedFromIndex) ?: "",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("From") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = LimonText,
                                unfocusedTextColor = LimonText,
                                focusedBorderColor = LimonPrimary,
                                unfocusedBorderColor = LimonTextSecondary,
                                cursorColor = LimonPrimary
                            )
                        )
                        DropdownMenu(
                            expanded = fromExpanded,
                            onDismissRequest = { fromExpanded = false },
                            modifier = Modifier.exposedDropdownSize()
                        ) {
                            RESERVE_TIME_SLOTS.forEachIndexed { index, slot ->
                                DropdownMenuItem(
                                    text = { Text(slot, color = LimonText) },
                                    onClick = { selectedFromIndex = index; fromExpanded = false; if (selectedToIndex <= index) selectedToIndex = index + 1 }
                                )
                            }
                        }
                    }
                    ExposedDropdownMenuBox(
                        expanded = toExpanded,
                        onExpandedChange = { toExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = RESERVE_TIME_SLOTS.getOrNull(selectedToIndex) ?: "",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("To") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = LimonText,
                                unfocusedTextColor = LimonText,
                                focusedBorderColor = LimonPrimary,
                                unfocusedBorderColor = LimonTextSecondary,
                                cursorColor = LimonPrimary
                            )
                        )
                        DropdownMenu(
                            expanded = toExpanded,
                            onDismissRequest = { toExpanded = false },
                            modifier = Modifier.exposedDropdownSize()
                        ) {
                            RESERVE_TIME_SLOTS.forEachIndexed { index, slot ->
                                if (index > selectedFromIndex) {
                                    DropdownMenuItem(
                                        text = { Text(slot, color = LimonText) },
                                        onClick = { selectedToIndex = index; toExpanded = false }
                                    )
                                }
                            }
                        }
                    }
                }
                if (loading) {
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(color = LimonPrimary, modifier = Modifier.fillMaxWidth())
                }
                error?.let { Text(it, color = LimonError, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val name = guestName.trim()
                    if (name.isEmpty()) return@Button
                    val fromMs = computeFromMs()
                    val toMs = computeToMs()
                    if (toMs <= fromMs) return@Button
                    onSubmit(name, guestPhone.trim(), fromMs, toMs)
                },
                enabled = !loading
            ) { Text("Reserve") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

@Composable
private fun ReservationInfoDialog(
    table: TableEntity,
    loading: Boolean,
    error: String?,
    canCancelReservation: Boolean,
    onDismiss: () -> Unit,
    onCancelReservation: () -> Unit,
    onOpenTable: () -> Unit
) {
    val fromStr = table.reservationFrom?.let { ts ->
        java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.US).format(java.util.Date(ts))
    } ?: ""
    val toStr = table.reservationTo?.let { ts ->
        java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.US).format(java.util.Date(ts))
    } ?: ""
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Table ${table.number} – Reserved", color = LimonText) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                table.reservationGuestName?.takeIf { it.isNotBlank() }?.let { name ->
                    Text("Guest: $name", color = LimonTextSecondary, fontSize = 14.sp)
                }
                table.reservationGuestPhone?.takeIf { it.isNotBlank() }?.let { phone ->
                    Text("Phone: $phone", color = LimonTextSecondary, fontSize = 14.sp)
                }
                if (fromStr.isNotEmpty() && toStr.isNotEmpty()) {
                    Text("From: $fromStr", color = LimonTextSecondary, fontSize = 14.sp)
                    Text("To: $toStr", color = LimonTextSecondary, fontSize = 14.sp)
                }
                Text("Reservation is cancelled automatically 10 min after end time.", color = LimonTextSecondary, fontSize = 12.sp)
                error?.let { Text(it, color = LimonError, fontSize = 12.sp) }
                if (loading) {
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(color = LimonPrimary, modifier = Modifier.fillMaxWidth())
                }
            }
        },
        confirmButton = {
            Button(onClick = onOpenTable) { Text("Open table") }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onDismiss) { Text("Close", color = LimonTextSecondary) }
                if (canCancelReservation) {
                    TextButton(onClick = onCancelReservation) { Text("Cancel reservation", color = LimonError) }
                }
            }
        },
        containerColor = LimonSurface
    )
}

@Composable
private fun LockFloorDialog(
    error: String?,
    onVerify: (String) -> Unit
) {
    var pin by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { },
        title = { Text("Enter PIN to Unlock Floor Plan", color = LimonText) },
        text = {
            Column {
                OutlinedTextField(
                    value = pin,
                    onValueChange = { if (it.length <= 4 && it.all { c -> c.isDigit() }) pin = it },
                    label = { Text("PIN") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                error?.let { Text(it, color = LimonError, fontSize = 12.sp) }
            }
        },
        confirmButton = { Button(onClick = { onVerify(pin) }) { Text("Unlock") } },
        containerColor = LimonSurface
    )
}

@Composable
private fun OtherTablePinDialog(
    error: String?,
    onDismiss: () -> Unit,
    onVerify: (String) -> Unit
) {
    var pin by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Enter PIN to Access Other Waiter's Table", color = LimonText) },
        text = {
            Column {
                Text("Enter your PIN to work on this table.", color = LimonTextSecondary, fontSize = 14.sp)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = pin,
                    onValueChange = { if (it.length <= 4 && it.all { c -> c.isDigit() }) pin = it },
                    label = { Text("PIN") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                error?.let { Text(it, color = LimonError, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp)) }
            }
        },
        confirmButton = { Button(onClick = { onVerify(pin) }) { Text("Verify") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

@Composable
private fun CashDrawerDialog(
    error: String?,
    onDismiss: () -> Unit,
    onVerify: (String) -> Unit
) {
    var pin by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cash Drawer - Enter PIN", color = LimonText) },
        text = {
            Column {
                OutlinedTextField(
                    value = pin,
                    onValueChange = { if (it.length <= 4 && it.all { c -> c.isDigit() }) pin = it },
                    label = { Text("PIN") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                error?.let { Text(it, color = LimonError, fontSize = 12.sp) }
            }
        },
        confirmButton = { Button(onClick = { onVerify(pin) }) { Text("Open Drawer") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

@Composable
private fun TransferTableDialog(
    occupiedTables: StateFlow<List<TableEntity>>,
    freeTables: StateFlow<List<TableEntity>>,
    initialSource: StateFlow<TableEntity?>,
    onDismiss: () -> Unit,
    onTransfer: (sourceId: String, targetId: String) -> Unit
) {
    val occupied by occupiedTables.collectAsState(emptyList())
    val free by freeTables.collectAsState(emptyList())
    val fixedSource by initialSource.collectAsState(null)
    var selectedSource by remember(fixedSource) { mutableStateOf<TableEntity?>(fixedSource) }
    var selectedTarget by remember { mutableStateOf<TableEntity?>(null) }
    LaunchedEffect(fixedSource) { selectedSource = fixedSource }
    val sourceTable = fixedSource ?: selectedSource

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Transfer Table", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text("From:", fontWeight = FontWeight.Medium, color = LimonText)
                if (fixedSource != null) {
                    fixedSource?.let { t ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp)
                                .background(LimonSurface.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Table ${t.number}", fontWeight = FontWeight.Bold, color = LimonPrimary)
                            t.waiterName?.takeIf { it.isNotBlank() }?.let { name ->
                                Text(" · $name", color = LimonTextSecondary, modifier = Modifier.padding(start = 4.dp))
                            }
                        }
                    }
                } else {
                    LazyColumn(modifier = Modifier.heightIn(max = 120.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        items(occupied, key = { it.id }) { t ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { selectedSource = t },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(selected = selectedSource?.id == t.id, onClick = { selectedSource = t })
                                Text("Table ${t.number} - ${t.waiterName ?: "-"}", color = LimonText)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                Text("To (select target table):", fontWeight = FontWeight.Medium, color = LimonText)
                if (free.isEmpty()) {
                    Text("No free tables available", color = LimonError, fontSize = 14.sp, modifier = Modifier.padding(vertical = 8.dp))
                } else {
                    LazyColumn(modifier = Modifier.heightIn(max = 150.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        items(free, key = { it.id }) { t ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { selectedTarget = t },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(selected = selectedTarget?.id == t.id, onClick = { selectedTarget = t })
                                Text("Table ${t.number}", color = LimonText)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val src = sourceTable
                    val tgt = selectedTarget
                    if (src != null && tgt != null) onTransfer(src.id, tgt.id)
                },
                enabled = sourceTable != null && selectedTarget != null
            ) { Text("Transfer") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

@Composable
private fun TableCard(
    table: TableEntity,
    isOccupiedWithUpcomingReservation: Boolean = false,
    isOtherUsersTable: Boolean = false,
    onClick: () -> Unit,
    onCloseTable: (() -> Unit)? = null
) {
    val isOccupied = table.status == "occupied"
    val isBill = table.status == "bill"
    val isReserved = table.status == "reserved"
    val borderColor = when {
        isOccupiedWithUpcomingReservation -> LimonError
        isOtherUsersTable -> LimonOtherTable
        isOccupied -> LimonPrimary
        isBill -> LimonSuccess
        isReserved -> LimonInfo
        else -> null
    }
    val bgColor = when {
        isOccupiedWithUpcomingReservation -> LimonError.copy(alpha = 0.15f)
        isOtherUsersTable -> LimonOtherTable.copy(alpha = 0.25f)
        isOccupied -> LimonSurface
        isBill -> LimonSurface.copy(alpha = 0.9f)
        isReserved -> LimonInfo.copy(alpha = 0.25f)
        else -> LimonSurface
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.9f)
            .clickable(onClick = onClick)
            .then(borderColor?.let { Modifier.border(2.dp, it, RoundedCornerShape(12.dp)) } ?: Modifier),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (onCloseTable != null) {
                IconButton(
                    onClick = onCloseTable,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Close Table",
                        tint = LimonError,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text = table.number,
                    fontWeight = FontWeight.Bold,
                    color = LimonText,
                    fontSize = 16.sp
                )
                table.waiterName?.takeIf { it.isNotBlank() }?.let { name ->
                    Text(
                        text = if (isOtherUsersTable) "($name)" else name,
                        color = if (isOtherUsersTable) LimonOtherTable else LimonTextSecondary,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                if (isOtherUsersTable && (isOccupied || isBill)) {
                    Text(
                        text = "Tap + PIN to access",
                        color = LimonOtherTable,
                        fontSize = 9.sp,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                if (isOccupiedWithUpcomingReservation) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Res soon",
                        color = LimonError,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "Occupied",
                        color = LimonPrimary,
                        fontSize = 11.sp
                    )
                } else if (isOccupied) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Occupied",
                        color = LimonPrimary,
                        fontSize = 11.sp
                    )
                } else if (isBill) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Bill",
                        color = LimonSuccess,
                        fontSize = 11.sp
                    )
                } else if (table.status == "reserved") {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Reserved",
                        color = LimonInfo,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                    table.reservationGuestName?.takeIf { it.isNotBlank() }?.let { name ->
                        Text(
                            text = name,
                            color = LimonText,
                            fontSize = 11.sp,
                            maxLines = 1,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    table.reservationGuestPhone?.takeIf { it.isNotBlank() }?.let { phone ->
                        Text(
                            text = phone,
                            color = LimonTextSecondary,
                            fontSize = 9.sp,
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OverdueUndeliveredDialogFloor(
    list: List<OverdueUndelivered>,
    onDismiss: () -> Unit,
    onGoToTable: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Items not yet delivered to table", fontWeight = FontWeight.Bold, color = LimonError)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                list.forEach { block ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = LimonSurface),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.clickable { onGoToTable(block.tableId) }
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Table ${block.tableNumber}", fontWeight = FontWeight.Bold, color = LimonPrimary, fontSize = 15.sp)
                                Text("Tap to go", color = LimonTextSecondary, fontSize = 12.sp)
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                            block.items.forEach { item ->
                                Text("• ${item.quantity}x ${item.productName}", color = LimonText, fontSize = 14.sp)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss, colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)) {
                Text("OK", color = Color.Black)
            }
        },
        containerColor = LimonSurface
    )
}

@Composable
private fun ReservationUpcomingDialog(
    list: List<UpcomingReservationAlert>,
    onDismiss: () -> Unit,
    onGoToTable: (String) -> Unit
) {
    val fromStr: (Long) -> String = { ts ->
        java.text.SimpleDateFormat("HH:mm", java.util.Locale.US).format(java.util.Date(ts))
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Upcoming reservations (30 min)", fontWeight = FontWeight.Bold, color = LimonText)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                list.forEach { alert ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = LimonSurface),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.clickable { onGoToTable(alert.tableId) }
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Table ${alert.tableNumber}", fontWeight = FontWeight.Bold, color = LimonPrimary, fontSize = 15.sp)
                                Text("Tap to go", color = LimonTextSecondary, fontSize = 12.sp)
                            }
                            alert.guestName?.takeIf { it.isNotBlank() }?.let { Text("Guest: $it", color = LimonTextSecondary, fontSize = 13.sp) }
                            Text("${fromStr(alert.reservationFrom)} – ${fromStr(alert.reservationTo)}", color = LimonTextSecondary, fontSize = 12.sp)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss, colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)) {
                Text("OK", color = Color.Black)
            }
        },
        containerColor = LimonSurface
    )
}
