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
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Restaurant
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.repository.OverdueUndelivered
import com.limonpos.app.ui.theme.*
import kotlinx.coroutines.flow.StateFlow

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FloorPlanScreen(
    viewModel: FloorPlanViewModel = hiltViewModel(),
    onNavigateToOrder: (tableId: String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToClosedBills: () -> Unit,
    onNavigateToVoidApprovals: () -> Unit = {},
    canAccessVoidApprovals: Boolean = false,
    onSync: () -> Unit = {},
    onLogout: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val waiterName by viewModel.waiterName.collectAsState()
    val printerWarningState by viewModel.printerWarningState.collectAsState()
    val overdueWarning by viewModel.overdueWarning.collectAsState(initial = null)
    val pendingVoidCount by viewModel.pendingVoidRequestCount.collectAsState(0)
    var tableToClose by remember { mutableStateOf<TableEntity?>(null) }
    var showVoidRequestPopup by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) { showVoidRequestPopup = true }

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
        OverdueUndeliveredDialogFloor(list = list, onDismiss = { viewModel.dismissOverdueWarning() })
    }
    LaunchedEffect(overdueWarning) {
        if (overdueWarning.isNullOrEmpty()) return@LaunchedEffect
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

    val sections by viewModel.floorPlanSections.collectAsState(initial = emptyMap())
    val currentUserId by viewModel.currentUserId.collectAsState(initial = null)
    var tablesRaw = uiState.tablesByFloor[uiState.selectedFloor].orEmpty()
    val section = uiState.selectedSection
    if (section != "Main" && sections.isNotEmpty()) {
        val nums = sections[section].orEmpty()
        if (nums.isNotEmpty()) {
            tablesRaw = tablesRaw.filter { t -> t.number.toIntOrNull()?.let { nums.contains(it) } == true }
        }
    }
    if (currentUserId != null) {
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
                    IconButton(onClick = { viewModel.showCashDrawerDialog() }) {
                        Icon(Icons.Default.AttachMoney, contentDescription = "Cash Drawer", tint = LimonPrimary)
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
                                text = { Text("Table Service", color = LimonText) },
                                onClick = { viewModel.dismissMenu() },
                                leadingIcon = { Icon(Icons.Default.Restaurant, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Sync Data", color = LimonText) },
                                onClick = {
                                    viewModel.dismissMenu()
                                    onSync()
                                },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
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
            printerWarningState?.let { warning ->
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
                        Text(
                            warning.message,
                            color = LimonError,
                            fontSize = 13.sp,
                            modifier = Modifier.weight(1f)
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { viewModel.retryKitchenPrint() }) {
                                Text("Retry", color = LimonPrimary, fontWeight = FontWeight.SemiBold)
                            }
                            TextButton(onClick = { viewModel.dismissPrinterWarning() }) {
                                Text("Dismiss", color = LimonTextSecondary)
                            }
                        }
                    }
                }
            }
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
                            Text("İptal", color = LimonTextSecondary)
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
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    uiState.floors.forEach { floor ->
                        FilterChip(
                            selected = floor == uiState.selectedFloor,
                            onClick = { viewModel.selectFloor(floor) },
                            label = { Text(floor) },
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
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                for (sec in listOf("Main", "A", "B", "C", "D", "E")) {
                    FilterChip(
                        selected = sec == uiState.selectedSection,
                        onClick = { viewModel.selectSection(sec) },
                        label = { Text(sec) },
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
            }
            LazyVerticalGrid(
                modifier = Modifier.weight(1f),
                columns = GridCells.Fixed(4),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(tables, key = { it.id }) { table ->
                    TableCard(
                        table = table,
                        onClick = { viewModel.onTableClick(table, onNavigateToOrder) },
                        onCloseTable = if (table.status == "occupied" || table.status == "bill") {
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
            onConfirm = { guestCount -> viewModel.openTable(table.id, guestCount, onNavigateToOrder) }
        )
    }

    if (uiState.showCashDrawerDialog) {
        CashDrawerDialog(
            error = uiState.cashDrawerError,
            onDismiss = { viewModel.dismissCashDrawerDialog() },
            onVerify = { pin -> viewModel.verifyCashDrawer(pin) }
        )
    }

    tableToClose?.let { table ->
        AlertDialog(
            onDismissRequest = { tableToClose = null; viewModel.clearCloseTableError() },
            title = { Text("Close Table ${table.name}", color = LimonText) },
            text = { Text("Items will be discarded. Continue?", color = LimonTextSecondary) },
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
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OpenTableDialog(
    table: TableEntity,
    onDismiss: () -> Unit,
    onConfirm: (Int) -> Unit
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
            }
        },
        confirmButton = { Button(onClick = { onConfirm(guestCount) }) { Text("Open") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
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
    val initSrc by initialSource.collectAsState(null)
    var selectedSource by remember(initSrc) { mutableStateOf<TableEntity?>(initSrc) }
    var selectedTarget by remember { mutableStateOf<TableEntity?>(null) }
    LaunchedEffect(initSrc) { if (initSrc != null) selectedSource = initSrc }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Transfer Table", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text("1. Source table (occupied):", fontWeight = FontWeight.Medium, color = LimonText)
                LazyColumn(modifier = Modifier.heightIn(max = 150.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
                Spacer(Modifier.height(16.dp))
                Text("2. Target table (free):", fontWeight = FontWeight.Medium, color = LimonText)
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
        },
        confirmButton = {
            Button(
                onClick = {
                    val src = selectedSource
                    val tgt = selectedTarget
                    if (src != null && tgt != null) onTransfer(src.id, tgt.id)
                },
                enabled = selectedSource != null && selectedTarget != null
            ) { Text("Transfer") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

@Composable
private fun TableCard(
    table: TableEntity,
    onClick: () -> Unit,
    onCloseTable: (() -> Unit)? = null
) {
    val isOccupied = table.status == "occupied"
    val isBill = table.status == "bill"
    val isReserved = table.status == "reserved"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.9f)
            .clickable(onClick = onClick)
            .then(
                when {
                    isOccupied -> Modifier.border(2.dp, LimonPrimary, RoundedCornerShape(12.dp))
                    isBill -> Modifier.border(2.dp, LimonSuccess, RoundedCornerShape(12.dp))
                    isReserved -> Modifier.border(2.dp, LimonInfo, RoundedCornerShape(12.dp))
                    else -> Modifier
                }
            ),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = when {
                isOccupied -> LimonSurface
                isBill -> LimonSurface.copy(alpha = 0.9f)
                else -> LimonSurface
            }
        )
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
                        text = name,
                        color = LimonTextSecondary,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                if (isOccupied) {
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
                        fontSize = 11.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun OverdueUndeliveredDialogFloor(
    list: List<OverdueUndelivered>,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Ürünler henüz masaya gelmedi", fontWeight = FontWeight.Bold, color = LimonError)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("10 dakikadan fazla süredir mutfakta olup masaya gelmeyen ürünler:", color = LimonTextSecondary, fontSize = 13.sp)
                list.forEach { block ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = LimonSurface),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text("Masa ${block.tableNumber}", fontWeight = FontWeight.Bold, color = LimonPrimary, fontSize = 15.sp)
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
                Text("Tamam", color = Color.Black)
            }
        },
        containerColor = LimonSurface
    )
}
