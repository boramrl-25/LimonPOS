package com.limonpos.app.ui.screens.kds

import android.app.Activity
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KdsScreen(
    viewModel: KdsViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToVoidApprovals: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val kdsUrl by viewModel.kdsUrl.collectAsState()

    val view = LocalView.current
    DisposableEffect(Unit) {
        val activity = view.context as? Activity
        val window = activity?.window
        if (window != null) {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            val insetsController = WindowCompat.getInsetsController(window, view)
            insetsController.hide(WindowInsetsCompat.Type.statusBars())
            insetsController.hide(WindowInsetsCompat.Type.navigationBars())
            insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        onDispose {
            if (window != null) {
                val insetsController = WindowCompat.getInsetsController(window, view)
                insetsController.show(WindowInsetsCompat.Type.statusBars())
                insetsController.show(WindowInsetsCompat.Type.navigationBars())
                WindowCompat.setDecorFitsSystemWindows(window, true)
            }
        }
    }

    Scaffold(contentWindowInsets = WindowInsets(0, 0, 0, 0)) { padding ->
        if (kdsUrl != null) {
            val webViewRef = remember { mutableStateOf<WebView?>(null) }
            LaunchedEffect(viewModel.refreshRequests) {
                viewModel.refreshRequests.collect {
                    webViewRef.value?.evaluateJavascript(
                        "if(typeof loadKitchen==='function')loadKitchen();",
                        null
                    )
                }
            }
            AndroidView(
                factory = { ctx ->
                    try {
                        WebView(ctx).apply {
                            webViewRef.value = this
                            webViewClient = WebViewClient()
                            settings.javaScriptEnabled = true
                            loadUrl(kdsUrl!!)
                        }
                    } catch (e: Throwable) {
                        android.widget.TextView(ctx).apply {
                            text = "KDS requires Android System WebView.\n\nInstall or update it from Play Store (search: \"Android System WebView\") or enable in Settings → Apps."
                            setPadding(48, 48, 48, 48)
                            setTextColor(android.graphics.Color.DKGRAY)
                            textSize = 16f
                        }
                    }
                },
                update = { view -> if (view is WebView) webViewRef.value = view },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = LimonPrimary)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Starting KDS...", color = LimonTextSecondary, fontSize = 16.sp)
                }
            }
        }
    }
}
