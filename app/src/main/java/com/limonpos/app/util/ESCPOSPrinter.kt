package com.limonpos.app.util

object ESCPOSPrinter {
    // Commands
    val ESC: Byte = 0x1B
    val GS: Byte = 0x1D

    // Initialize
    val INIT = byteArrayOf(ESC, '@'.code.toByte())

    // Text formatting
    val BOLD_ON = byteArrayOf(ESC, 'E'.code.toByte(), 1)
    val BOLD_OFF = byteArrayOf(ESC, 'E'.code.toByte(), 0)
    val DOUBLE_HEIGHT = byteArrayOf(GS, '!'.code.toByte(), 0x10)
    val DOUBLE_WIDTH = byteArrayOf(GS, '!'.code.toByte(), 0x20)
    val DOUBLE_SIZE = byteArrayOf(GS, '!'.code.toByte(), 0x30)
    val NORMAL_SIZE = byteArrayOf(GS, '!'.code.toByte(), 0x00)

    // Alignment
    val ALIGN_LEFT = byteArrayOf(ESC, 'a'.code.toByte(), 0)
    val ALIGN_CENTER = byteArrayOf(ESC, 'a'.code.toByte(), 1)
    val ALIGN_RIGHT = byteArrayOf(ESC, 'a'.code.toByte(), 2)

    // Paper
    val CUT = byteArrayOf(GS, 'V'.code.toByte(), 0)
    val PARTIAL_CUT = byteArrayOf(GS, 'V'.code.toByte(), 1)
    val FEED = byteArrayOf('\n'.code.toByte())

    // Cash drawer
    val OPEN_DRAWER = byteArrayOf(ESC, 'p'.code.toByte(), 0, 25, -6)
}
