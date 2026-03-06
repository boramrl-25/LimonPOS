package com.limonpos.app.ui.screens.order

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.limonpos.app.data.local.dao.ModifierGroupDao
import com.limonpos.app.data.local.dao.ModifierOptionDao
import com.limonpos.app.data.local.entity.CategoryEntity
import com.limonpos.app.data.local.entity.ModifierGroupEntity
import com.limonpos.app.data.local.entity.ModifierOptionEntity
import com.limonpos.app.data.local.entity.OrderItemEntity
import com.limonpos.app.data.local.entity.ProductEntity
import com.limonpos.app.data.local.entity.TableEntity
import com.limonpos.app.data.printer.KitchenPrintHelper
import com.limonpos.app.data.printer.KitchenPrintResult
import com.limonpos.app.data.printer.PrinterWarningHolder
import com.limonpos.app.data.printer.PrinterWarningState
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.VoidRequestRepository
import com.limonpos.app.data.repository.OrderWithItems
import com.limonpos.app.data.repository.OverdueUndelivered
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.data.repository.ProductRepository
import com.limonpos.app.data.repository.TableRepository
import com.limonpos.app.di.ApplicationScope
import com.limonpos.app.service.PrinterService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import android.util.Log
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import javax.inject.Inject

private const val TAG = "OrderViewModel"

data class OrderUiState(
    val voidRequestSent: Boolean = false,
    val addToCartError: String? = null,
    val table: TableEntity? = null,
    val orderWithItems: OrderWithItems? = null,
    val categories: List<CategoryEntity> = emptyList(),
    /** Categories with their products for order screen (products under each category). */
    val categoriesWithProducts: List<Pair<CategoryEntity, List<ProductEntity>>> = emptyList(),
    val products: List<ProductEntity> = emptyList(),
    val selectedCategoryId: String = "all",
    val searchQuery: String = "",
    val showCart: Boolean = false,
    val printerWarning: String? = null,
    val closeTableError: String? = null,
    val voidError: String? = null,
    /** After one successful post-void PIN check, allow multiple voids without re-entering PIN. */
    val postVoidAuthorized: Boolean = false,
    val syncInProgress: Boolean = false
)

data class ModifierGroupWithOptions(
    val group: ModifierGroupEntity,
    val options: List<ModifierOptionEntity>
)

