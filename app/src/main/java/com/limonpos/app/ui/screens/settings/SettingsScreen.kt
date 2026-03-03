package com.limonpos.app.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.local.entity.UserEntity
import com.limonpos.app.ui.theme.*
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToKds: () -> Unit = {},
    onNavigateToBackOfficeSettings: () -> Unit = {},
    onNavigateToServerSettings: () -> Unit = {},
    onNavigateToPrinters: () -> Unit = {},
    onNavigateToVoidReport: () -> Unit = {},
    onSync: () -> Unit = {},
    onLogout: () -> Unit
) {
    val userRole by viewModel.userRole.collectAsState(null)
    val isManager by viewModel.isManager.collectAsState(false)
    val message by viewModel.message.collectAsState()
    var menuExpanded by remember { mutableStateOf(false) }
    var showClearSalesConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(message) {
        message?.let {
            delay(2000)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.Bold, color = LimonText) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Floor Plan", tint = LimonPrimary)
                    }
                    Box {
                        IconButton(
                            onClick = { menuExpanded = true },
                            modifier = Modifier.background(LimonPrimary.copy(alpha = 0.3f))
                        ) {
                            Icon(Icons.Default.Menu, contentDescription = "Menu", tint = LimonPrimary)
                        }
                        DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Kitchen Display (KDS)", color = LimonText) },
                            onClick = {
                                menuExpanded = false
                                onNavigateToKds()
                            },
                            leadingIcon = { Icon(Icons.Default.Restaurant, contentDescription = null, tint = LimonPrimary) }
                        )
                        if (isManager) {
                            DropdownMenuItem(
                                text = { Text("Transfer Table", color = LimonText) },
                                onClick = {
                                    menuExpanded = false
                                    viewModel.openTransferTable()
                                },
                                leadingIcon = { Icon(Icons.Default.SwapHoriz, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Transfer Waiter", color = LimonText) },
                                onClick = {
                                    menuExpanded = false
                                    viewModel.openTransferWaiter()
                                },
                                leadingIcon = { Icon(Icons.Default.People, contentDescription = null, tint = LimonPrimary) }
                            )
                        }
                        Divider(color = LimonTextSecondary.copy(alpha = 0.3f))
                        DropdownMenuItem(
                            text = { Text("Logout", color = LimonError) },
                            onClick = {
                                menuExpanded = false
                                viewModel.logout()
                            },
                            leadingIcon = { Icon(Icons.Default.Logout, contentDescription = null, tint = LimonError) }
                        )
                    }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = LimonSurface, titleContentColor = LimonText)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            message?.let { msg ->
                Text(msg, color = LimonPrimary, modifier = Modifier.padding(bottom = 16.dp), fontSize = 14.sp)
            }
            Text("POS Actions", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp, modifier = Modifier.padding(bottom = 12.dp))
            OutlinedButton(
                onClick = onNavigateToPrinters,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Printer Setup", color = LimonText)
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onNavigateToVoidReport,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Void Report", color = LimonText)
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onNavigateToKds,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Restaurant, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Kitchen Display (KDS)", color = LimonText)
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onNavigateToBackOfficeSettings,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Daily Sales", color = LimonText)
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onNavigateToServerSettings,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Server URL (WiFi)", color = LimonText)
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = { showClearSalesConfirm = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonError)
            ) {
                Icon(Icons.Default.DeleteForever, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Clear Local Sales", color = LimonError)
            }
            if (isManager) {
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { viewModel.openTransferTable() },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.SwapHoriz, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Transfer Table", color = LimonText)
                }
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { viewModel.openTransferWaiter() },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.People, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Transfer Waiter", color = LimonText)
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = { viewModel.logout() },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = LimonError)
            ) {
                Icon(Icons.Default.Logout, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Logout", color = LimonText)
            }
        }
    }

    val showTransferTable by viewModel.showTransferTableDialog.collectAsState()
    if (showTransferTable) {
        TransferTableDialog(
            occupiedTables = viewModel.occupiedTables,
            freeTables = viewModel.freeTables,
            onDismiss = { viewModel.closeTransferTableDialog() },
            onTransfer = { src, tgt -> viewModel.transferTable(src, tgt) }
        )
    }

    if (showClearSalesConfirm) {
        AlertDialog(
            onDismissRequest = { showClearSalesConfirm = false },
            title = { Text("Clear Local Sales?", fontWeight = FontWeight.Bold) },
            text = { Text("This will delete all orders, payments and void data from this device. Tables will be reset. Continue?", color = LimonText) },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearLocalSales()
                        showClearSalesConfirm = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) { Text("Clear") }
            },
            dismissButton = { TextButton(onClick = { showClearSalesConfirm = false }) { Text("Cancel", color = LimonTextSecondary) } },
            containerColor = LimonSurface
        )
    }

    val showTransferWaiter by viewModel.showTransferWaiterDialog.collectAsState()
    if (showTransferWaiter) {
        TransferWaiterDialog(
            occupiedTables = viewModel.occupiedTables,
            waiters = viewModel.waiters,
            onDismiss = { viewModel.closeTransferWaiterDialog() },
            onTransfer = { tableId, waiterId, waiterName -> viewModel.transferWaiter(tableId, waiterId, waiterName) }
        )
    }
}

