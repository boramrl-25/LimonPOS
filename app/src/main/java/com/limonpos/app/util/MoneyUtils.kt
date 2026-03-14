package com.limonpos.app.util

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Precise monetary arithmetic to avoid Double floating-point errors (e.g. 0.0000001).
 * All amounts rounded to 2 decimal places.
 */
object MoneyUtils {
    private val SCALE = 2
    private val ROUNDING = RoundingMode.HALF_UP

    /** Round to 2 decimal places. */
    fun round(amount: Double): Double =
        BigDecimal.valueOf(amount).setScale(SCALE, ROUNDING).toDouble()

    /** Sum of amounts, rounded. */
    fun sum(amounts: Iterable<Double>): Double {
        var acc = BigDecimal.ZERO
        for (a in amounts) {
            acc = acc.add(BigDecimal.valueOf(a).setScale(SCALE, ROUNDING))
        }
        return acc.setScale(SCALE, ROUNDING).toDouble()
    }

    /** Add two amounts. */
    fun add(a: Double, b: Double): Double =
        BigDecimal.valueOf(a).add(BigDecimal.valueOf(b)).setScale(SCALE, ROUNDING).toDouble()

    /** Subtract b from a. */
    fun subtract(a: Double, b: Double): Double =
        BigDecimal.valueOf(a).subtract(BigDecimal.valueOf(b)).setScale(SCALE, ROUNDING).toDouble()

    /** True if |a - b| < 0.01 (amounts are effectively equal). */
    fun equals(a: Double, b: Double): Boolean =
        kotlin.math.abs(BigDecimal.valueOf(a).subtract(BigDecimal.valueOf(b)).toDouble()) < 0.01

    /** True if a > b (with tolerance). */
    fun greaterThan(a: Double, b: Double): Boolean =
        BigDecimal.valueOf(a).compareTo(BigDecimal.valueOf(b)) > 0

    /** Cap amount to [min, max] and round. */
    fun coerceIn(amount: Double, min: Double, max: Double): Double =
        round(amount.coerceIn(min, max))
}
