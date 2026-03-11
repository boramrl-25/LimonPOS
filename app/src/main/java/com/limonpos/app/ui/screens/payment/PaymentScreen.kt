package com.limonpos.app.ui.screens.payment

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material.icons.Icons
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
import com.limonpos.app.data.local.entity.PaymentEntity
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
    canAccessSettings: Boolean = true,
    onSync: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()
    val receiptWarning by viewModel.receiptPrintWarningState.collectAsState(null)

    receiptWarning?.let { warning ->
        key(warning.id) {
            AlertDialog(
                onDismissRequest = { viewModel.dismissReceiptWarning() },
                title = { Text("Receipt print failed", color = LimonText) },
                text = { Text(warning.message, color = LimonTextSecondary) },
                confirmButton = {
                    Button(
                        onClick = { viewModel.retryReceiptPrint() },
                        colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                    ) {
                        Text("Retry", color = Color.Black)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { viewModel.dismissReceiptWarning() }) {
                        Text("Dismiss", color = LimonTextSecondary)
                    }
                },
                containerColor = LimonSurface
            )
        }
    }

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

    LaunchedEffect(uiState.navigateToFloorPlanAfterDiscount) {
        if (uiState.navigateToFloorPlanAfterDiscount) {
            delay(500)
            onNavigateToFloorPlan()
            viewModel.clearNavigateToFloorPlanAfterDiscount()
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
                                text = { Text("Sync Data", color = LimonText) },
                                onClick = { menuExpanded = false; onSync() },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
                            )
                            if (canAccessSettings) {
                                DropdownMenuItem(
                                    text = { Text("Settings", color = LimonText) },
                                    onClick = { menuExpanded = false; onNavigateToSettings() },
                                    leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
                                )
                            }
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
                val hasDiscount = (ow.order.discountPercent > 0.0) || (ow.order.discountAmount > 0.0)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = LimonSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Order Summary", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp)
                        Spacer(Modifier.height(12.dp))
                        Column(
                            modifier = Modifier
                                .heightIn(max = 200.dp)
                                .verticalScroll(rememberScrollState())
                        ) {
                            ow.items.forEach { item ->
                                PaymentOrderItemRow(item)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        if (hasDiscount) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Discount:", color = LimonTextSecondary, fontSize = 14.sp)
                                Text("-${CurrencyUtils.format(ow.order.discountAmount + (ow.order.subtotal + ow.order.taxAmount) * (ow.order.discountPercent / 100.0))}", color = LimonPrimary, fontSize = 14.sp)
                            }
                            Spacer(Modifier.height(4.dp))
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Total:", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp)
                            Text(CurrencyUtils.format(ow.order.total), fontWeight = FontWeight.Bold, color = LimonPrimary, fontSize = 18.sp)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = LimonSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Discount", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 14.sp)
                        Spacer(Modifier.height(8.dp))
                        if (uiState.discountRequestPending) {
                            Text("Discount approval pending. Sync to get updated total after web approval.", color = LimonTextSecondary, fontSize = 12.sp)
                            Spacer(Modifier.height(8.dp))
                            OutlinedButton(onClick = { viewModel.refreshOrderFromApi() }, modifier = Modifier.fillMaxWidth()) {
                                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Sync / Update")
                            }
                        } else if (!hasDiscount) {
                            Button(
                                onClick = { viewModel.showDiscountRequestDialog() },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                            ) {
                                Text("Send discount request", color = Color.Black)
                            }
                        } else {
                            Text("Discount applied.", color = LimonSuccess, fontSize = 12.sp)
                        }
                    }
                }
                if (uiState.discountRequestLoading) {
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = LimonPrimary)
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
                    LaunchedEffect(uiState.paymentMode, uiState.splits.size) {
                        if (uiState.paymentMode == "split" && uiState.splits.isEmpty()) {
                            viewModel.ensureOneSplitRow()
                        }
                    }
                    uiState.splits.firstOrNull()?.let { split ->
                        val otherSplitsTotal = uiState.completedPaymentsTotal
                        SplitRow(
                            split = split,
                            orderTotal = ow.order.total,
                            otherSplitsTotal = otherSplitsTotal,
                            isFirstSplit = uiState.completedPayments.isEmpty(),
                            onUpdate = { amt, method, received, change ->
                                viewModel.updateSplit(split.id, amt, method, received, change)
                            },
                            onRemove = { },
                            onPay = { viewModel.paySplit(split.id) },
                            showRemove = false
                        )
                    }
                    if (uiState.completedPayments.isNotEmpty()) {
                        Spacer(Modifier.height(16.dp))
                        Text("Previous payments", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 14.sp)
                        Spacer(Modifier.height(8.dp))
                        uiState.completedPayments.forEach { payment ->
                            CompletedPaymentRow(
                                payment = payment,
                                onCancel = { viewModel.cancelPayment(payment.id) }
                            )
                            Spacer(Modifier.height(4.dp))
                        }
                    }
                }
                Spacer(Modifier.height(24.dp))
                val totalPaid = if (uiState.paymentMode == "split") uiState.completedPaymentsTotal else uiState.splits.sumOf { it.amount }
                val remainder = ow.order.total - totalPaid
                // Split ilk seçenekte (henüz ödeme yokken) Balance kartı gösterme; direkt ödeme alınsın
                val showBalanceCard = uiState.paymentMode != "split" || uiState.completedPayments.isNotEmpty()
                if (showBalanceCard) {
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
        if (uiState.showDiscountRequestDialog) {
            DiscountRequestDialog(
                onDismiss = { viewModel.dismissDiscountRequestDialog() },
                onSubmit = { pct, amt, note -> viewModel.requestDiscount(pct, amt, note) }
            )
        }
    }
}