@Composable
private fun TransferTableDialog(
    occupiedTables: StateFlow<List<TableEntity>>,
    freeTables: StateFlow<List<TableEntity>>,
    onDismiss: () -> Unit,
    onTransfer: (sourceId: String, targetId: String) -> Unit
) {
    val occupied by occupiedTables.collectAsState(emptyList())
    val free by freeTables.collectAsState(emptyList())
    var selectedSource by remember { mutableStateOf<TableEntity?>(null) }
    var selectedTarget by remember { mutableStateOf<TableEntity?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Transfer Table", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text("1. Select source table (occupied):", fontWeight = FontWeight.Medium, color = LimonText)
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
                Text("2. Select target table (free):", fontWeight = FontWeight.Medium, color = LimonText)
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
                    if (src != null && tgt != null) {
                        onTransfer(src.id, tgt.id)
                    }
                },
                enabled = selectedSource != null && selectedTarget != null
            ) { Text("Transfer") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

@Composable
private fun TransferWaiterDialog(
    occupiedTables: StateFlow<List<TableEntity>>,
    waiters: StateFlow<List<UserEntity>>,
    onDismiss: () -> Unit,
    onTransfer: (tableId: String, waiterId: String, waiterName: String) -> Unit
) {
    val occupied by occupiedTables.collectAsState(emptyList())
    val users by waiters.collectAsState(emptyList())
    var selectedTable by remember { mutableStateOf<TableEntity?>(null) }
    var selectedWaiter by remember { mutableStateOf<UserEntity?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Transfer Waiter", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text("1. Select table:", fontWeight = FontWeight.Medium, color = LimonText)
                LazyColumn(modifier = Modifier.heightIn(max = 120.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(occupied, key = { it.id }) { t ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedTable = t },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = selectedTable?.id == t.id, onClick = { selectedTable = t })
                            Text("Table ${t.number} - ${t.waiterName ?: "-"}", color = LimonText)
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                Text("2. Select new waiter:", fontWeight = FontWeight.Medium, color = LimonText)
                LazyColumn(modifier = Modifier.heightIn(max = 120.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(users, key = { it.id }) { u ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedWaiter = u },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = selectedWaiter?.id == u.id, onClick = { selectedWaiter = u })
                            Text("${u.name} (${u.role})", color = LimonText)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val tbl = selectedTable
                    val w = selectedWaiter
                    if (tbl != null && w != null) {
                        onTransfer(tbl.id, w.id, w.name)
                    }
                },
                enabled = selectedTable != null && selectedWaiter != null
            ) { Text("Transfer") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}
