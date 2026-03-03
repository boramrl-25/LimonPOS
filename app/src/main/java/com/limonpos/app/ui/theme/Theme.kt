package com.limonpos.app.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

val LimonPrimary = Color(0xFF84CC16)
val LimonBackground = Color(0xFF1A1D21)
val LimonSurface = Color(0xFF252A30)
val LimonText = Color(0xFFE8EAED)
val LimonTextSecondary = Color(0xFF9AA0A6)
val LimonError = Color(0xFFEF4444)
val LimonSuccess = Color(0xFF22C55E)
val LimonInfo = Color(0xFF3B82F6)
val LimonFree = Color(0xFF71717A)

private val DarkColorScheme = darkColorScheme(
    primary = LimonPrimary,
    secondary = LimonPrimary,
    tertiary = LimonPrimary,
    background = LimonBackground,
    surface = LimonSurface,
    onPrimary = Color.Black,
    onSecondary = Color.Black,
    onBackground = LimonText,
    onSurface = LimonText,
    onSurfaceVariant = LimonTextSecondary,
    error = LimonError,
    onError = Color.White
)

@Composable
fun LimonPOSTheme(
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = LimonBackground.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
