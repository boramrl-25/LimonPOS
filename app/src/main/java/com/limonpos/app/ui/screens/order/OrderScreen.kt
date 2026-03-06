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
import androidx.compose.material.icons.filled.Check
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
import kotlinx.coroutines.flow.StateFlow
import com.limonpos.app.util.CurrencyUtils
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
    onNavigateToTable: (String) -> Unit = {},
    onNavigateToPayment: (String) -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()
    val navigateToFloorPlanRequest by viewModel.navigateToFloorPlanRequest.collectAsState()
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

    LaunchedEffect(navigateToFloorPlanRequest) {
        if (navigateToFloorPlanRequest > 0) {
            viewModel.consumeNavigateToFloorPlanRequest()
            viewModel.dismissCart()
            onNavigateToFloorPlan()
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
                                "Order - ${uiState.table?.name ?: "Table"}",
                                fontWeight = FontWeight.Bold,
                                color = LimonText,
                                fontSize = 18.sp
                            )
                            uiState.orderWithItems?.order?.id?.takeLast(6)?.uppercase()?.let { shortId ->
                                Text(
                                    text = "Ticket ID: $shortId",
                                    color = LimonTextSecondary,
                                    fontSize = 12.sp
                                )
                            }
                        }
                        if (uiState.table != null && uiState.table?.status != "free") {
                            IconButton(
                                onClick = { viewModel.openTransferTable() },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(
                                    Icons.Default.SwapHoriz,
                                    contentDescription = "Transfer Table",
                                    tint = LimonPrimary,
                                    modifier = Modifier.size(20.dp)
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
                            DropdownMenuItem(
                                text = { Text("Settings", color = LimonText) },
                                onClick = { menuExpanded = false; onNavigateToSettings() },
                                leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
                            )
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
        snackbarHost = { SnackbarHost(snackbarHostState) }
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
                            "Recall edilmiş fis - Sepette tek ürün iade veya tüm fisi iade edebilirsiniz. Ödeme değişikliği için Payment.",
                            color = LimonPrimary,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
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
                                Text("İptal", color = LimonTextSecondary)
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
                uiState.printerWarning?.let { warning ->
                    if (warning.contains("Print failed")) {
                        Row(
                            modifier = Modifier.padding(top = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(warning, color = LimonError, fontSize = 12.sp, modifier = Modifier.weight(1f))
                            TextButton(onClick = { viewModel.sendToKitchen() }) {
                                Text("Retry", color = LimonPrimary, fontSize = 12.sp)
                            }
                            TextButton(onClick = { viewModel.dismissPrinterWarningAndMarkAsSent() }) {
                                Text("Dismiss", color = LimonTextSecondary, fontSize = 12.sp)
                            }
                        }
                    }
                }
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
            while (true) {
                tg.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 400)
                delay(1500)
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
            onRetrySendToKitchen = { viewModel.sendToKitchen() },
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
            onAddWithModifiers = { opts, notes -> viewModel.addToCart(product, opts, notes) },
            onAddWithoutModifiers = { viewModel.addToCart(product, emptyList(), "") }
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
        AlertDialog(
            onDismissRequest = { showCloseTableConfirm = false; viewModel.clearCloseTableError() },
            title = { Text("Close Table", color = LimonText) },
            text = { Text("Items will be discarded. Continue?", color = LimonTextSecondary) },
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
            occupiedTables = viewModel.occupiedTables,
            freeTables = viewModel.freeTables,
            currentTable = uiState.table,
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
    occupiedTables: StateFlow<List<TableEntity>>,
    freeTables: StateFlow<List<TableEntity>>,
    currentTable: TableEntity?,
    onDismiss: () -> Unit,
    onTransfer: (sourceId: String, targetId: String) -> Unit
) {
    val occupied by occupiedTables.collectAsState(emptyList())
    val free by freeTables.collectAsState(emptyList())
    var selectedSource by remember(currentTable) { mutableStateOf<TableEntity?>(currentTable) }
    var selectedTarget by remember { mutableStateOf<TableEntity?>(null) }
    LaunchedEffect(currentTable) { if (currentTable != null) selectedSource = currentTable }

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
                printerWarning?.let { warning ->
                    if (warning.contains("Print failed")) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(warning, color = LimonError, fontSize = 12.sp, modifier = Modifier.weight(1f))
                            TextButton(onClick = onRetrySendToKitchen) { Text("Retry", color = LimonPrimary) }
                            TextButton(onClick = onDismissPrinterWarning) { Text("Dismiss", color = LimonTextSecondary) }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
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
                    printerWarning?.let { warning ->
                        if (!warning.contains("Print failed")) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(warning, color = LimonError, fontSize = 12.sp)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }
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
    onAddWithModifiers: (List<ModifierOptionEntity>, String) -> Unit,
    onAddWithoutModifiers: () -> Unit
) {
    var groups by remember { mutableStateOf<List<ModifierGroupWithOptions>>(emptyList()) }
    var selectedOptions by remember { mutableStateOf<Set<String>>(emptySet()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(product) {
        loading = true
        groups = getModifierGroups()
        selectedOptions = emptySet()
        loading = false
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${product.name} - Select Modifier", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                if (loading) {
                    Text("Yükleniyor...", color = LimonTextSecondary)
                } else if (groups.isEmpty()) {
                    Text("Modifier grubu bulunamadı. Sync yapıp tekrar deneyin.", color = LimonTextSecondary, fontSize = 14.sp)
                }
                groups.forEach { gwo ->
                    Text(gwo.group.name, fontWeight = FontWeight.Medium, color = LimonText)
                    gwo.options.forEach { opt ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = opt.id in selectedOptions,
                                onCheckedChange = { checked ->
                                    val set = selectedOptions.toMutableSet()
                                    if (checked) {
                                        if (gwo.group.maxSelect == 1) set.removeAll(gwo.options.map { it.id })
                                        set.add(opt.id)
                                    } else set.remove(opt.id)
                                    selectedOptions = set
                                }
                            )
                            Text(
                                "${opt.name} (+${CurrencyUtils.format(opt.price)})",
                                color = LimonText,
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable {
                                        val set = selectedOptions.toMutableSet()
                                        if (opt.id in set) set.remove(opt.id)
                                        else if (gwo.group.maxSelect == 1) {
                                            set.removeAll(gwo.options.map { it.id })
                                            set.add(opt.id)
                                        } else set.add(opt.id)
                                        selectedOptions = set
                                    }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onAddWithoutModifiers) { Text("Add without modifiers") }
                Button(
                    onClick = {
                        val opts = groups.flatMap { it.options }.filter { it.id in selectedOptions }
                        onAddWithModifiers(opts, "")
                    }
                ) { Text("Add") }
            }
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
            Text("Ürünler henüz masaya gelmedi", fontWeight = FontWeight.Bold, color = LimonError)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("10 dakikadan fazla süredir mutfakta olup masaya gelmeyen ürünler:", color = LimonTextSecondary, fontSize = 13.sp)
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
                                Text("Masa ${block.tableNumber}", fontWeight = FontWeight.Bold, color = LimonPrimary, fontSize = 15.sp)
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
                Text("Tamam", color = Color.Black)
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
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        item(key = "all") {
            FilterChip(
                selected = selectedCategoryId == "all",
                onClick = { onSelectCategory("all") },
                label = { Text("Tümü", fontSize = 15.sp) },
                modifier = Modifier.heightIn(min = 44.dp),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = LimonPrimary,
                    selectedLabelColor = Color.Black,
                    containerColor = LimonSurface,
                    labelColor = LimonText
                )
            )
        }
        items(categoriesWithProducts, key = { it.first.id }) { (category, _) ->
            FilterChip(
                selected = selectedCategoryId == category.id,
                onClick = { onSelectCategory(category.id) },
                label = { Text(category.name, fontSize = 15.sp) },
                modifier = Modifier.heightIn(min = 44.dp),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = try { Color(android.graphics.Color.parseColor(category.color)) } catch (_: Exception) { LimonPrimary },
                    selectedLabelColor = Color.Black,
                    containerColor = LimonSurface,
                    labelColor = LimonText
                )
            )
        }
    }
}

private sealed class OrderProductRow {
    data class CategoryHeader(val category: com.limonpos.app.data.local.entity.CategoryEntity) : OrderProductRow()
    data class ProductRow(val product: ProductEntity) : OrderProductRow()
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
                filtered.forEach { add(OrderProductRow.ProductRow(it)) }
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
                is OrderProductRow.ProductRow -> "p_${r.product.id}"
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
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onProductClick(r.product) },
                        color = LimonSurface,
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            r.product.name,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                            color = LimonText,
                            fontSize = 16.sp
                        )
                    }
                }
            }
        }
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
    var clickEnabled by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(0.8f)
            .clickable(enabled = clickEnabled) {
                if (clickEnabled) {
                    clickEnabled = false
                    onClick()
                    scope.launch {
                        delay(800L)
                        clickEnabled = true
                    }
                }
            },
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
