package com.limonpos.app.ui.screens.payment

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.OrderItemEntity
import com.limonpos.app.ui.theme.*
import com.limonpos.app.util.CurrencyUtils
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentScreen(
    viewModel: PaymentViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onPaymentComplete: () -> Unit,
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.redirectToOrder) {
        if (uiState.redirectToOrder) {
            onBack()
        }
    }

    LaunchedEffect(uiState.paymentComplete) {
        if (uiState.paymentComplete) {
            delay(600)
            onPaymentComplete()
        }
    }

    LaunchedEffect(uiState.message) {
        uiState.message?.let {
            delay(3000)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Payment", fontWeight = FontWeight.Bold, color = LimonText)
                        uiState.orderWithItems?.order?.id?.takeLast(6)?.uppercase()?.let { shortId ->
                            Text(
                                text = "Ticket ID: $shortId",
                                color = LimonTextSecondary,
                                fontSize = 12.sp
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Floor Plan", tint = LimonPrimary)
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
                .verticalScroll(rememberScrollState())
        ) {
            uiState.message?.let { msg ->
                val msgColor = when {
                    uiState.paymentComplete -> LimonSuccess
                    msg.contains("failed", ignoreCase = true) -> LimonError
                    else -> LimonPrimary
                }
                Text(msg, color = msgColor, modifier = Modifier.padding(bottom = 16.dp))
            }
            uiState.orderWithItems?.let { ow ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = LimonSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Order Summary", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp)
                        Spacer(Modifier.height(12.dp))
                        ow.items.forEach { item ->
                            PaymentOrderItemRow(item)
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Total:", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp)
                            Text(CurrencyUtils.format(ow.order.total), fontWeight = FontWeight.Bold, color = LimonPrimary, fontSize = 18.sp)
                        }
                    }
                }
                Spacer(Modifier.height(24.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    FilterChip(
                        selected = uiState.paymentMode == "cash",
                        onClick = { viewModel.selectPaymentMode("cash") },
                        label = { Text("CASH", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
                        modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LimonPrimary, selectedLabelColor = Color.Black, containerColor = LimonSurface, labelColor = LimonText)
                    )
                    FilterChip(
                        selected = uiState.paymentMode == "card",
                        onClick = { viewModel.selectPaymentMode("card") },
                        label = { Text("CARD", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
                        modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LimonPrimary, selectedLabelColor = Color.Black, containerColor = LimonSurface, labelColor = LimonText)
                    )
                    FilterChip(
                        selected = uiState.paymentMode == "split",
                        onClick = { viewModel.selectPaymentMode("split") },
                        label = { Text("SPLIT", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
                        modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LimonPrimary, selectedLabelColor = Color.Black, containerColor = LimonSurface, labelColor = LimonText)
                    )
                }
                Spacer(Modifier.height(16.dp))
                if (uiState.paymentMode == "split") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Split Payment", fontWeight = FontWeight.Bold, color = LimonText)
                        TextButton(onClick = { viewModel.addSplit() }) {
                            Icon(Icons.Default.Add, contentDescription = null, tint = LimonPrimary, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Add Person", color = LimonPrimary)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
                uiState.splits.forEach { split ->
                    val otherSplitsTotal = uiState.completedPaymentsTotal + uiState.splits.filter { it.id != split.id }.sumOf { it.amount }
                    if (uiState.paymentMode == "split") {
                        SplitRow(
                            split = split,
                            orderTotal = ow.order.total,
                            otherSplitsTotal = otherSplitsTotal,
                            onUpdate = { amt, method, received, change ->
                                viewModel.updateSplit(split.id, amt, method, received, change)
                            },
                            onRemove = { viewModel.removeSplit(split.id) },
                            onPay = { viewModel.paySplit(split.id) },
                            showRemove = uiState.splits.size > 1
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
                if (uiState.paymentMode == "split" && uiState.splits.isEmpty()) {
                    Text("Tap +Add Person to add another split.", color = LimonTextSecondary, fontSize = 14.sp)
                }
                Spacer(Modifier.height(24.dp))
                val totalPaid = if (uiState.paymentMode == "split") uiState.completedPaymentsTotal else uiState.splits.sumOf { it.amount }
                val remainder = ow.order.total - totalPaid
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = LimonSurface.copy(alpha = 0.5f)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Amount Paid:", color = LimonTextSecondary, fontSize = 14.sp)
                            Text(CurrencyUtils.format(totalPaid), color = LimonText, fontSize = 14.sp)
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Balance:", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp)
                            Text(
                                CurrencyUtils.format(remainder),
                                color = when {
                                    kotlin.math.abs(remainder) < 0.01 -> LimonSuccess
                                    remainder < 0 -> LimonError
                                    else -> LimonPrimary
                                },
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                        }
                    }
                }
                if (uiState.isRecalledOrder && uiState.completedPaymentsTotal > 0.01) {
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = { viewModel.clearPreviousPaymentsForRecalled() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonPrimary)
                    ) {
                        Text("Clear previous payments (change payment method)")
                    }
                }
                if (remainder < -0.01) {
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = { viewModel.fixNegativeBalance() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonError)
                    ) {
                        Text("Fix Overpayment (Remove excess payments)")
                    }
                }
                Spacer(Modifier.height(16.dp))
                OutlinedButton(
                    onClick = { viewModel.printBill() },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Print Bill")
                }
                Spacer(Modifier.height(12.dp))
                if (uiState.paymentMode != "split") {
                    Button(
                        onClick = { viewModel.completePayment() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = LimonSuccess)
                    ) {
                        Text("Complete Payment", color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                }
            } ?: run {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Order not found", color = LimonTextSecondary)
                }
            }
        }
    }
}

@Composable
private fun PaymentOrderItemRow(item: OrderItemEntity) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text("${item.quantity}x ${item.productName}", color = LimonText, fontSize = 14.sp)
        Text(CurrencyUtils.format(item.price * item.quantity), color = LimonTextSecondary, fontSize = 14.sp)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SplitRow(
    split: PaymentSplit,
    orderTotal: Double,
    otherSplitsTotal: Double = 0.0,
    onUpdate: (amount: Double, method: String, received: Double, change: Double) -> Unit,
    onRemove: () -> Unit,
    onPay: () -> Unit = {},
    showRemove: Boolean = true
) {
    var amountStr by remember(split.id) { mutableStateOf(if (split.amount > 0) "%.2f".format(split.amount) else "") }
    var method by remember(split.id) { mutableStateOf(split.method) }
    val balanceAmount = (orderTotal - otherSplitsTotal).coerceAtLeast(0.0)
    val methodSelected = method == "cash" || method == "card"

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    FilterChip(
                        selected = method == "cash",
                        onClick = {
                            method = "cash"
                            val amt = if (amountStr.isBlank()) balanceAmount else amountStr.toDoubleOrNull() ?: 0.0
                            amountStr = if (amt > 0) "%.2f".format(amt) else ""
                            onUpdate(amt, "cash", amt, 0.0)
                        },
                        label = { Text("Cash", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = if (method == "cash") Color.Black else LimonText) },
                        modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LimonPrimary, containerColor = LimonSurface, selectedLabelColor = Color.Black, labelColor = LimonText)
                    )
                    FilterChip(
                        selected = method == "card",
                        onClick = {
                            method = "card"
                            val amt = if (amountStr.isBlank()) balanceAmount else amountStr.toDoubleOrNull() ?: 0.0
                            amountStr = if (amt > 0) "%.2f".format(amt) else ""
                            onUpdate(amt, "card", 0.0, 0.0)
                        },
                        label = { Text("Card", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = if (method == "card") Color.Black else LimonText) },
                        modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LimonPrimary, containerColor = LimonSurface, selectedLabelColor = Color.Black, labelColor = LimonText)
                    )
                }
                if (methodSelected) {
                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Bottom
                    ) {
                        OutlinedTextField(
                            value = amountStr,
                            onValueChange = {
                                val raw = it.toDoubleOrNull() ?: 0.0
                                val v = raw.coerceIn(0.0, balanceAmount)
                                amountStr = when {
                                    it.isEmpty() -> ""
                                    raw > balanceAmount -> "%.2f".format(v)
                                    else -> it
                                }
                                onUpdate(v, method, v, 0.0)
                            },
                            label = { Text("Amount") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = LimonText,
                                unfocusedTextColor = LimonText,
                                focusedBorderColor = LimonPrimary,
                                unfocusedBorderColor = LimonTextSecondary
                            )
                        )
                        Button(
                            onClick = {
                                amountStr = "%.2f".format(balanceAmount)
                                onUpdate(balanceAmount, method, balanceAmount, 0.0)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                        ) {
                            Text("Balance", color = Color.Black)
                        }
                        Button(
                            onClick = onPay,
                            colors = ButtonDefaults.buttonColors(containerColor = LimonSuccess)
                        ) {
                            Text("Pay", color = Color.Black, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            if (showRemove) {
                IconButton(onClick = onRemove) {
                    Icon(Icons.Default.Delete, contentDescription = "Remove", tint = LimonError)
                }
            }
        }
    }
}
