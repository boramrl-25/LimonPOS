package com.limonpos.app.ui.screens.settings

import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.*
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.core.content.ContextCompat
import com.limonpos.app.data.prefs.ReceiptItemSize
import com.limonpos.app.ui.theme.*
import kotlinx.coroutines.delay
import android.Manifest
import android.content.pm.PackageManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToKds: () -> Unit = {},
    onNavigateToBackOfficeSettings: () -> Unit = {},
    onNavigateToServerSettings: () -> Unit = {},
    onNavigateToPrinters: () -> Unit = {},
    onSync: () -> Unit = {},
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val userRole by viewModel.userRole.collectAsState(null)
    val isManager by viewModel.isManager.collectAsState(false)
    val canAccessKds by viewModel.canAccessKds.collectAsState(false)
    val isKdsOnly = userRole == "kds"
    val message by viewModel.message.collectAsState()
    val receiptItemSize by viewModel.receiptItemSize.collectAsState(ReceiptItemSize.NORMAL)
    val needsNotificationPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    var menuExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(message) {
        message?.let {
            delay(2000)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (isKdsOnly) "Kitchen" else "Settings", fontWeight = FontWeight.Bold, color = LimonText)
                },
                navigationIcon = {
                    if (!isKdsOnly) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                        }
                    }
                },
                actions = {
                    if (!isKdsOnly) {
                        IconButton(onClick = onNavigateToFloorPlan) {
                            Icon(Icons.Default.Home, contentDescription = "Floor Plan", tint = LimonPrimary)
                        }
                    }
                    Box {
                        IconButton(
                            onClick = { menuExpanded = true },
                            modifier = Modifier.background(LimonPrimary.copy(alpha = 0.3f))
                        ) {
                            Icon(Icons.Default.Menu, contentDescription = "Menu", tint = LimonPrimary)
                        }
                        DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false }
                    ) {
                        if (canAccessKds) {
                            DropdownMenuItem(
                                text = { Text("Kitchen Display (KDS)", color = LimonText) },
                                onClick = {
                                    menuExpanded = false
                                    onNavigateToKds()
                                },
                                leadingIcon = { Icon(Icons.Default.Restaurant, contentDescription = null, tint = LimonPrimary) }
                            )
                        }
                        DropdownMenuItem(
                            text = { Text("Sync", color = LimonText) },
                            onClick = {
                                menuExpanded = false
                                onSync()
                            },
                            leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
                        )
                        Divider(color = LimonTextSecondary.copy(alpha = 0.3f))
                        DropdownMenuItem(
                            text = { Text("Logout", color = LimonError) },
                            onClick = {
                                menuExpanded = false
                                viewModel.logout()
                            },
                            leadingIcon = { Icon(Icons.Default.Logout, contentDescription = null, tint = LimonError) }
                        )
                    }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = LimonSurface, titleContentColor = LimonText)
            )
        }
        ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            message?.let { msg ->
                Text(msg, color = LimonPrimary, modifier = Modifier.padding(bottom = 16.dp), fontSize = 14.sp)
            }
            if (needsNotificationPermission) {
                Text("Notifications", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp, modifier = Modifier.padding(bottom = 12.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = LimonError.copy(alpha = 0.15f))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Notification permission denied. Overdue table alerts will not appear.", color = LimonText, fontSize = 14.sp)
                        Text("Notification permission denied. Overdue alerts will not appear.", color = LimonTextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = {
                                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                                }
                                context.startActivity(intent)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                        ) {
                            Icon(Icons.Default.Notifications, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Open Settings", color = LimonText)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(24.dp))
            }
            if (isKdsOnly) {
                Text("Kitchen Display", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp, modifier = Modifier.padding(bottom = 12.dp))
                Button(
                    onClick = onNavigateToKds,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                ) {
                    Icon(Icons.Default.Restaurant, contentDescription = null, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Open Kitchen Display (KDS)", color = LimonText, fontSize = 16.sp)
                }
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = onSync,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Sync", color = LimonText, fontSize = 16.sp)
                }
                Spacer(modifier = Modifier.height(24.dp))
                Button(
                    onClick = { viewModel.logout() },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) {
                    Icon(Icons.Default.Logout, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Logout", color = LimonText)
                }
            } else {
                Text("POS Actions", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp, modifier = Modifier.padding(bottom = 12.dp))
                OutlinedButton(
                    onClick = onNavigateToPrinters,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Printer Setup", color = LimonText)
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text("Receipt item size", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 14.sp, modifier = Modifier.padding(bottom = 8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    listOf(
                        ReceiptItemSize.NORMAL to "Normal",
                        ReceiptItemSize.LARGE to "Large",
                        ReceiptItemSize.XLARGE to "XLarge"
                    ).forEach { (size, label) ->
                        FilterChip(
                            selected = receiptItemSize == size,
                            onClick = { viewModel.setReceiptItemSize(size) },
                            label = { Text(label, fontSize = 14.sp) }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = onNavigateToServerSettings,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Server URL (WiFi)", color = LimonText)
                }
                Spacer(modifier = Modifier.height(24.dp))
                Button(
                    onClick = { viewModel.logout() },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) {
                    Icon(Icons.Default.Logout, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Logout", color = LimonText)
                }
            }
        }
    }

}

