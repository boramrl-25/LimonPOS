package com.limonpos.app.ui.screens.order

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.ModifierOptionEntity
import com.limonpos.app.data.local.entity.OrderItemEntity
import com.limonpos.app.data.local.entity.ProductEntity
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.ui.theme.*
import com.limonpos.app.ui.components.PrinterWarningDialog
import kotlinx.coroutines.flow.StateFlow
import com.limonpos.app.util.CurrencyUtils
import com.limonpos.app.data.repository.ReservationStatusHelper
import com.limonpos.app.data.repository.OverdueUndelivered
import android.media.AudioManager
import android.media.ToneGenerator
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun OrderScreen(
    viewModel: OrderViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onLogout: () -> Unit = {},
    onNavigateToTable: (String) -> Unit = {},
    onNavigateToPayment: (String) -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    canAccessSettings: Boolean = true,
    onSync: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()
    val navigateToFloorPlanRequest by viewModel.navigateToFloorPlanRequest.collectAsState()
    val logoutAfterSendToKitchenRequest by viewModel.logoutAfterSendToKitchenRequest.collectAsState()
    val isRecalled by viewModel.isRecalledOrder.collectAsState(initial = false)
    val overdueWarning by viewModel.overdueWarning.collectAsState(initial = null)
    var showCloseTableConfirm by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.voidRequestSent) {
        if (uiState.voidRequestSent) {
            snackbarHostState.showSnackbar("Request sent. Waiting for supervisor and KDS approval.")
            viewModel.clearVoidRequestSent()
        }
    }

    LaunchedEffect(uiState.addToCartError) {
        uiState.addToCartError?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearAddToCartError()
        }
    }

    LaunchedEffect(uiState.syncError) {
        uiState.syncError?.let { msg ->
            snackbarHostState.showSnackbar(msg, duration = SnackbarDuration.Long)
            viewModel.clearSyncError()
        }
    }

    LaunchedEffect(navigateToFloorPlanRequest) {
        if (navigateToFloorPlanRequest > 0) {
            viewModel.consumeNavigateToFloorPlanRequest()
            viewModel.dismissCart()
            onNavigateToFloorPlan()
        }
    }

    LaunchedEffect(logoutAfterSendToKitchenRequest) {
        if (logoutAfterSendToKitchenRequest > 0) {
            viewModel.consumeLogoutAfterSendToKitchenRequest()
            viewModel.dismissCart()
            onLogout()
        }
    }

    val handleBack = {
        onBack()
    }
    BackHandler(onBack = handleBack)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "T${uiState.table?.number ?: "-"}",
                                fontWeight = FontWeight.Bold,
                                color = LimonText,
                                fontSize = 18.sp
                            )
                            uiState.orderWithItems?.order?.id?.takeLast(6)?.uppercase()?.let { shortId ->
                                Text(
                                    shortId,
                                    color = LimonTextSecondary,
                                    fontSize = 12.sp
                                )
                            }
                        }
                        if (uiState.table != null && uiState.table?.status != "free") {
                            IconButton(
                                onClick = { viewModel.openTransferTable() },
                                modifier = Modifier.size(44.dp)
                            ) {
                                Icon(
                                    Icons.Default.SwapHoriz,
                                    contentDescription = "Transfer Table",
                                    tint = LimonPrimary,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = handleBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Floor Plan", tint = LimonPrimary)
                    }
                    Button(
                        onClick = { if (!uiState.syncInProgress) viewModel.refreshProductsFromApi() },
                        enabled = !uiState.syncInProgress,
                        colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        modifier = Modifier.height(36.dp)
                    ) {
                        if (uiState.syncInProgress) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = Color.Black
                            )
                            Spacer(Modifier.width(6.dp))
                        } else {
                            Icon(Icons.Default.Refresh, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                        }
                        Text("Sync", color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                    var menuExpanded by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { menuExpanded = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Menu", tint = LimonPrimary)
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            if (canAccessSettings) {
                                DropdownMenuItem(
                                    text = { Text("Settings", color = LimonText) },
                                    onClick = { menuExpanded = false; onNavigateToSettings() },
                                    leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
                                )
                            }
                        }
                    }
                    val itemCount = (uiState.orderWithItems?.items?.size ?: 0)
                    IconButton(onClick = { viewModel.showCart() }) {
                        BadgedBox(
                            badge = {
                                if (itemCount > 0) {
                                    Badge { Text("$itemCount", color = LimonText) }
                                }
                            }
                        ) {
                            Icon(Icons.Default.ShoppingCart, contentDescription = "Cart", tint = LimonPrimary)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = LimonSurface,
                    titleContentColor = LimonText
                )
            )
        },
        snackbarHost = {
            SnackbarHost(snackbarHostState) { data ->
                Snackbar(
                    snackbarData = data,
                    containerColor = LimonSurface,
                    contentColor = LimonText
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(12.dp)
        ) {
                if (isRecalled) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = LimonPrimary.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            "Recalled bill — Return single item or full bill from cart. Use Payment for payment changes.",
                            color = LimonPrimary,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }
                uiState.table?.let { table ->
                    if (ReservationStatusHelper.isReservationUpcoming(table, System.currentTimeMillis(), 30)) {
                        val fromStr = table.reservationFrom?.let { ts ->
                            java.text.SimpleDateFormat("HH:mm", java.util.Locale.US).format(java.util.Date(ts))
                        } ?: ""
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = LimonError.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                "Upcoming reservation at $fromStr${table.reservationGuestName?.takeIf { it.isNotBlank() }?.let { " – $it" }.orEmpty()}",
                                color = LimonError,
                                fontSize = 13.sp,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
                uiState.closeTableError?.let { err ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = LimonError.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(8.dp)
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
                    Spacer(modifier = Modifier.height(8.dp))
                }
                OutlinedTextField(
                    value = uiState.searchQuery,
                    onValueChange = { viewModel.setSearchQuery(it) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Search products...", color = LimonTextSecondary) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = LimonPrimary) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = LimonText,
                        unfocusedTextColor = LimonText,
                        focusedBorderColor = LimonPrimary,
                        unfocusedBorderColor = LimonTextSecondary,
                        cursorColor = LimonPrimary,
                        focusedLeadingIconColor = LimonPrimary
                    )
                )
                Spacer(modifier = Modifier.height(8.dp))
                CategoryChipsRow(
                    categoriesWithProducts = uiState.categoriesWithProducts,
                    selectedCategoryId = uiState.selectedCategoryId,
                    onSelectCategory = { viewModel.selectCategory(it) }
                )
                Spacer(modifier = Modifier.height(8.dp))
                val query = uiState.searchQuery.trim().lowercase()
                ProductsByCategoryList(
                    categoriesWithProducts = if (uiState.selectedCategoryId == "all") uiState.categoriesWithProducts
                        else uiState.categoriesWithProducts.filter { it.first.id == uiState.selectedCategoryId },
                    searchQuery = query,
                    onProductClick = { viewModel.addProduct(it) }
                )
        }
    }
    overdueWarning?.let { list ->
        OverdueUndeliveredDialog(
            overdueList = list,
            onDismiss = { viewModel.dismissOverdueWarning() },
            onGoToTable = { tableId ->
                viewModel.dismissOverdueWarning()
                onNavigateToTable(tableId)
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
    val optimisticallyDeliveredIds by viewModel.optimisticallyDeliveredIds
    if (uiState.showCart) {
        CartBottomSheet(
            orderWithItems = uiState.orderWithItems,
            optimisticallyDeliveredIds = optimisticallyDeliveredIds,
            onDismiss = { viewModel.dismissCart() },
            onItemClick = { item ->
                if (item.status != "pending" && item.deliveredAt == null) {
                    viewModel.markItemDelivered(item.id)
                }
            },
            onEditNote = { item ->
                viewModel.showEditNoteForItem(item)
            },
            onRemoveItem = { viewModel.removeItem(it.id) },
            onVoidItem = { viewModel.showVoidConfirm(it) },
            onRefundItem = { viewModel.showRefundConfirm(it) },
            onRefundFull = if (isRecalled) { { viewModel.showRefundFullConfirm() } } else null,
            isRecalledOrder = isRecalled,
            onSendToKitchen = { viewModel.sendToKitchen() },
            onRetrySendToKitchen = { viewModel.retryKitchenPrint() },
            onDismissPrinterWarning = { viewModel.dismissPrinterWarningAndMarkAsSent() },
            onPayment = {
                viewModel.dismissCart()
                uiState.table?.id?.let { onNavigateToPayment(it) }
            },
            canTakePayment = viewModel.canTakePayment.collectAsState(false).value,
            hasPrinterWarning = viewModel.hasPrinterWarningForTable.collectAsState(false).value,
            printerWarning = uiState.printerWarning
        )
    }
    uiState.printerWarning?.let { warning ->
        PrinterWarningDialog(
            message = warning,
            onRetry = { viewModel.retryKitchenPrint() },
            onDismiss = { viewModel.dismissPrinterWarningAndMarkAsSent() },
            dismissLabel = "Kapat"
        )
    }
    viewModel.itemToRefund.collectAsState(null).value?.let { item ->
        AlertDialog(
            onDismissRequest = { viewModel.dismissRefundConfirm() },
            title = { Text("Refund Item", fontWeight = FontWeight.Bold, color = LimonText) },
            text = {
                Text("Refund ${item.quantity}x ${item.productName}? This will remove from order and record as refund.", color = LimonTextSecondary)
            },
            confirmButton = {
                Button(
                    onClick = { viewModel.confirmRefundItem() },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) {
                    Text("Refund", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissRefundConfirm() }) {
                    Text("Cancel", color = LimonTextSecondary)
                }
            },
            containerColor = LimonSurface
        )
    }
    if (viewModel.showRefundFullConfirm.collectAsState(false).value) {
        val ow = uiState.orderWithItems
        AlertDialog(
            onDismissRequest = { viewModel.dismissRefundFullConfirm() },
            title = { Text("Refund Full Bill", fontWeight = FontWeight.Bold, color = LimonText) },
            text = {
                Text(
                    "Refund entire bill (${ow?.order?.total?.let { "%.2f".format(it) } ?: "0"} AED)? All items will be removed and table will be closed.",
                    color = LimonTextSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = { viewModel.confirmRefundFull() },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) {
                    Text("Refund Full Bill", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissRefundFullConfirm() }) {
                    Text("Cancel", color = LimonTextSecondary)
                }
            },
            containerColor = LimonSurface
        )
    }
    viewModel.itemToVoid.collectAsState(null).value?.let { item ->
        var pin by remember { mutableStateOf("") }
        val uiStateVoid by viewModel.uiState.collectAsState()
        LaunchedEffect(item) { pin = ""; viewModel.clearVoidError() }
        AlertDialog(
            onDismissRequest = { viewModel.dismissVoidConfirm(); viewModel.clearVoidError() },
            title = { Text("Void Item (Post-Void)", fontWeight = FontWeight.Bold, color = LimonText) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Void ${item.quantity}x ${item.productName}? This item was sent to kitchen.", color = LimonTextSecondary)
                    if (!uiStateVoid.postVoidAuthorized) {
                        Text("Option 1: Enter authorized PIN (admin/manager or post_void permission):", color = LimonTextSecondary, fontSize = 12.sp)
                        OutlinedTextField(
                            value = pin,
                            onValueChange = { if (it.length <= 4 && it.all { c -> c.isDigit() }) pin = it },
                            label = { Text("PIN (4 digits)") },
                            modifier = Modifier.fillMaxWidth(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            isError = uiStateVoid.voidError != null
                        )
                    } else {
                        Text(
                            "PIN already verified. You can void multiple items without entering PIN again.",
                            color = LimonTextSecondary,
                            fontSize = 12.sp
                        )
                    }
                    uiStateVoid.voidError?.let { err ->
                        Text(err, color = LimonError, fontSize = 12.sp)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Option 2: Request approval - both Supervisor and KDS (2 people) must approve:", color = LimonTextSecondary, fontSize = 12.sp)
                    Button(
                        onClick = { viewModel.requestVoidApproval() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                    ) {
                        Text("Request Approval", color = Color.White)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { viewModel.confirmVoidItem(pin) },
                    enabled = uiStateVoid.postVoidAuthorized || pin.length == 4,
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) {
                    Text("Void with PIN", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissVoidConfirm(); viewModel.clearVoidError() }) {
                    Text("Cancel", color = LimonTextSecondary)
                }
            },
            containerColor = LimonSurface
        )
    }
    viewModel.itemToEditNote.collectAsState(null).value?.let { item ->
        EditItemNoteDialog(
            item = item,
            onDismiss = { viewModel.dismissEditNoteDialog() },
            onSave = { notes, quantity -> viewModel.updateItemNoteAndQuantity(item.id, notes, quantity) },
            onRemoveNote = { viewModel.updateItemNote(item.id, "") }
        )
    }

    viewModel.productToAddWithModifiers.collectAsState(null).value?.let { product ->
        AddProductModifiersDialog(
            product = product,
            getModifierGroups = { viewModel.getModifierGroupsForProduct(product) },
            onDismiss = { viewModel.dismissModifierDialog() },
            onAddWithModifiers = { selections, notes -> viewModel.addToCart(product, selections, notes) }
        )
    }
    viewModel.productToAddWithNotes.collectAsState(null).value?.let { product ->
        AddProductNotesDialog(
            product = product,
            onDismiss = { viewModel.dismissNotesDialog() },
            onAdd = { notes -> viewModel.addToCart(product, emptyList(), notes) }
        )
    }

    if (showCloseTableConfirm) {
        val table = uiState.table
        val willReturnToReserved = table != null && ReservationStatusHelper.shouldReturnToReservedAfterClose(table, System.currentTimeMillis())
        AlertDialog(
            onDismissRequest = { showCloseTableConfirm = false; viewModel.clearCloseTableError() },
            title = { Text("Close Table", color = LimonText) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Items will be discarded. Continue?", color = LimonTextSecondary)
                    if (willReturnToReserved) {
                        Text("Table will remain reserved for the upcoming reservation.", color = com.limonpos.app.ui.theme.LimonInfo, fontSize = 13.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showCloseTableConfirm = false
                        viewModel.closeTableManually()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White, modifier = Modifier.size(24.dp))
                }
            },
            dismissButton = { TextButton(onClick = { showCloseTableConfirm = false }) { Text("Cancel", color = LimonTextSecondary) } },
            containerColor = LimonSurface
        )
    }

    val showTransferTable by viewModel.showTransferTableDialog.collectAsState()
    if (showTransferTable) {
        OrderTransferTableDialog(
            sourceTable = uiState.table,
            freeTables = viewModel.freeTables,
            onDismiss = { viewModel.closeTransferTableDialog() },
            onTransfer = { src, tgt ->
                viewModel.transferTable(src, tgt) {
                    onBack()
                }
            }
        )
    }
}

@Composable
private fun OrderTransferTableDialog(
    sourceTable: TableEntity?,
    freeTables: StateFlow<List<TableEntity>>,
    onDismiss: () -> Unit,
    onTransfer: (sourceId: String, targetId: String) -> Unit
) {
    val free by freeTables.collectAsState(emptyList())
    var selectedTarget by remember { mutableStateOf<TableEntity?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Transfer Table", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text("From (this table):", fontWeight = FontWeight.Medium, color = LimonText)
                sourceTable?.let { t ->
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CartBottomSheet(
    orderWithItems: com.limonpos.app.data.repository.OrderWithItems?,
    optimisticallyDeliveredIds: Set<String> = emptySet(),
    onDismiss: () -> Unit,
    onItemClick: (OrderItemEntity) -> Unit,
    onEditNote: (OrderItemEntity) -> Unit,
    onRemoveItem: (OrderItemEntity) -> Unit,
    onVoidItem: (OrderItemEntity) -> Unit,
    onRefundItem: (OrderItemEntity) -> Unit,
    onRefundFull: (() -> Unit)? = null,
    isRecalledOrder: Boolean = false,
    onSendToKitchen: () -> Unit,
    onRetrySendToKitchen: () -> Unit,
    onDismissPrinterWarning: () -> Unit,
    onPayment: () -> Unit,
    canTakePayment: Boolean,
    hasPrinterWarning: Boolean = false,
    printerWarning: String? = null
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = LimonSurface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Cart", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 20.sp)
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = LimonText)
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                if (orderWithItems == null || orderWithItems.items.isEmpty()) {
                    Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        Text("Cart is empty", color = LimonTextSecondary)
                    }
                } else {
                    val sentItems = orderWithItems.items.filter { it.status != "pending" }
                    val newItems = orderWithItems.items.filter { it.status == "pending" }
                    LazyColumn(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        if (sentItems.isNotEmpty()) {
                            item {
                                Text(
                                    "Sent to kitchen",
                                    color = LimonTextSecondary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(vertical = 4.dp)
                                )
                            }
                            items(sentItems, key = { it.id }) { item ->
                                OrderItemRow(
                                    item = item,
                                    isSent = true,
                                    isDelivered = item.deliveredAt != null || item.id in optimisticallyDeliveredIds,
                                    onClick = { onItemClick(item) },
                                    onRemove = null,
                                    onVoid = if (isRecalledOrder) null else { { onVoidItem(item) } },
                                    onRefund = if (isRecalledOrder) { { onRefundItem(item) } } else null,
                                    onNote = { onEditNote(item) }
                                )
                            }
                        }
                        if (newItems.isNotEmpty()) {
                            item {
                                Text("New items", color = LimonText, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(vertical = 4.dp))
                            }
                            items(newItems, key = { it.id }) { item ->
                                OrderItemRow(
                                    item = item,
                                    isSent = false,
                                    onClick = null,
                                    onRemove = { onRemoveItem(item) },
                                    onNote = { onEditNote(item) }
                                )
                            }
                        }
                        item {
                            OutlinedButton(
                                onClick = onDismiss,
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonPrimary)
                            ) {
                                Text("Add More", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Total: ${CurrencyUtils.format(orderWithItems.order.total)}", fontWeight = FontWeight.Bold, color = LimonPrimary, fontSize = 18.sp)
                    if (onRefundFull != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = { onRefundFull?.invoke() },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonError)
                        ) {
                            Text("Refund Full Bill", color = LimonError)
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    val hasPendingItems = newItems.isNotEmpty()
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            onClick = onSendToKitchen,
                            modifier = Modifier.weight(1f),
                            enabled = hasPendingItems,
                            colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary, disabledContainerColor = LimonTextSecondary.copy(alpha = 0.5f))
                        ) {
                            Icon(Icons.Default.Send, contentDescription = null, Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Send to Kitchen", color = Color.Black)
                        }
                        Button(
                            onClick = onPayment,
                            modifier = Modifier.weight(1f),
                            enabled = canTakePayment,
                            colors = ButtonDefaults.buttonColors(containerColor = LimonSuccess, disabledContainerColor = LimonTextSecondary.copy(alpha = 0.5f))
                        ) {
                            Icon(Icons.Default.Payment, contentDescription = null, Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Payment", color = Color.Black)
                        }
                    }
                    if (!canTakePayment && orderWithItems != null && orderWithItems.items.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (hasPrinterWarning)
                                "Dismiss printer warning first to enable payment"
                            else "Send to kitchen first to enable payment",
                            color = LimonTextSecondary,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OrderSummary(
    orderWithItems: com.limonpos.app.data.repository.OrderWithItems?,
    onSendToKitchen: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Order Detail",
                fontWeight = FontWeight.Bold,
                color = LimonText,
                fontSize = 16.sp
            )
            Spacer(modifier = Modifier.height(12.dp))
            if (orderWithItems == null || orderWithItems.items.isEmpty()) {
                Text(
                    "No items added yet",
                    color = LimonTextSecondary,
                    fontSize = 14.sp
                )
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f, fill = false)
                ) {
                    items(orderWithItems.items, key = { it.id }) { item ->
                        OrderItemRow(item = item, isSent = item.status != "pending", isDelivered = item.deliveredAt != null)
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    "Total: ${CurrencyUtils.format(orderWithItems.order.total)}",
                    fontWeight = FontWeight.Bold,
                    color = LimonPrimary,
                    fontSize = 16.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = onSendToKitchen,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary, disabledContainerColor = LimonTextSecondary.copy(alpha = 0.5f)),
                    enabled = orderWithItems.items.any { it.status == "pending" }
                ) {
                    Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Send to Kitchen", color = Color.Black)
                }
            }
        }
    }
}

@Composable
private fun AddProductModifiersDialog(
    product: ProductEntity,
    getModifierGroups: suspend () -> List<ModifierGroupWithOptions>,
    onDismiss: () -> Unit,
    onAddWithModifiers: (List<Pair<ModifierOptionEntity, Int>>, String) -> Unit
) {
    var groups by remember { mutableStateOf<List<ModifierGroupWithOptions>>(emptyList()) }
    var selectedOptions by remember { mutableStateOf<Set<String>>(emptySet()) }
    var optionQuantities by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(product) {
        loading = true
        groups = getModifierGroups()
        selectedOptions = emptySet()
        optionQuantities = emptyMap()
        loading = false
    }

    fun updateQty(optId: String, delta: Int) {
        val current = optionQuantities[optId] ?: 0
        optionQuantities = optionQuantities + (optId to (current + delta).coerceIn(0, 99))
    }

    fun setQty(optId: String, v: Int) {
        optionQuantities = optionQuantities + (optId to v.coerceIn(0, 99))
    }

    fun countFreeInGroup(gwo: ModifierGroupWithOptions, ids: Set<String>) =
        gwo.options.count { it.id in ids && it.price == 0.0 }

    fun toggleOption(gwo: ModifierGroupWithOptions, optId: String) {
        val set = selectedOptions.toMutableSet()
        val opt = gwo.options.find { it.id == optId }!!
        val isPaid = opt.price > 0
        if (optId in set) {
            set.remove(optId)
            optionQuantities = optionQuantities - optId
        } else {
            if (isPaid) {
                set.add(optId)
                optionQuantities = optionQuantities + (optId to 1)
            } else {
                val countFree = countFreeInGroup(gwo, set)
                if (gwo.group.maxSelect == 1) {
                    gwo.options.filter { it.price == 0.0 }.forEach { o ->
                        set.remove(o.id)
                    }
                } else if (countFree >= gwo.group.maxSelect) {
                    return
                }
                set.add(optId)
            }
        }
        selectedOptions = set
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { },
        text = {
            Column {
                if (loading) {
                    Text("Loading...", color = LimonTextSecondary, fontSize = 16.sp)
                } else if (groups.isEmpty()) {
                    Text("Modifier group not found. Sync and try again.", color = LimonTextSecondary, fontSize = 16.sp)
                }
                groups.forEach { gwo ->
                    val minMax = if (gwo.group.minSelect == gwo.group.maxSelect) {
                        "(${gwo.group.minSelect})"
                    } else {
                        "(${gwo.group.minSelect}-${gwo.group.maxSelect})"
                    }
                    Text(
                        "${gwo.group.name} $minMax",
                        fontWeight = FontWeight.Medium,
                        color = LimonText,
                        fontSize = 18.sp
                    )
                    gwo.options.forEach { opt ->
                        val countFreeInGroup = countFreeInGroup(gwo, selectedOptions)
                        val canSelect = opt.price > 0 || opt.id in selectedOptions || countFreeInGroup < gwo.group.maxSelect
                        if (opt.price > 0) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { if (canSelect) toggleOption(gwo, opt.id) },
                                verticalAlignment = Alignment.Top
                            ) {
                                Checkbox(
                                    checked = opt.id in selectedOptions,
                                    onCheckedChange = { if (canSelect) toggleOption(gwo, opt.id) },
                                    enabled = canSelect
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        opt.name,
                                        color = LimonText,
                                        maxLines = 2,
                                        fontSize = 17.sp
                                    )
                                }
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    IconButton(onClick = { if (opt.id in selectedOptions) updateQty(opt.id, -1) }) {
                                        Icon(Icons.Default.Remove, "Azalt", tint = LimonText, modifier = Modifier.size(20.dp))
                                    }
                                    OutlinedTextField(
                                        value = if (opt.id in selectedOptions) "${optionQuantities[opt.id] ?: 1}" else "0",
                                        onValueChange = { v ->
                                            if (opt.id in selectedOptions) {
                                                if (v.isEmpty()) setQty(opt.id, 0)
                                                else v.toIntOrNull()?.let { setQty(opt.id, it) }
                                            }
                                        },
                                        modifier = Modifier.width(48.dp),
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                                    )
                                    IconButton(onClick = { if (opt.id in selectedOptions) updateQty(opt.id, 1) }) {
                                        Icon(Icons.Default.Add, "Add", tint = LimonText, modifier = Modifier.size(20.dp))
                                    }
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { if (canSelect) toggleOption(gwo, opt.id) },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = opt.id in selectedOptions,
                                    onCheckedChange = { if (canSelect) toggleOption(gwo, opt.id) },
                                    enabled = canSelect
                                )
                                Text(
                                    opt.name,
                                    color = LimonText,
                                    maxLines = 2,
                                    fontSize = 17.sp,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            val opts = groups.flatMap { it.options }.filter { it.id in selectedOptions }
            val selections = opts.map { opt ->
                opt to (if (opt.price > 0) (optionQuantities[opt.id] ?: 1).coerceAtLeast(1) else 1)
            }
            val hasValidPaidQty = selections.none { (opt, qty) -> opt.price > 0 && qty < 1 }
            val meetsMinSelect = groups.all { gwo ->
                val countFree = countFreeInGroup(gwo, selectedOptions)
                countFree >= gwo.group.minSelect
            }
            val meetsMaxSelect = groups.all { gwo ->
                val countFree = countFreeInGroup(gwo, selectedOptions)
                countFree <= gwo.group.maxSelect
            }
            Button(
                onClick = { onAddWithModifiers(selections, "") },
                enabled = selections.isNotEmpty() && hasValidPaidQty && meetsMinSelect && meetsMaxSelect
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

@Composable
private fun AddProductNotesDialog(
    product: com.limonpos.app.data.local.entity.ProductEntity,
    onDismiss: () -> Unit,
    onAdd: (String) -> Unit
) {
    var notes by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${product.name}", fontWeight = FontWeight.Bold) },
        text = {
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Special Note (optional)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false
            )
        },
        confirmButton = { Button(onClick = { onAdd(notes.trim()) }) { Text("Add") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = LimonTextSecondary) } },
        containerColor = LimonSurface
    )
}

@Composable
private fun EditItemNoteDialog(
    item: OrderItemEntity,
    onDismiss: () -> Unit,
    onSave: (String, Int) -> Unit,
    onRemoveNote: () -> Unit
) {
    var notes by remember(item.id) { mutableStateOf(item.notes) }
    var quantityText by remember(item.id) { mutableStateOf(item.quantity.toString()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${item.quantity}x ${item.productName}", fontWeight = FontWeight.Bold, color = LimonText) },
        text = {
            Column {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                ) {
                    TextButton(
                        onClick = {
                            val current = quantityText.toIntOrNull() ?: item.quantity
                            val newVal = (current - 1).coerceAtLeast(1)
                            quantityText = newVal.toString()
                        }
                    ) {
                        Text("-", fontSize = 18.sp)
                    }
                    OutlinedTextField(
                        value = quantityText,
                        onValueChange = { value ->
                            if (value.all { it.isDigit() } && value.length <= 3) {
                                quantityText = value
                            }
                        },
                        label = { Text("Qty") },
                        modifier = Modifier.width(80.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    TextButton(
                        onClick = {
                            val current = quantityText.toIntOrNull() ?: item.quantity
                            val newVal = (current + 1).coerceAtLeast(1)
                            quantityText = newVal.toString()
                        }
                    ) {
                        Text("+", fontSize = 18.sp)
                    }
                }
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Special Note") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = false
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val qty = quantityText.toIntOrNull()?.coerceAtLeast(1) ?: 1
                    onSave(notes.trim(), qty)
                }
            ) { Text("Save", color = Color.Black) }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (item.notes.isNotEmpty()) {
                    TextButton(onClick = onRemoveNote) {
                        Text("Remove note", color = LimonError)
                    }
                }
                TextButton(onClick = onDismiss) {
                    Text("Cancel", color = LimonTextSecondary)
                }
            }
        },
        containerColor = LimonSurface
    )
}

@Composable
private fun OverdueUndeliveredDialog(
    overdueList: List<OverdueUndelivered>,
    onDismiss: () -> Unit,
    onGoToTable: (tableId: String) -> Unit = {}
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Items not yet delivered to table", fontWeight = FontWeight.Bold, color = LimonError)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                overdueList.forEach { block ->
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
private fun OrderItemRow(
    item: OrderItemEntity,
    isSent: Boolean = false,
    isDelivered: Boolean = false,
    onClick: (() -> Unit)? = null,
    onRemove: (() -> Unit)? = null,
    onVoid: (() -> Unit)? = null,
    onRefund: (() -> Unit)? = null,
    onNote: (() -> Unit)? = null
) {
    val backgroundColor = when {
        isDelivered -> LimonSuccess.copy(alpha = 0.25f)
        isSent -> LimonTextSecondary.copy(alpha = 0.12f)
        else -> Color.Transparent
    }
    val textColor = when {
        isDelivered -> LimonSuccess
        isSent -> LimonTextSecondary
        else -> LimonText
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (isSent || isDelivered) Modifier.background(backgroundColor, RoundedCornerShape(8.dp)) else Modifier)
            .padding(if (isSent || isDelivered) 8.dp else 0.dp)
            .then(if (onClick != null) Modifier.clickable(indication = null, interactionSource = remember { MutableInteractionSource() }, onClick = onClick) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "${item.quantity}x ${item.productName}",
                    color = textColor,
                    fontSize = if (isSent) 15.sp else 18.sp,
                    fontWeight = FontWeight.Bold
                )
                if (isDelivered) {
                    Icon(Icons.Default.Check, contentDescription = "Delivered", tint = LimonSuccess, modifier = Modifier.size(18.dp))
                }
            }
            if (item.notes.isNotEmpty()) {
                Text(
                    "— ${item.notes}",
                    color = LimonTextSecondary,
                    fontSize = 12.sp
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                CurrencyUtils.format(item.price * item.quantity),
                color = LimonTextSecondary,
                fontSize = 14.sp
            )
            if (onNote != null) {
                TextButton(
                    onClick = onNote,
                    colors = ButtonDefaults.textButtonColors(contentColor = LimonPrimary)
                ) {
                    Text("Note", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }
            if (onRefund != null) {
                TextButton(
                    onClick = onRefund,
                    colors = ButtonDefaults.textButtonColors(contentColor = LimonError)
                ) {
                    Text("Refund", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }
            if (onVoid != null) {
                TextButton(
                    onClick = onVoid,
                    colors = ButtonDefaults.textButtonColors(contentColor = LimonError)
                ) {
                    Text("Void", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }
            if (onRefund == null && onVoid == null && onRemove != null) {
                IconButton(
                    onClick = onRemove,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Remove",
                        tint = LimonError,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategoryChipsRow(
    categoriesWithProducts: List<Pair<com.limonpos.app.data.local.entity.CategoryEntity, List<ProductEntity>>>,
    selectedCategoryId: String,
    onSelectCategory: (String) -> Unit
) {
    var categoriesMenuExpanded by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        FilterChip(
            selected = selectedCategoryId == "all",
            onClick = { onSelectCategory("all") },
            label = { Text("All", fontSize = 15.sp, maxLines = 2) },
            modifier = Modifier.heightIn(min = 44.dp),
            colors = FilterChipDefaults.filterChipColors(
                selectedContainerColor = LimonPrimary,
                selectedLabelColor = Color.Black,
                containerColor = LimonSurface,
                labelColor = LimonText
            )
        )
        Box {
            FilterChip(
                selected = selectedCategoryId != "all",
                onClick = { categoriesMenuExpanded = true },
                label = { Text("Categories", fontSize = 15.sp, maxLines = 2) },
                modifier = Modifier.heightIn(min = 44.dp),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = LimonPrimary,
                    selectedLabelColor = Color.Black,
                    containerColor = LimonSurface,
                    labelColor = LimonText
                )
            )
            DropdownMenu(
                expanded = categoriesMenuExpanded,
                onDismissRequest = { categoriesMenuExpanded = false },
                modifier = Modifier
                    .widthIn(min = 300.dp)
                    .heightIn(max = 560.dp)
            ) {
                categoriesWithProducts.forEach { (category, _) ->
                    DropdownMenuItem(
                        text = {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(16.dp)
                                        .background(
                                            try { Color(android.graphics.Color.parseColor(category.color)) } catch (_: Exception) { LimonPrimary },
                                            RoundedCornerShape(4.dp)
                                        )
                                )
                                Spacer(Modifier.width(14.dp))
                                Text(
                                    category.name,
                                    color = LimonText,
                                    fontSize = 18.sp,
                                    maxLines = 2
                                )
                            }
                        },
                        onClick = {
                            onSelectCategory(category.id)
                            categoriesMenuExpanded = false
                        }
                    )
                }
            }
        }
    }
}

private sealed class OrderProductRow {
    data class CategoryHeader(val category: com.limonpos.app.data.local.entity.CategoryEntity) : OrderProductRow()
    data class ProductRow(val product: ProductEntity, val categoryId: String) : OrderProductRow()
}

@Composable
private fun ProductsByCategoryList(
    categoriesWithProducts: List<Pair<com.limonpos.app.data.local.entity.CategoryEntity, List<ProductEntity>>>,
    searchQuery: String,
    onProductClick: (ProductEntity) -> Unit
) {
    val rows = remember(categoriesWithProducts, searchQuery) {
        buildList {
            for ((category, products) in categoriesWithProducts) {
                val filtered = if (searchQuery.isBlank()) products
                    else products.filter { it.name.lowercase().contains(searchQuery) }
                if (filtered.isEmpty()) continue
                add(OrderProductRow.CategoryHeader(category))
                filtered.forEach { add(OrderProductRow.ProductRow(it, category.id)) }
            }
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        contentPadding = PaddingValues(vertical = 8.dp)
    ) {
        items(rows.size, key = { index ->
            when (val r = rows[index]) {
                is OrderProductRow.CategoryHeader -> "cat_${r.category.id}"
                is OrderProductRow.ProductRow -> "p_${r.product.id}_${r.categoryId}"
            }
        }) { index ->
            when (val r = rows[index]) {
                is OrderProductRow.CategoryHeader -> {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = try { Color(android.graphics.Color.parseColor(r.category.color)) } catch (_: Exception) { LimonPrimary }.copy(alpha = 0.25f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            r.category.name,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            fontWeight = FontWeight.Bold,
                            color = LimonText,
                            fontSize = 16.sp
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                }
                is OrderProductRow.ProductRow -> {
                    ProductListRow(
                        product = r.product,
                        onClick = { onProductClick(r.product) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ProductListRow(
    product: ProductEntity,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        color = LimonSurface,
        shape = RoundedCornerShape(8.dp)
    ) {
        Text(
            product.name,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            color = LimonText,
            fontSize = 16.sp
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategoryChips(
    categories: List<com.limonpos.app.data.local.entity.CategoryEntity>,
    selectedCategoryId: String,
    onSelectCategory: (String) -> Unit
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.padding(bottom = 12.dp)
    ) {
        item {
            FilterChip(
                selected = selectedCategoryId == "all",
                onClick = { onSelectCategory("all") },
                label = { Text("All", fontSize = 18.sp) },
                modifier = Modifier.heightIn(min = 48.dp),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = LimonPrimary,
                    selectedLabelColor = Color.Black,
                    containerColor = LimonSurface,
                    labelColor = LimonText
                )
            )
        }
        items(categories, key = { it.id }) { cat ->
            FilterChip(
                selected = selectedCategoryId == cat.id,
                onClick = { onSelectCategory(cat.id) },
                label = { Text(cat.name, fontSize = 18.sp) },
                modifier = Modifier.heightIn(min = 48.dp),
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

@Composable
private fun ProductGrid(
    products: List<ProductEntity>,
    onProductClick: (ProductEntity) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        items(products, key = { it.id }) { product ->
            ProductCard(
                product = product,
                onClick = { onProductClick(product) }
            )
        }
    }
}

@Composable
private fun ProductCard(
    product: ProductEntity,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.8f)
            .clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = product.name,
                color = LimonText,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = CurrencyUtils.format(product.price),
                color = LimonPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}
