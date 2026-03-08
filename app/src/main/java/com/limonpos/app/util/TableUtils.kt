package com.limonpos.app.util

/** Masa numarası formatı: 1-9 için #1, #2...; 10+ için 10, 11... */
fun formatTableNo(num: String): String {
    val n = num.trim().toIntOrNull() ?: return num
    return if (n in 1..9) "#$n" else "$n"
}
