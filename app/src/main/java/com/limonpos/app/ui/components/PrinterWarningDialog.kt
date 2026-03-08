package com.limonpos.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.limonpos.app.ui.theme.LimonError
import com.limonpos.app.ui.theme.LimonPrimary
import com.limonpos.app.ui.theme.LimonSurface
import com.limonpos.app.ui.theme.LimonText
import com.limonpos.app.ui.theme.LimonTextSecondary

/**
 * Ortada, belirgin yazıcı uyarı diyaloğu. Ekran kilitli olsa bile (Activity FLAG_SHOW_WHEN_LOCKED) görünür.
 */
@Composable
fun PrinterWarningDialog(
    message: String,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
    dismissLabel: String = "Dismiss"
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = false,
            dismissOnClickOutside = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.7f)),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .padding(24.dp),
                shape = RoundedCornerShape(20.dp),
                color = LimonSurface,
                shadowElevation = 16.dp
            ) {
                Column(
                    modifier = Modifier.padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    Text(
                        "Printer warning",
                        color = LimonError,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = message,
                        color = LimonText,
                        fontSize = 18.sp,
                        lineHeight = 26.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        "Tekrar dene veya kapat.",
                        color = LimonTextSecondary,
                        fontSize = 14.sp
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        OutlinedButton(
                            onClick = onDismiss,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonTextSecondary),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(dismissLabel, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                        }
                        Button(
                            onClick = onRetry,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Tekrar dene", color = Color.Black, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}
