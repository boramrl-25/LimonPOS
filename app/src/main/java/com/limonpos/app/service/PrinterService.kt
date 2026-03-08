package com.limonpos.app.service

import com.google.gson.Gson
import com.limonpos.app.data.local.entity.OrderEntity
import com.limonpos.app.data.local.entity.OrderItemEntity
import com.limonpos.app.data.prefs.ReceiptSettingsData
import com.limonpos.app.util.ESCPOSPrinter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PrinterService @Inject constructor() {

    private val gson = Gson()

    suspend fun sendToPrinter(
        ipAddress: String,
        port: Int = 9100,
        data: ByteArray,
        timeoutMs: Long = 2200
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            withTimeout(timeoutMs) {
                val socket = Socket()
                try {
                    socket.connect(InetSocketAddress(ipAddress, port), 1000)
                    socket.soTimeout = 1000

                    // Send data
                    val output: OutputStream = socket.getOutputStream()
                    output.write(data)
                    output.flush()

                    Result.success("Print job sent to $ipAddress:$port")
                } finally {
                    socket.close()
                }
            }
        } catch (e: Exception) {
            when (e) {
                is java.net.ConnectException ->
                    Result.failure(Exception("Cannot connect to printer: $ipAddress:$port - Printer may be off"))
                is java.net.SocketTimeoutException ->
                    Result.failure(Exception("Printer did not respond: $ipAddress:$port - Timeout"))
                is java.net.UnknownHostException ->
                    Result.failure(Exception("Printer not found: $ipAddress - Check IP address"))
                else ->
                    Result.failure(Exception("Printer error: ${e.message}"))
            }
        }
    }

    fun buildKitchenTicket(
        order: OrderEntity,
        items: List<OrderItemEntity>,
        printerName: String,
        itemSize: Int = 0,
        receiptSettings: ReceiptSettingsData = ReceiptSettingsData.DEFAULT
    ): ByteArray {
        val p = ESCPOSPrinter
        val buffer = mutableListOf<Byte>()

        fun addBytes(bytes: ByteArray) = buffer.addAll(bytes.toList())
        fun addText(text: String) = buffer.addAll(text.toByteArray(Charsets.UTF_8).toList())

        addBytes(p.INIT)

        addBytes(p.ALIGN_CENTER)
        addBytes(p.DOUBLE_SIZE)
        addText("** ${receiptSettings.kitchenHeader} **\n")
        addBytes(p.NORMAL_SIZE)
        addText("$printerName\n")
        addText("================================\n")

        addBytes(p.ALIGN_LEFT)
        addBytes(p.BOLD_ON)
        addBytes(p.DOUBLE_HEIGHT)
        addText("TABLE: ${order.tableNumber}\n")
        addBytes(p.NORMAL_SIZE)
        addBytes(p.BOLD_OFF)

        addText("Waiter: ${order.waiterName.ifBlank { "N/A" }}\n")
        addText("Time: ${SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())}\n")
        addText("--------------------------------\n")

        addBytes(itemSizeEscPos(itemSize))
        addBytes(p.BOLD_ON)
        for (item in items) {
            addText("${item.quantity}x ${item.productName}\n")
            if (item.notes.isNotEmpty()) {
                addBytes(p.BOLD_OFF)
                addText("   NOTE: ${item.notes}\n")
                addBytes(p.BOLD_ON)
            }
        }
        addBytes(p.BOLD_OFF)
        addBytes(p.NORMAL_SIZE)

        addText("--------------------------------\n")
        addBytes(p.ALIGN_CENTER)
        addText("Order #${order.id.takeLast(8)}\n")
        addText("\n\n\n")
        addBytes(p.CUT)

        return buffer.toByteArray()
    }

    private fun itemSizeEscPos(size: Int): ByteArray = when (size) {
        1 -> ESCPOSPrinter.DOUBLE_HEIGHT
        2 -> ESCPOSPrinter.DOUBLE_SIZE
        else -> ESCPOSPrinter.NORMAL_SIZE
    }

    fun buildVoidSlip(
        order: OrderEntity,
        productName: String,
        quantity: Int,
        price: Double,
        userName: String
    ): ByteArray {
        val p = ESCPOSPrinter
        val buffer = mutableListOf<Byte>()
        val amount = price * quantity

        fun addBytes(bytes: ByteArray) = buffer.addAll(bytes.toList())
        fun addText(text: String) = buffer.addAll(text.toByteArray(Charsets.UTF_8).toList())

        addBytes(p.INIT)
        addBytes(p.ALIGN_CENTER)
        addBytes(p.DOUBLE_SIZE)
        addText("*** VOID ***\n")
        addBytes(p.NORMAL_SIZE)
        addText("================================\n")
        addBytes(p.ALIGN_LEFT)

        addBytes(p.BOLD_ON)
        addText("Table: ${order.tableNumber}\n")
        addText("Time: ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())}\n")
        addText("Voided by: $userName\n")
        addBytes(p.BOLD_OFF)
        addText("--------------------------------\n")

        addBytes(p.BOLD_ON)
        addText("VOIDED: ${quantity}x $productName\n")
        addText("Amount: AED ${String.format("%.2f", amount)}\n")
        addBytes(p.BOLD_OFF)
        addText("--------------------------------\n")
        addBytes(p.ALIGN_CENTER)
        addText("Do not prepare this item\n")
        addText("\n\n\n")
        addBytes(p.CUT)

        return buffer.toByteArray()
    }

    fun buildReceipt(
        order: OrderEntity,
        items: List<OrderItemEntity>,
        itemSize: Int = 0,
        receiptSettings: ReceiptSettingsData = ReceiptSettingsData.DEFAULT
    ): ByteArray {
        val p = ESCPOSPrinter
        val buffer = mutableListOf<Byte>()

        fun addBytes(bytes: ByteArray) = buffer.addAll(bytes.toList())
        fun addText(text: String) = buffer.addAll(text.toByteArray(Charsets.UTF_8).toList())

        addBytes(p.INIT)
        addBytes(p.ALIGN_CENTER)
        addBytes(p.DOUBLE_SIZE)
        if (receiptSettings.companyName.isNotBlank()) addText("${receiptSettings.companyName}\n")
        addText("** ${receiptSettings.receiptHeader} **\n")
        addBytes(p.NORMAL_SIZE)
        if (receiptSettings.companyAddress.isNotBlank()) addText("${receiptSettings.companyAddress}\n")
        addText("================================\n")
        addBytes(p.ALIGN_LEFT)

        addText("Table: ${order.tableNumber}\n")
        addText("Waiter: ${order.waiterName}\n")
        addText("Time: ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())}\n")
        addText("Order #${order.id.takeLast(8)}\n")
        addText("--------------------------------\n")

        addBytes(itemSizeEscPos(itemSize))
        addBytes(p.BOLD_ON)
        for (item in items) {
            val lineTotal = item.price * item.quantity
            addText("${item.quantity} x ${item.productName} @ AED ${String.format("%.2f", item.price)}\n")
            addText("  AED ${String.format("%.2f", lineTotal)}\n")
            if (item.notes.isNotEmpty()) {
                addBytes(p.BOLD_OFF)
                addText("  Note: ${item.notes}\n")
                addBytes(p.BOLD_ON)
            }
        }
        addBytes(p.BOLD_OFF)
        addBytes(p.NORMAL_SIZE)
        addText("--------------------------------\n")

        addText("Subtotal: AED ${String.format("%.2f", order.subtotal)}\n")
        addText("Tax:      AED ${String.format("%.2f", order.taxAmount)}\n")
        addBytes(p.BOLD_ON)
        addText("TOTAL:    AED ${String.format("%.2f", order.total)}\n")
        addBytes(p.BOLD_OFF)
        addText("--------------------------------\n")
        addBytes(p.ALIGN_CENTER)
        addText("${receiptSettings.receiptFooterMessage}\n")
        addText("\n\n\n")
        addBytes(p.CUT)

        return buffer.toByteArray()
    }

    fun buildPartialReceipt(
        order: OrderEntity,
        items: List<OrderItemEntity>,
        paymentAmount: Double,
        paymentMethod: String,
        totalPaidSoFar: Double,
        balanceRemaining: Double
    ): ByteArray {
        val p = ESCPOSPrinter
        val buffer = mutableListOf<Byte>()

        fun addBytes(bytes: ByteArray) = buffer.addAll(bytes.toList())
        fun addText(text: String) = buffer.addAll(text.toByteArray(Charsets.UTF_8).toList())

        addBytes(p.INIT)
        addBytes(p.ALIGN_CENTER)
        addBytes(p.DOUBLE_SIZE)
        addText("** PARTIAL PAYMENT **\n")
        addBytes(p.NORMAL_SIZE)
        addText("================================\n")
        addBytes(p.ALIGN_LEFT)

        addText("Table: ${order.tableNumber}\n")
        addText("Order #${order.id.takeLast(8)}\n")
        addText("Time: ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())}\n")
        addText("--------------------------------\n")

        addBytes(p.BOLD_ON)
        addText("PAID: AED ${String.format("%.2f", paymentAmount)} (${paymentMethod.uppercase()})\n")
        addBytes(p.BOLD_OFF)
        addText("--------------------------------\n")

        addText("Order Total:  AED ${String.format("%.2f", order.total)}\n")
        addText("Paid So Far:  AED ${String.format("%.2f", totalPaidSoFar)}\n")
        addBytes(p.BOLD_ON)
        addText("Balance Due:  AED ${String.format("%.2f", balanceRemaining)}\n")
        addBytes(p.BOLD_OFF)
        addText("--------------------------------\n")
        addBytes(p.ALIGN_CENTER)
        addText("Thank you!\n")
        addText("\n\n\n")
        addBytes(p.CUT)

        return buffer.toByteArray()
    }

    suspend fun testPrinter(ipAddress: String, port: Int = 9100): Result<String> {
        val p = ESCPOSPrinter
        val testTicket = mutableListOf<Byte>()

        fun addBytes(bytes: ByteArray) = testTicket.addAll(bytes.toList())
        fun addText(text: String) = testTicket.addAll(text.toByteArray(Charsets.UTF_8).toList())

        addBytes(p.INIT)
        addBytes(p.ALIGN_CENTER)
        addBytes(p.DOUBLE_SIZE)
        addText("** PRINTER TEST **\n")
        addBytes(p.NORMAL_SIZE)
        addText("\n")
        addText("IP: $ipAddress:$port\n")
        addText("Date: ${SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date())}\n")
        addText("\n")
        addText("If you can see this\n")
        addText("printer is working!\n")
        addText("\n\n\n")
        addBytes(p.CUT)

        return sendToPrinter(ipAddress, port, testTicket.toByteArray())
    }

    suspend fun openCashDrawer(ipAddress: String, port: Int = 9100): Result<String> {
        return sendToPrinter(ipAddress, port, ESCPOSPrinter.OPEN_DRAWER)
    }

    fun parsePrinterIds(printersJson: String): List<String> {
        return try {
            gson.fromJson(printersJson, Array<String>::class.java)?.toList() ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }
}
