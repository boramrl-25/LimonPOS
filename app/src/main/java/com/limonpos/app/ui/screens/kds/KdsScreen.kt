package com.limonpos.app.ui.screens.kds

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.viewinterop.AndroidView
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
    val pendingVoidCount by viewModel.pendingVoidRequestCount.collectAsState(0)
    var showVoidRequestPopup by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) { showVoidRequestPopup = true }

    if (pendingVoidCount > 0 && showVoidRequestPopup) {
        AlertDialog(
            onDismissRequest = { showVoidRequestPopup = false },
            title = { Text("Void Request", fontWeight = FontWeight.Bold, color = LimonText) },
            text = {
                Text(
                    "You have $pendingVoidCount pending void request(s) waiting for approval.",
                    color = LimonTextSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showVoidRequestPopup = false
                        onNavigateToVoidApprovals()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                ) {
                    Text("Go to Void Approvals", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showVoidRequestPopup = false }) {
                    Text("Dismiss", color = LimonTextSecondary)
                }
            },
            containerColor = LimonSurface
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "Kitchen Display (KDS)",
                            fontWeight = FontWeight.Bold,
                            color = LimonText
                        )
                        Text(
                            "Local-first • Works offline. Syncs to server when online.",
                            fontSize = 11.sp,
                            color = LimonTextSecondary
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Floor Plan", tint = LimonPrimary)
                    }
                    var menuExpanded by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { menuExpanded = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Menu", tint = LimonPrimary)
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            DropdownMenuItem(
                                text = { Text("Sync Data", color = LimonText) },
                                onClick = { menuExpanded = false; onSync() },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Void Approvals", color = LimonText) },
                                onClick = { menuExpanded = false; onNavigateToVoidApprovals() },
                                leadingIcon = { Icon(Icons.Default.Check, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Settings", color = LimonText) },
                                onClick = { menuExpanded = false; onNavigateToSettings() },
                                leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = LimonSurface,
                    titleContentColor = LimonText
                )
            )
        }
    ) { padding ->
        if (kdsUrl != null) {
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        webViewClient = WebViewClient()
                        settings.javaScriptEnabled = true
                        loadUrl(kdsUrl!!)
                    }
                },
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
