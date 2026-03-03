package com.limonpos.app.util

object CurrencyUtils {
    const val CURRENCY_SYMBOL = "AED"
    const val CURRENCY_CODE = "AED"

    fun format(amount: Double): String = "$CURRENCY_SYMBOL ${"%.2f".format(amount)}"
}