@HiltViewModel
class OrderViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val apiSyncRepository: ApiSyncRepository,
    private val tableRepository: TableRepository,
    private val orderRepository: OrderRepository,
    private val productRepository: ProductRepository,
    private val printerRepository: PrinterRepository,
    private val printerService: PrinterService,
    private val kitchenPrintHelper: KitchenPrintHelper,
    private val printerWarningHolder: PrinterWarningHolder,
    @ApplicationScope private val applicationScope: kotlinx.coroutines.CoroutineScope,
    private val authRepository: AuthRepository,
    private val voidRequestRepository: VoidRequestRepository,
    private val modifierGroupDao: ModifierGroupDao,
    private val modifierOptionDao: ModifierOptionDao
) : ViewModel() {

    private val tableId: String = checkNotNull(savedStateHandle["tableId"]) { "tableId required" }
    private val gson = Gson()

    private val _orderId = MutableStateFlow<String?>(null)
    private val _uiState = MutableStateFlow(OrderUiState())
    val uiState: StateFlow<OrderUiState> = _uiState.asStateFlow()

    private val _productToAddWithModifiers = MutableStateFlow<ProductEntity?>(null)
    val productToAddWithModifiers: StateFlow<ProductEntity?> = _productToAddWithModifiers.asStateFlow()

    private val _overdueWarning = MutableStateFlow<List<OverdueUndelivered>?>(null)
    val overdueWarning: StateFlow<List<OverdueUndelivered>?> = _overdueWarning.asStateFlow()

    val hasPrinterWarningForTable: StateFlow<Boolean> = printerWarningHolder.state
        .map { it != null && it.tableId == tableId }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    /** Payment blocked until printer warning is dismissed for this table. */
    val canTakePayment: StateFlow<Boolean> = combine(
        _uiState.map { it.orderWithItems?.order?.status == "sent" },
        printerWarningHolder.state
    ) { orderSent, printerWarning ->
        val hasBlockingWarning = printerWarning != null && printerWarning.tableId == tableId
        orderSent && !hasBlockingWarning
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    init {
        loadTable()
        refreshOrderId()
        loadCategoriesWithProducts()
        startOverdueCheckLoop()
        viewModelScope.launch {
            if (apiSyncRepository.isOnline()) {
                _uiState.update { it.copy(syncInProgress = true) }
                apiSyncRepository.syncFromApi()
                loadCategoriesWithProducts()
                _uiState.update { it.copy(syncInProgress = false) }
                if (_uiState.value.categoriesWithProducts.isEmpty()) {
                    delay(2000)
                    apiSyncRepository.syncFromApi()
                    loadCategoriesWithProducts()
                }
            }
        }
        viewModelScope.launch {
            while (true) {
                delay(10000)
                if (_uiState.value.categoriesWithProducts.isEmpty() && apiSyncRepository.isOnline()) {
                    apiSyncRepository.syncFromApi()
                    loadCategoriesWithProducts()
                }
            }
        }
        viewModelScope.launch {
            try {
                _orderId.flatMapLatest { id ->
                    if (id != null) orderRepository.getOrderWithItems(id) else flowOf(null)
                }.collect { ow ->
                    _uiState.update { it.copy(orderWithItems = ow) }
                    clearOptimisticDeliveredIfInOrder(ow)
                    val recalled = try {
                        ow?.let { orderRepository.isOrderRecalled(it.order.id) } ?: false
                    } catch (_: Exception) {
                        false
                    }
                    _isRecalledOrder.value = recalled
                    if (recalled && ow != null && ow.items.isNotEmpty()) {
                        _uiState.update { it.copy(showCart = true) }
                    }
                }
            } catch (_: Exception) { }
        }
        loadCategories()
        viewModelScope.launch {
            while (true) {
                delay(3000)
                refreshOrderId()
            }
        }
        viewModelScope.launch {
            printerWarningHolder.state.collect { w ->
                _uiState.update {
                    it.copy(printerWarning = if (w != null && w.tableId == tableId) w.message else null)
                }
            }
        }
    }

    private fun loadTable() {
        viewModelScope.launch {
            try {
                val table = tableRepository.getTableById(tableId)
                _uiState.update { it.copy(table = table) }
            } catch (_: Exception) { }
        }
    }

    private fun refreshOrderId() {
        viewModelScope.launch {
            try {
                val order = withContext(Dispatchers.IO) {
                    orderRepository.getActiveOrderByTable(tableId)
                }
                if (order != null) {
                    _orderId.value = order.id
                    val ow = withContext(Dispatchers.IO) {
                        orderRepository.getOrderWithItems(order.id).first()
                    }
                    _uiState.update { it.copy(orderWithItems = ow) }
                    clearOptimisticDeliveredIfInOrder(ow)
                    val recalled = withContext(Dispatchers.IO) {
                        orderRepository.isOrderRecalled(order.id)
                    }
                    _isRecalledOrder.value = recalled
                    if (recalled && ow != null && ow.items.isNotEmpty()) {
                        _uiState.update { it.copy(showCart = true) }
                    }
                } else {
                    _orderId.value = null
                    _uiState.update { it.copy(orderWithItems = null) }
                    _isRecalledOrder.value = false
                }
            } catch (_: Exception) { }
        }
    }

    private fun loadCategories() {
        viewModelScope.launch {
            try {
                productRepository.getActiveCategories().collect { cats ->
                    val list = cats.filter { it.id != "all" }
                    _uiState.update { it.copy(categories = list) }
                }
            } catch (_: Exception) { }
        }
    }

    private fun loadCategoriesWithProducts() {
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) {
                    productRepository.getCategoriesWithProductsForOrder()
                }
                _uiState.update { it.copy(categoriesWithProducts = list) }
                loadCategories()
            } catch (_: Exception) {
                _uiState.update { it.copy(categoriesWithProducts = emptyList()) }
            }
        }
    }

    private fun loadProducts(categoryId: String) {
        viewModelScope.launch {
            try {
                val products = productRepository.getProductsForOrderOnce(categoryId)
                _uiState.update { it.copy(products = products) }
            } catch (_: Exception) {
                _uiState.update { it.copy(products = emptyList()) }
            }
        }
    }

    /** Sync from API (web data) and reload so web changes appear in app. */
    private fun syncAndReloadProducts() {
        viewModelScope.launch {
            if (apiSyncRepository.isOnline()) {
                _uiState.update { it.copy(syncInProgress = true) }
                try {
                    apiSyncRepository.syncCatalog()
                    loadCategoriesWithProducts()
                } finally {
                    _uiState.update { it.copy(syncInProgress = false) }
                }
            }
        }
    }

    fun refreshProductsFromApi() {
        syncAndReloadProducts()
    }

    fun selectCategory(categoryId: String) {
        _uiState.update { it.copy(selectedCategoryId = categoryId) }
        loadProducts(categoryId)
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun showCart() { _uiState.update { it.copy(showCart = true) } }
    fun dismissCart() { _uiState.update { it.copy(showCart = false) } }

    private val _navigateToFloorPlanRequest = MutableStateFlow(0)
    val navigateToFloorPlanRequest: StateFlow<Int> = _navigateToFloorPlanRequest.asStateFlow()

    private val _productToAddWithNotes = MutableStateFlow<ProductEntity?>(null)
    val productToAddWithNotes: StateFlow<ProductEntity?> = _productToAddWithNotes.asStateFlow()

    private val _itemToEditNote = MutableStateFlow<OrderItemEntity?>(null)
    val itemToEditNote: StateFlow<OrderItemEntity?> = _itemToEditNote.asStateFlow()

    private val _itemToVoid = MutableStateFlow<OrderItemEntity?>(null)
    val itemToVoid: StateFlow<OrderItemEntity?> = _itemToVoid.asStateFlow()

    private val _isRecalledOrder = MutableStateFlow(false)
    val isRecalledOrder: StateFlow<Boolean> = _isRecalledOrder.asStateFlow()

    private val _itemToRefund = MutableStateFlow<OrderItemEntity?>(null)
    val itemToRefund: StateFlow<OrderItemEntity?> = _itemToRefund.asStateFlow()

    private val _showRefundFullConfirm = MutableStateFlow(false)
    val showRefundFullConfirm: StateFlow<Boolean> = _showRefundFullConfirm.asStateFlow()

    /** addToCart debounce: aynı ürün (id+fiyat+not) kısa sürede tekrar eklenirse sadece 1 kez işlenir (2x/4x tetiklenmeyi önler). */
    private var lastAddToCartKey: String? = null
    private var lastAddToCartTimeMs: Long = 0L
    private val addToCartDebounceMs = 500L

    fun addProduct(product: ProductEntity) {
        val groupIds = parseModifierGroupIds(product.modifierGroups)
        if (groupIds.isNotEmpty()) {
            _productToAddWithModifiers.value = product
            return
        }
        addToCart(product, emptyList(), "")
    }

    fun dismissModifierDialog() {
        _productToAddWithModifiers.value = null
    }

    fun dismissNotesDialog() {
        _productToAddWithNotes.value = null
    }

    private val addToCartMutex = Mutex()

    fun addToCart(
        product: ProductEntity,
        selectedOptions: List<ModifierOptionEntity>,
        notes: String,
        quantity: Int = 1
    ) {
        viewModelScope.launch {
            val modifierPrice = selectedOptions.sumOf { it.price }
            val totalPrice = product.price + modifierPrice
            val key = "${product.id}|$totalPrice|$notes|$quantity"
            val now = System.currentTimeMillis()
            if (key == lastAddToCartKey && (now - lastAddToCartTimeMs) < addToCartDebounceMs) return@launch
            lastAddToCartKey = key
            lastAddToCartTimeMs = now

            dismissModifierDialog()
            dismissNotesDialog()
            _uiState.update { it.copy(addToCartError = null) }
            try {
                var orderId = withContext(Dispatchers.IO) {
                    orderRepository.getActiveOrderByTable(tableId)?.id
                }
                if (orderId == null) {
                    val userId = authRepository.getCurrentUserIdSync()
                    if (userId == null) {
                        Log.w(TAG, "addToCart: User not logged in, cannot create order")
                        _uiState.update { it.copy(addToCartError = "Giriş yapılmamış. Lütfen giriş yapın.") }
                        return@launch
                    }
                    val userName = authRepository.getCurrentUserNameSync() ?: "Waiter"
                    val order = withContext(Dispatchers.IO) {
                        orderRepository.createOrder(tableId, 1, userId, userName)
                    }
                    withContext(Dispatchers.IO) {
                        tableRepository.occupyTable(tableId, order.id, 1, userId, userName)
                    }
                    _orderId.value = order.id
                    orderId = order.id
                } else {
                    _orderId.value = orderId
                }
                val finalOrderId = orderId ?: return@launch
                val safeQuantity = quantity.coerceAtLeast(1)
                val modifierNames = selectedOptions.joinToString(", ") { it.name }
                val productName = if (modifierNames.isNotEmpty()) "${product.name} ($modifierNames)" else product.name
                withContext(Dispatchers.IO) {
                    addToCartMutex.withLock {
                        val existing = orderRepository.getOrderWithItems(finalOrderId).first()
                            ?.items
                            ?.firstOrNull {
                                it.status == "pending" &&
                                    it.productId == product.id &&
                                    it.price == totalPrice &&
                                    it.notes == notes
                            }
                        if (existing != null) {
                            orderRepository.updateItemQuantityAndNotes(
                                itemId = existing.id,
                                quantity = existing.quantity + safeQuantity,
                                notes = existing.notes
                            )
                        } else {
                            orderRepository.addItem(
                                orderId = finalOrderId,
                                productId = product.id,
                                productName = productName,
                                price = totalPrice,
                                quantity = safeQuantity,
                                notes = notes
                            )
                        }
                    }
                }
                val updated = withContext(Dispatchers.IO) {
                    orderRepository.getOrderWithItems(finalOrderId).first()
                }
                _uiState.update { it.copy(orderWithItems = updated) }
            } catch (e: Exception) {
                Log.e(TAG, "addToCart failed", e)
                _uiState.update { it.copy(addToCartError = e.message ?: "Ürün eklenemedi") }
            }
        }
    }

    fun clearAddToCartError() {
        _uiState.update { it.copy(addToCartError = null) }
    }

    suspend fun getModifierGroupsForProduct(product: ProductEntity): List<ModifierGroupWithOptions> {
        val groupIds: List<String> = parseModifierGroupIds(product.modifierGroups)
        if (groupIds.isEmpty()) return emptyList()
        val groups = groupIds.mapNotNull { modifierGroupDao.getModifierGroupById(it) }
        return groups.map { group ->
            val options = modifierOptionDao.getOptionsByGroupId(group.id).first()
            ModifierGroupWithOptions(group, options)
        }
    }

    private fun parseModifierGroupIds(json: String): List<String> {
        return try {
            val arr = gson.fromJson(json, Array<String>::class.java)
            arr?.toList()?.filter { it.isNotEmpty() } ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun sendToKitchen() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            _uiState.update { it.copy(printerWarning = null) }
            val pendingItems = ow.items.filter { it.status == "pending" }
            val orderId = ow.order.id
            val tableId = ow.order.tableId
            val tableNumber = ow.order.tableNumber
            val pendingItemIds = pendingItems.map { it.id }

            if (pendingItems.isEmpty()) {
                printerWarningHolder.setWarning(PrinterWarningState("Table $tableNumber: All items already sent to kitchen", orderId, tableId, emptyList()))
                return@launch
            }
            val printers = printerRepository.getAllPrinters().first().filter { p ->
                p.printerType == "kitchen" && p.ipAddress.isNotBlank()
            }
            if (printers.isEmpty()) {
                printerWarningHolder.setWarning(PrinterWarningState("Table $tableNumber: No kitchen printer configured", orderId, tableId, pendingItemIds))
                return@launch
            }

            // Mark as sent immediately so UI updates instantly (cart shows "sent"); then navigate to floor
            orderRepository.markItemsAsSent(orderId, pendingItemIds)
            val updated = withContext(Dispatchers.IO) {
                orderRepository.getOrderWithItems(orderId).first()
            }
            if (updated != null) {
                _uiState.update { it.copy(orderWithItems = updated) }
            }
            _navigateToFloorPlanRequest.value = _navigateToFloorPlanRequest.value + 1

            // In background: push to API, then print (no need to mark again)
            applicationScope.launch {
                if (apiSyncRepository.isOnline()) {
                    apiSyncRepository.ensureOrderAndSendToKitchen(orderId)
                }
                when (val result = kitchenPrintHelper.printItemsAlreadyMarkedSent(orderId, pendingItemIds)) {
                    is KitchenPrintResult.Success -> {
                        if (apiSyncRepository.isOnline()) apiSyncRepository.syncFromApi()
                    }
                    is KitchenPrintResult.Failure -> {
                        val msg = if (result.tableNumber.isNotBlank()) "Table ${result.tableNumber}: ${result.message}" else result.message
                        printerWarningHolder.setWarning(PrinterWarningState(msg, result.orderId, result.tableId, result.pendingItemIds))
                    }
                }
            }
        }
    }

    fun clearPrinterWarning() {
        _uiState.update { it.copy(printerWarning = null) }
    }

    fun dismissPrinterWarningAndMarkAsSent() {
        viewModelScope.launch {
            val ow = _uiState.value.orderWithItems ?: return@launch
            val pendingItems = ow.items.filter { it.status == "pending" }
            if (pendingItems.isNotEmpty()) {
                orderRepository.markItemsAsSent(ow.order.id, pendingItems.map { it.id })
            }
            _uiState.update { it.copy(printerWarning = null) }
        }
    }

    private fun startOverdueCheckLoop() {
        viewModelScope.launch {
            apiSyncRepository.clearOverdueMinutesCache() // ilk döngüde web’deki 1 dk ayarı hemen kullanılsın
            while (true) {
                val minutes = apiSyncRepository.getOverdueUndeliveredMinutes()
                val list = orderRepository.getOverdueUndelivered(minutes)
                if (list.isNotEmpty()) _overdueWarning.value = list
                delay(30 * 1000L) // 30 sn: 1 dk uyarı çalışsın, API/DB yükü makul kalsın
            }
        }
    }

    private val _optimisticallyDeliveredIds = mutableStateOf(emptySet<String>())
    val optimisticallyDeliveredIds: State<Set<String>> get() = _optimisticallyDeliveredIds

    fun markItemDelivered(itemId: String) {
        _optimisticallyDeliveredIds.value = _optimisticallyDeliveredIds.value + itemId
        viewModelScope.launch {
            orderRepository.markItemDelivered(itemId)
            // Do not remove from optimistic set here – Room flow may not have emitted yet.
            // Cleanup happens when orderWithItems flow emits (see collect block).
        }
    }

    /** Call when orderWithItems is updated from DB so we can clear optimistic ids that are now delivered. */
    private fun clearOptimisticDeliveredIfInOrder(ow: OrderWithItems?) {
        if (ow == null) return
        val deliveredIds = ow.items.filter { it.deliveredAt != null }.map { it.id }.toSet()
        if (deliveredIds.isEmpty()) return
        _optimisticallyDeliveredIds.value = _optimisticallyDeliveredIds.value - deliveredIds
    }

    fun dismissOverdueWarning() {
        _overdueWarning.value = null
    }

    fun consumeNavigateToFloorPlanRequest() {
        _navigateToFloorPlanRequest.value = 0
    }

    fun showEditNoteForItem(item: OrderItemEntity) {
        _itemToEditNote.value = item
    }

    fun dismissEditNoteDialog() {
        _itemToEditNote.value = null
    }

    fun updateItemNote(itemId: String, notes: String) {
        viewModelScope.launch {
            orderRepository.updateItemNotes(itemId, notes)
            _itemToEditNote.value = null
        }
    }

    fun updateItemNoteAndQuantity(itemId: String, notes: String, quantity: Int) {
        viewModelScope.launch {
            val safeQty = quantity.coerceAtLeast(1)
            orderRepository.updateItemQuantityAndNotes(itemId, safeQty, notes)
            _itemToEditNote.value = null
        }
    }

    fun removeItem(itemId: String) {
        viewModelScope.launch {
            val orderId = _uiState.value.orderWithItems?.order?.id ?: return@launch
            orderRepository.removeItem(itemId)
            val updated = withContext(Dispatchers.IO) {
                orderRepository.getOrderWithItems(orderId).first()
            }
            if (updated != null) {
                _uiState.update { it.copy(orderWithItems = updated) }
            }
        }
    }

    fun showVoidConfirm(item: OrderItemEntity) {
        val state = _uiState.value
        // If PIN was already verified once for this session, void immediately without showing PIN dialog again.
        if (state.postVoidAuthorized) {
            _itemToVoid.value = item
            confirmVoidItem("")
        } else {
            _itemToVoid.value = item
        }
    }

    fun showRefundConfirm(item: OrderItemEntity) {
        _itemToRefund.value = item
    }

    fun dismissRefundConfirm() {
        _itemToRefund.value = null
    }

    fun confirmRefundItem() {
        val item = _itemToRefund.value ?: return
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: ""
            if (orderRepository.refundItem(item.id, userId, userName)) {
                _itemToRefund.value = null
            } else {
                _uiState.update { it.copy(addToCartError = "Önce Closed Bills'dan fisi recall edin.") }
            }
        }
    }

    fun showRefundFullConfirm() {
        _showRefundFullConfirm.value = true
    }

    fun dismissRefundFullConfirm() {
        _showRefundFullConfirm.value = false
    }

    fun confirmRefundFull() {
        val ow = _uiState.value.orderWithItems ?: return
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: ""
            if (orderRepository.refundFullOrder(ow.order.id, userId, userName)) {
                _showRefundFullConfirm.value = false
                dismissCart()
                _navigateToFloorPlanRequest.value = _navigateToFloorPlanRequest.value + 1
            } else {
                _showRefundFullConfirm.value = false
                _uiState.update { it.copy(addToCartError = "Önce Closed Bills'dan fisi recall edin.") }
            }
        }
    }

    fun dismissVoidConfirm() {
        _itemToVoid.value = null
        _uiState.update { it.copy(voidError = null) }
    }

    fun confirmVoidItem(pin: String) {
        val item = _itemToVoid.value ?: return
        val ow = _uiState.value.orderWithItems ?: return
        val orderId = ow.order.id
        viewModelScope.launch {
            _uiState.update { it.copy(voidError = null) }
            val currentState = _uiState.value
            if (!currentState.postVoidAuthorized) {
                val verifyResult = authRepository.verifyPostVoidPin(pin)
                verifyResult.onFailure { e ->
                    _uiState.update { state -> state.copy(voidError = e.message ?: "Invalid PIN") }
                    return@launch
                }
                _uiState.update { it.copy(postVoidAuthorized = true) }
            }
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val nameForPrinter = authRepository.getCurrentUserNameSync() ?: ""
            if (!orderRepository.voidItem(item.id, userId, nameForPrinter)) return@launch
            _itemToVoid.value = null
            _uiState.update { it.copy(voidError = null) }
            val updated = withContext(Dispatchers.IO) {
                orderRepository.getOrderWithItems(orderId).first()
            }
            if (updated != null) {
                _uiState.update { it.copy(orderWithItems = updated) }
            }
            applicationScope.launch(Dispatchers.IO) {
                val voidSlip = printerService.buildVoidSlip(
                    order = ow.order,
                    productName = item.productName,
                    quantity = item.quantity,
                    price = item.price,
                    userName = nameForPrinter
                )
                val kitchenPrinters = printerRepository.getAllPrinters().first()
                    .filter { it.printerType == "kitchen" && it.ipAddress.isNotBlank() }
                for (printer in kitchenPrinters) {
                    printerService.sendToPrinter(printer.ipAddress, printer.port, voidSlip)
                }
            }
        }
    }

    fun clearVoidError() {
        _uiState.update { it.copy(voidError = null) }
    }

    fun clearVoidRequestSent() {
        _uiState.update { it.copy(voidRequestSent = false) }
    }

    /** Request approval from supervisor/KDS instead of PIN. Creates VoidRequestEntity and closes dialog. */
    fun requestVoidApproval() {
        val item = _itemToVoid.value ?: return
        val ow = _uiState.value.orderWithItems ?: return
        viewModelScope.launch {
            val userId = authRepository.getCurrentUserIdSync() ?: return@launch
            val userName = authRepository.getCurrentUserNameSync() ?: ""
            voidRequestRepository.createRequest(
                orderId = ow.order.id,
                orderItemId = item.id,
                productName = item.productName,
                quantity = item.quantity,
                price = item.price,
                tableNumber = ow.order.tableNumber,
                requestedByUserId = userId,
                requestedByUserName = userName
            )
            _itemToVoid.value = null
            _uiState.update { it.copy(voidError = null, voidRequestSent = true) }
        }
    }

    fun closeTableIfEmpty() {
        viewModelScope.launch {
            orderRepository.closeTableIfOrderEmpty(tableId)
        }
    }

    fun closeTableManually() {
        viewModelScope.launch {
            val blockReason = withContext(Dispatchers.IO) {
                orderRepository.getCloseTableBlockReason(tableId)
            }
            if (blockReason != null) {
                _uiState.update { it.copy(closeTableError = blockReason) }
                return@launch
            }
            _uiState.update { it.copy(closeTableError = null) }
            doCloseTable()
        }
    }

    private suspend fun doCloseTable() {
        withContext(Dispatchers.IO) {
            orderRepository.closeTableManually(tableId)
            if (apiSyncRepository.isOnline()) apiSyncRepository.pushCloseTable(tableId)
        }
        _navigateToFloorPlanRequest.value = _navigateToFloorPlanRequest.value + 1
    }

    fun clearCloseTableError() {
        _uiState.update { it.copy(closeTableError = null) }
    }

    private val _occupiedTables = MutableStateFlow<List<TableEntity>>(emptyList())
    val occupiedTables: StateFlow<List<TableEntity>> = _occupiedTables.asStateFlow()

    private val _freeTables = MutableStateFlow<List<TableEntity>>(emptyList())
    val freeTables: StateFlow<List<TableEntity>> = _freeTables.asStateFlow()

    private val _showTransferTableDialog = MutableStateFlow(false)
    val showTransferTableDialog: StateFlow<Boolean> = _showTransferTableDialog.asStateFlow()

    fun openTransferTable() {
        viewModelScope.launch {
            val table = _uiState.value.table ?: return@launch
            if (table.status == "free") return@launch
            _occupiedTables.value = tableRepository.getOccupiedTables()
            _freeTables.value = tableRepository.getAllTables().first().filter { it.status == "free" }
            _showTransferTableDialog.value = true
        }
    }

    fun closeTransferTableDialog() {
        _showTransferTableDialog.value = false
    }

    fun transferTable(sourceTableId: String, targetTableId: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            val mid = authRepository.getCurrentUserIdSync() ?: return@launch
            val mname = authRepository.getCurrentUserNameSync() ?: "Manager"
            tableRepository.transferTable(sourceTableId, targetTableId, mid, mname)
                .onSuccess {
                    closeTransferTableDialog()
                    onSuccess()
                }
                .onFailure { /* ignore */ }
        }
    }
}