@Composable
private fun DiscountRequestDialog(
    onDismiss: () -> Unit,
    onSubmit: (percent: Double?, amount: Double?, note: String) -> Unit
) {
    var percentText by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var noteText by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Discount request", fontWeight = FontWeight.Bold, color = LimonText) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("An authorized user will enter percent or amount on web. Send the request.", color = LimonTextSecondary, fontSize = 12.sp)
                OutlinedTextField(
                    value = percentText,
                    onValueChange = { if (it.isEmpty() || it.all { c -> c.isDigit() || c == '.' }) percentText = it },
                    label = { Text("Requested discount % (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)
                )
                OutlinedTextField(
                    value = amountText,
                    onValueChange = { if (it.isEmpty() || it.all { c -> c.isDigit() || c == '.' }) amountText = it },
                    label = { Text("Requested discount amount AED (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)
                )
                OutlinedTextField(
                    value = noteText,
                    onValueChange = { noteText = it },
                    label = { Text("Notes (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = false
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val pct = percentText.toDoubleOrNull()?.coerceIn(0.0, 100.0)
                    val amt = amountText.toDoubleOrNull()?.coerceAtLeast(0.0)
                    if (pct != null || amt != null) onSubmit(pct, amt, noteText.trim())
                },
                colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
            ) { Text("Send", color = Color.Black) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
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

@Composable
private fun CompletedPaymentRow(
    payment: PaymentEntity,
    onCancel: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface.copy(alpha = 0.7f)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = payment.method.uppercase(),
                    fontWeight = FontWeight.Bold,
                    color = LimonPrimary,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(end = 12.dp)
                )
                Text(CurrencyUtils.format(payment.amount), color = LimonText, fontSize = 14.sp)
            }
            TextButton(onClick = onCancel) {
                Text("Cancel", color = LimonError, fontSize = 14.sp)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SplitRow(
    split: PaymentSplit,
    orderTotal: Double,
    otherSplitsTotal: Double = 0.0,
    isFirstSplit: Boolean = false,
    onUpdate: (amount: Double, method: String, received: Double, change: Double) -> Unit,
    onRemove: () -> Unit,
    onPay: () -> Unit = {},
    showRemove: Boolean = true
) {
    val balanceAmount = (orderTotal - otherSplitsTotal).coerceAtLeast(0.0)
    // First split: no Balance button, amount stays empty (user types). Second+: Balance button, amount fills only when Balance pressed.
    var amountStr by remember(split.id) {
        mutableStateOf(if (split.amount > 0) "%.2f".format(split.amount) else "")
    }
    var method by remember(split.id) { mutableStateOf(split.method) }
    val methodSelected = method == "cash" || method == "card"
    val showBalanceButton = methodSelected && !isFirstSplit

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
                if (!methodSelected) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        FilterChip(
                            selected = method == "cash",
                            onClick = {
                                method = "cash"
                                // İkinci/üçüncü split: amount otomatik gelmesin, sadece Balance butonuna basınca dolsun
                                val amt = if (amountStr.isBlank()) 0.0 else amountStr.toDoubleOrNull() ?: 0.0
                                if (isFirstSplit && amt > 0) amountStr = "%.2f".format(amt)
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
                                // İkinci/üçüncü split: amount otomatik gelmesin, sadece Balance butonuna basınca dolsun
                                val amt = if (amountStr.isBlank()) 0.0 else amountStr.toDoubleOrNull() ?: 0.0
                                if (isFirstSplit && amt > 0) amountStr = "%.2f".format(amt)
                                onUpdate(amt, "card", 0.0, 0.0)
                            },
                            label = { Text("Card", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = if (method == "card") Color.Black else LimonText) },
                            modifier = Modifier.weight(1f).heightIn(min = 56.dp),
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LimonPrimary, containerColor = LimonSurface, selectedLabelColor = Color.Black, labelColor = LimonText)
                        )
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            FilterChip(
                                selected = true,
                                onClick = { },
                                label = { Text(if (method == "cash") "Cash" else "Card", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color.Black) },
                                modifier = Modifier.heightIn(min = 52.dp),
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = LimonPrimary, containerColor = LimonSurface, selectedLabelColor = Color.Black, labelColor = LimonText)
                            )
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
                                    val received = if (method == "cash") v else 0.0
                                    onUpdate(v, method, received, 0.0)
                                },
                                label = { Text("Amount") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier
                                    .weight(1f)
                                    .widthIn(min = 140.dp)
                                    .heightIn(min = 56.dp),
                                textStyle = LocalTextStyle.current.copy(fontSize = 18.sp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = LimonText,
                                    unfocusedTextColor = LimonText,
                                    focusedBorderColor = LimonPrimary,
                                    unfocusedBorderColor = LimonTextSecondary
                                )
                            )
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (showBalanceButton) {
                                Button(
                                    onClick = {
                                        amountStr = "%.2f".format(balanceAmount)
                                        val received = if (method == "cash") balanceAmount else 0.0
                                        onUpdate(balanceAmount, method, received, 0.0)
                                    },
                                    modifier = Modifier.heightIn(min = 48.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                                ) {
                                    Text("Balance", color = Color.Black, fontWeight = FontWeight.Bold)
                                }
                            }
                            Button(
                                onClick = onPay,
                                modifier = Modifier.heightIn(min = 48.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = LimonSuccess)
                            ) {
                                Text("Pay", color = Color.Black, fontWeight = FontWeight.Bold)
                            }
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
