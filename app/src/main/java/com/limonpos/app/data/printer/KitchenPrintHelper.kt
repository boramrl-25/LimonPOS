package com.limonpos.app.data.printer

import com.limonpos.app.data.local.entity.OrderItemEntity
import com.limonpos.app.data.local.entity.PrinterEntity
import com.limonpos.app.data.repository.OrderRepository
import com.limonpos.app.data.repository.PrinterRepository
import com.limonpos.app.data.prefs.PrinterPreferences
import com.limonpos.app.data.repository.ProductRepository
import com.limonpos.app.service.PrinterService
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class KitchenPrintHelper @Inject constructor(
    private val orderRepository: OrderRepository,
    private val printerRepository: PrinterRepository,
    private val productRepository: ProductRepository,
    private val printerService: PrinterService,
    private val printerPreferences: PrinterPreferences
) {
    suspend fun sendToKitchen(orderId: String): KitchenPrintResult {
        val ow = orderRepository.getOrderWithItems(orderId).first() ?: return KitchenPrintResult.Failure(
            message = "Order not found",
            orderId = orderId,
            tableId = "",
            tableNumber = "",
            pendingItemIds = emptyList()
        )
        val pendingItems = ow.items.filter { it.status == "pending" }
        if (pendingItems.isEmpty()) {
            return KitchenPrintResult.Success
        }
        val allKitchenPrinters = printerRepository.getAllPrinters().first().filter { p ->
            p.printerType == "kitchen" && p.ipAddress.isNotBlank()
        }
        val pendingItemIds = pendingItems.map { it.id }
        if (allKitchenPrinters.isEmpty()) {
            orderRepository.markItemsAsSent(ow.order.id, pendingItemIds)
            return KitchenPrintResult.Failure(
                message = "No kitchen printer configured",
                orderId = orderId,
                tableId = ow.order.tableId,
                tableNumber = ow.order.tableNumber,
                pendingItemIds = pendingItemIds
            )
        }
        orderRepository.markItemsAsSent(ow.order.id, pendingItemIds)

        val itemsByPrinter = groupItemsByEffectivePrinter(pendingItems, allKitchenPrinters)
        val itemSize = printerPreferences.getReceiptItemSize()
        var allSucceeded = true
        val failed = mutableListOf<String>()
        for ((printer, items) in itemsByPrinter) {
            if (items.isEmpty()) continue
            val ticket = printerService.buildKitchenTicket(ow.order, items, printer.name, itemSize)
            val result = printerService.sendToPrinter(printer.ipAddress, printer.port, ticket)
            if (result.isFailure) {
                failed.add(printer.name)
                allSucceeded = false
            }
        }
        return if (allSucceeded) {
            KitchenPrintResult.Success
        } else {
            KitchenPrintResult.Failure(
                message = "Print failed: ${failed.joinToString(", ")}. Tap Retry to send again.",
                orderId = ow.order.id,
                tableId = ow.order.tableId,
                tableNumber = ow.order.tableNumber,
                pendingItemIds = pendingItemIds
            )
        }
    }

    /** Print items that are already marked as sent (e.g. after ViewModel marked them for instant UI update). Used to avoid blocking UI on network/print. */
    suspend fun printItemsAlreadyMarkedSent(orderId: String, itemIds: List<String>): KitchenPrintResult {
        if (itemIds.isEmpty()) return KitchenPrintResult.Success
        val ow = orderRepository.getOrderWithItems(orderId).first() ?: return KitchenPrintResult.Failure(
            message = "Order not found",
            orderId = orderId,
            tableId = "",
            tableNumber = "",
            pendingItemIds = itemIds
        )
        val itemsToPrint = ow.items.filter { it.id in itemIds }
        if (itemsToPrint.isEmpty()) return KitchenPrintResult.Success
        val allKitchenPrinters = printerRepository.getAllPrinters().first().filter { p ->
            p.printerType == "kitchen" && p.ipAddress.isNotBlank()
        }
        if (allKitchenPrinters.isEmpty()) {
            return KitchenPrintResult.Failure(
                message = "No kitchen printer configured",
                orderId = ow.order.id,
                tableId = ow.order.tableId,
                tableNumber = ow.order.tableNumber,
                pendingItemIds = itemIds
            )
        }
        val itemsByPrinter = groupItemsByEffectivePrinter(itemsToPrint, allKitchenPrinters)
        val itemSize = printerPreferences.getReceiptItemSize()
        var allSucceeded = true
        val failed = mutableListOf<String>()
        for ((printer, items) in itemsByPrinter) {
            if (items.isEmpty()) continue
            val ticket = printerService.buildKitchenTicket(ow.order, items, printer.name, itemSize)
            val result = printerService.sendToPrinter(printer.ipAddress, printer.port, ticket)
            if (result.isFailure) {
                failed.add(printer.name)
                allSucceeded = false
            }
        }
        return if (allSucceeded) {
            KitchenPrintResult.Success
        } else {
            KitchenPrintResult.Failure(
                message = "Print failed: ${failed.joinToString(", ")}. Tap Retry to send again.",
                orderId = ow.order.id,
                tableId = ow.order.tableId,
                tableNumber = ow.order.tableNumber,
                pendingItemIds = itemIds
            )
        }
    }

    /** Retry print for items that failed. Items are already marked as sent (in KDS). */
    suspend fun retryPrint(orderId: String, itemIds: List<String>): KitchenPrintResult {
        if (itemIds.isEmpty()) return KitchenPrintResult.Success
        val ow = orderRepository.getOrderWithItems(orderId).first() ?: return KitchenPrintResult.Failure(
            message = "Order not found",
            orderId = orderId,
            tableId = "",
            tableNumber = "",
            pendingItemIds = itemIds
        )
        val itemsToPrint = ow.items.filter { it.id in itemIds }
        if (itemsToPrint.isEmpty()) return KitchenPrintResult.Success
        val allKitchenPrinters = printerRepository.getAllPrinters().first().filter { p ->
            p.printerType == "kitchen" && p.ipAddress.isNotBlank()
        }
        if (allKitchenPrinters.isEmpty()) {
            return KitchenPrintResult.Failure(
                message = "No kitchen printer configured",
                orderId = orderId,
                tableId = ow.order.tableId,
                tableNumber = ow.order.tableNumber,
                pendingItemIds = itemIds
            )
        }
        val itemsByPrinter = groupItemsByEffectivePrinter(itemsToPrint, allKitchenPrinters)
        val itemSize = printerPreferences.getReceiptItemSize()
        var allSucceeded = true
        val failed = mutableListOf<String>()
        for ((printer, items) in itemsByPrinter) {
            if (items.isEmpty()) continue
            val ticket = printerService.buildKitchenTicket(ow.order, items, printer.name, itemSize)
            val result = printerService.sendToPrinter(printer.ipAddress, printer.port, ticket)
            if (result.isFailure) {
                failed.add(printer.name)
                allSucceeded = false
            }
        }
        return if (allSucceeded) {
            KitchenPrintResult.Success
        } else {
            KitchenPrintResult.Failure(
                message = "Print failed: ${failed.joinToString(", ")}. Tap Retry to send again.",
                orderId = ow.order.id,
                tableId = ow.order.tableId,
                tableNumber = ow.order.tableNumber,
                pendingItemIds = itemIds
            )
        }
    }

    /**
     * Groups items by effective printer. If product has printers defined, use product printers (ignore category).
     * Otherwise use category printers. If neither has printers, send to all kitchen printers.
     */
    private suspend fun groupItemsByEffectivePrinter(
        items: List<OrderItemEntity>,
        allKitchenPrinters: List<PrinterEntity>
    ): Map<PrinterEntity, List<OrderItemEntity>> {
        val printerById = allKitchenPrinters.associateBy { it.id }
        val result = mutableMapOf<PrinterEntity, MutableList<OrderItemEntity>>()
        for (item in items) {
            val product = productRepository.getProductById(item.productId)
            val effectivePrinterIds = when {
                product == null -> emptyList()
                else -> {
                    val productPrinters = printerService.parsePrinterIds(product.printers)
                    if (productPrinters.isNotEmpty()) {
                        productPrinters
                    } else {
                        val category = productRepository.getCategoryById(product.categoryId)
                        category?.let { printerService.parsePrinterIds(it.printers) } ?: emptyList()
                    }
                }
            }
            val targetPrinters = if (effectivePrinterIds.isEmpty()) {
                allKitchenPrinters
            } else {
                effectivePrinterIds.mapNotNull { printerById[it] }
            }
            for (printer in targetPrinters) {
                result.getOrPut(printer) { mutableListOf() }.add(item)
            }
        }
        return result
    }
}
