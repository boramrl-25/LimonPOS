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
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClosedBillsScreen(
    viewModel: ClosedBillsViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onRecallSuccess: (tableId: String) -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val paidOrders by viewModel.paidOrders.collectAsState(emptyList())
    val selectedOrderWithItems by viewModel.selectedOrderWithItems.collectAsState()
    val showTableSelection by viewModel.showTableSelection.collectAsState()
    val freeTables by viewModel.freeTables.collectAsState(emptyList())
    val message by viewModel.message.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadPaidOrders() }
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
                                onClick = { menuExpanded = false; onSync() },
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
            Text(
                "Recall reopens the bill on a table. After recall you can: Refund single item or full bill, Change payment method, Add/remove items. If original table is occupied, select another free table.",
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
                            onRecall = { viewModel.selectOrderForRecall(order) }
                        )
                    }
                }
            }
        }
    }

    selectedOrderWithItems?.let { ow ->
        if (showTableSelection) {
            RecallBillDialog(
                order = ow.order,
                freeTables = freeTables,
                onDismiss = { viewModel.dismissBillDialog() },
                onRecall = { tableId ->
                    viewModel.recallToTable(ow.order.id, tableId) { onRecallSuccess(tableId) }
                }
            )
        } else {
            BillDetailDialog(
                orderWithItems = ow,
                onDismiss = { viewModel.dismissBillDialog() },
                onRecallToTable = { viewModel.onRecallToTableClicked() }
            )
        }
    }
}

@Composable
private fun BillDetailDialog(
    orderWithItems: OrderWithItems,
    onDismiss: () -> Unit,
    onRecallToTable: () -> Unit
) {
    val order = orderWithItems.order
    val items = orderWithItems.items
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
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("${item.quantity}x ${item.productName}", color = LimonText, fontSize = 14.sp)
                        Text("AED ${String.format("%.2f", item.price * item.quantity)}", color = LimonText, fontSize = 14.sp)
                    }
                    if (item.notes.isNotEmpty()) {
                        Text("  ${item.notes}", color = LimonTextSecondary, fontSize = 12.sp)
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
            }
        },
        confirmButton = {
            Button(
                onClick = onRecallToTable,
                colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
            ) {
                Text("Recall to Table")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = LimonTextSecondary)
            }
        },
        containerColor = LimonSurface
    )
}

@Composable
private fun ClosedBillCard(
    order: OrderEntity,
    onRecall: () -> Unit
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
                onClick = onRecall,
                colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text("Recall")
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
