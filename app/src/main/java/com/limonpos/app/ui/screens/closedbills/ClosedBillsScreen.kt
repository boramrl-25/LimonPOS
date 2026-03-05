package com.limonpos.app.ui.screens.closedbills

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.OrderEntity
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.repository.OrderWithItems
import com.limonpos.app.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClosedBillsScreen(
    viewModel: ClosedBillsViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val paidOrders by viewModel.paidOrders.collectAsState(emptyList())
    val selectedOrderWithItems by viewModel.selectedOrderWithItems.collectAsState()
    val message by viewModel.message.collectAsState()
    val pinError by viewModel.pinError.collectAsState()
    val accessGranted by viewModel.accessGranted.collectAsState(false)
    val hasClosedBillAccess by viewModel.hasClosedBillAccess.collectAsState(false)
    val myAccessRequest by viewModel.myAccessRequest.collectAsState()
    val requestingAccess by viewModel.requestingAccess.collectAsState(false)

    var showPinDialog by remember { mutableStateOf(false) }
    var pin by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(accessGranted) {
        if (accessGranted) {
            showPinDialog = false
            viewModel.loadPaidOrders()
        }
    }
    LaunchedEffect(hasClosedBillAccess) {
        if (hasClosedBillAccess && !accessGranted) showPinDialog = true
    }
    LaunchedEffect(message) {
        message?.let {
            delay(2000)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Closed Bills", fontWeight = FontWeight.Bold, color = LimonText) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    if (accessGranted) {
                        IconButton(onClick = { viewModel.loadPaidOrders(); onSync() }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = LimonPrimary)
                        }
                    }
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Home", tint = LimonPrimary)
                    }
                    var menuExpanded by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { menuExpanded = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Menu", tint = LimonPrimary)
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            DropdownMenuItem(
                                text = { Text("Table Service", color = LimonText) },
                                onClick = { menuExpanded = false; onNavigateToFloorPlan() },
                                leadingIcon = { Icon(Icons.Default.Restaurant, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Sync Data", color = LimonText) },
                                onClick = { menuExpanded = false; onSync(); viewModel.refreshMyAccessRequest() },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Settings", color = LimonText) },
                                onClick = { menuExpanded = false; onNavigateToSettings() },
                                leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
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
                .padding(16.dp)
        ) {
            message?.let { msg ->
                Text(msg, color = LimonPrimary, modifier = Modifier.padding(bottom = 8.dp))
            }
            if (!accessGranted) {
                Text(
                    "Closed bills: View and refund require manager PIN or an approved access request.",
                    color = LimonTextSecondary,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
                when {
                    hasClosedBillAccess -> {
                        Text("Enter your PIN below to access.", color = LimonTextSecondary, modifier = Modifier.padding(bottom = 8.dp))
                        OutlinedTextField(
                            value = pin,
                            onValueChange = {
                                if (it.length <= 4 && it.all { c -> c.isDigit() }) {
                                    pin = it
                                    viewModel.clearPinError()
                                }
                            },
                            label = { Text("PIN (4 digits)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        pinError?.let { err ->
                            Text(err, color = LimonError, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                        Button(
                            onClick = {
                                scope.launch {
                                    val ok = viewModel.verifyClosedBillsPin(pin)
                                    if (ok) viewModel.setAccessGrantedByPin(true)
                                }
                            },
                            enabled = pin.length == 4,
                            modifier = Modifier.padding(top = 12.dp)
                        ) {
                            Text("Unlock", color = Color.Black)
                        }
                    }
                    myAccessRequest?.status == "pending" -> {
                        Text("Waiting for approval. Ask a manager/supervisor to approve from app or web dashboard.", color = LimonTextSecondary, modifier = Modifier.padding(bottom = 8.dp))
                        Button(onClick = { viewModel.refreshMyAccessRequest() }, enabled = !requestingAccess) {
                            Text(if (requestingAccess) "Checking…" else "Check approval status")
                        }
                    }
                    else -> {
                        Text("You can request access. A user with Closed Bill Access permission must approve.", color = LimonTextSecondary, modifier = Modifier.padding(bottom = 8.dp))
                        Button(onClick = { viewModel.requestAccess() }, enabled = !requestingAccess) {
                            Text(if (requestingAccess) "Requesting…" else "Request access")
                        }
                    }
                }
            } else {
                Text(
                    "Closed bills: View details and refund (single item or full bill).",
                    color = LimonTextSecondary,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
                if (paidOrders.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("No closed bills", color = LimonTextSecondary)
                    }
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(paidOrders, key = { it.id }) { order ->
                            ClosedBillCard(
                                order = order,
                                onOpen = { viewModel.selectOrderForRecall(order) }
                            )
                        }
                    }
                }
            }
        }
    }

    selectedOrderWithItems?.let { ow ->
        BillDetailDialog(
            orderWithItems = ow,
            onDismiss = { viewModel.dismissBillDialog() },
            onRefundItem = { orderId, itemId -> viewModel.refundItemFromClosedBill(orderId, itemId) },
            onRefundFull = { orderId -> viewModel.refundFullClosedBill(orderId) }
        )
    }

    if (showPinDialog && hasClosedBillAccess && !accessGranted) {
        AlertDialog(
            onDismissRequest = { showPinDialog = false },
            title = { Text("Closed Bills Access", fontWeight = FontWeight.Bold, color = LimonText) },
            text = {
                Column {
                    Text("Enter manager/supervisor PIN to view and refund closed bills.", color = LimonTextSecondary, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = pin,
                        onValueChange = {
                            if (it.length <= 4 && it.all { c -> c.isDigit() }) {
                                pin = it
                                viewModel.clearPinError()
                            }
                        },
                        label = { Text("PIN (4 digits)") },
                        singleLine = true
                    )
                    pinError?.let { err ->
                        Spacer(Modifier.height(4.dp))
                        Text(err, color = LimonError, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            val ok = viewModel.verifyClosedBillsPin(pin)
                            if (ok) {
                                showPinDialog = false
                                pin = ""
                                viewModel.setAccessGrantedByPin(true)
                            }
                        }
                    },
                    enabled = pin.length == 4
                ) {
                    Text("Unlock", color = Color.Black)
                }
            },
            dismissButton = { TextButton(onClick = { showPinDialog = false }) { Text("Cancel", color = LimonTextSecondary) } },
            containerColor = LimonSurface
        )
    }
}

@Composable
private fun BillDetailDialog(
    orderWithItems: OrderWithItems,
    onDismiss: () -> Unit,
    onRefundItem: (orderId: String, itemId: String) -> Unit,
    onRefundFull: (orderId: String) -> Unit
) {
    val order = orderWithItems.order
    val items = orderWithItems.items
    var showFullRefundConfirm by remember { mutableStateOf(false) }
    val dateStr = remember(order.paidAt) {
        order.paidAt?.let {
            SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date(it))
        } ?: "-"
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Bill - Table ${order.tableNumber}", fontWeight = FontWeight.Bold)
        },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text("Waiter: ${order.waiterName}", color = LimonTextSecondary, fontSize = 13.sp)
                Text(dateStr, color = LimonTextSecondary, fontSize = 12.sp)
                Spacer(Modifier.height(12.dp))
                Divider(color = LimonTextSecondary.copy(alpha = 0.3f))
                Spacer(Modifier.height(8.dp))
                items.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("${item.quantity}x ${item.productName}", color = LimonText, fontSize = 14.sp)
                            if (item.notes.isNotEmpty()) {
                                Text("  ${item.notes}", color = LimonTextSecondary, fontSize = 12.sp)
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("AED ${String.format("%.2f", item.price * item.quantity)}", color = LimonText, fontSize = 14.sp)
                            Spacer(Modifier.width(8.dp))
                            TextButton(
                                onClick = { onRefundItem(order.id, item.id) },
                                colors = ButtonDefaults.textButtonColors(contentColor = LimonError)
                            ) {
                                Text("Refund", fontSize = 12.sp)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Divider(color = LimonTextSecondary.copy(alpha = 0.3f))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Subtotal", color = LimonTextSecondary, fontSize = 14.sp)
                    Text("AED ${String.format("%.2f", order.subtotal)}", color = LimonText, fontSize = 14.sp)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Tax (5%)", color = LimonTextSecondary, fontSize = 14.sp)
                    Text("AED ${String.format("%.2f", order.taxAmount)}", color = LimonText, fontSize = 14.sp)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Total", color = LimonText, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text("AED ${String.format("%.2f", order.total)}", color = LimonPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { showFullRefundConfirm = true },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonError)
                ) {
                    Text("Full bill refund")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = LimonTextSecondary)
            }
        },
        dismissButton = {},
        containerColor = LimonSurface
    )
    if (showFullRefundConfirm) {
        AlertDialog(
            onDismissRequest = { showFullRefundConfirm = false },
            title = { Text("Full bill refund?", color = LimonText) },
            text = { Text("Refund entire bill for Table ${order.tableNumber}. This cannot be undone.", color = LimonTextSecondary) },
            confirmButton = {
                Button(
                    onClick = {
                        showFullRefundConfirm = false
                        onRefundFull(order.id)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) {
                    Text("Refund full bill", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showFullRefundConfirm = false }) {
                    Text("Cancel", color = LimonTextSecondary)
                }
            },
            containerColor = LimonSurface
        )
    }
}

@Composable
private fun ClosedBillCard(
    order: OrderEntity,
    onOpen: () -> Unit
) {
    val dateStr = remember(order.paidAt) {
        order.paidAt?.let {
            SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date(it))
        } ?: "-"
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Receipt, contentDescription = null, tint = LimonPrimary)
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Table ${order.tableNumber}", fontWeight = FontWeight.Bold, color = LimonText)
                Text("AED ${String.format("%.2f", order.total)}", color = LimonPrimary, fontSize = 14.sp)
                Text(dateStr, color = LimonTextSecondary, fontSize = 12.sp)
            }
            Button(
                onClick = onOpen,
                colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text("View")
            }
        }
    }
}

@Composable
private fun RecallBillDialog(
    order: OrderEntity,
    freeTables: List<TableEntity>,
    onDismiss: () -> Unit,
    onRecall: (String) -> Unit
) {
    val originalTableFree = freeTables.any { it.id == order.tableId }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Recall Bill to Table") },
        text = {
            Column {
                Text("Order: Table ${order.tableNumber} - AED ${String.format("%.2f", order.total)}", color = LimonText)
                Spacer(Modifier.height(12.dp))
                if (!originalTableFree) {
                    Text("Table ${order.tableNumber} (original) is occupied.", color = LimonError, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("Select an available table:", fontWeight = FontWeight.Medium, color = LimonText)
                } else {
                    Text("Select table:", fontWeight = FontWeight.Medium, color = LimonText)
                }
                Spacer(Modifier.height(8.dp))
                if (freeTables.isEmpty()) {
                    Text("No free tables available", color = LimonError)
                } else {
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 300.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(freeTables, key = { it.id }) { table ->
                            TextButton(
                                onClick = { onRecall(table.id) },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    "Table ${table.number}${if (table.id == order.tableId) " (original)" else ""}",
                                    color = LimonPrimary
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = LimonTextSecondary)
            }
        },
        containerColor = LimonSurface
    )
}
