package com.limonpos.app.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.ui.theme.*
import kotlinx.coroutines.delay

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
    onNavigateToVoidReport: () -> Unit = {},
    onSync: () -> Unit = {},
    onLogout: () -> Unit
) {
    val userRole by viewModel.userRole.collectAsState(null)
    val isManager by viewModel.isManager.collectAsState(false)
    val isKdsOnly = userRole == "kds"
    val message by viewModel.message.collectAsState()
    var menuExpanded by remember { mutableStateOf(false) }
    var showClearSalesConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(message) {
        message?.let {
            delay(2000)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isKdsOnly) "KDS" else "Settings", fontWeight = FontWeight.Bold, color = LimonText) },
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
                        DropdownMenuItem(
                            text = { Text("Kitchen Display (KDS)", color = LimonText) },
                            onClick = {
                                menuExpanded = false
                                onNavigateToKds()
                            },
                            leadingIcon = { Icon(Icons.Default.Restaurant, contentDescription = null, tint = LimonPrimary) }
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
            if (isKdsOnly) {
                Text("Kitchen Display", fontWeight = FontWeight.Bold, color = LimonText, fontSize = 16.sp, modifier = Modifier.padding(bottom = 12.dp))
                Button(
                    onClick = onNavigateToKds,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                ) {
                    Icon(Icons.Default.Restaurant, contentDescription = null, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("KDS Aç / Open Kitchen Display", color = LimonText, fontSize = 16.sp)
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
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = onNavigateToVoidReport,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Void Report", color = LimonText)
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
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { showClearSalesConfirm = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonError)
                ) {
                    Icon(Icons.Default.DeleteForever, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Clear Local Sales", color = LimonError)
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

    if (showClearSalesConfirm) {
        AlertDialog(
            onDismissRequest = { showClearSalesConfirm = false },
            title = { Text("Clear Local Sales?", fontWeight = FontWeight.Bold) },
            text = { Text("This will delete all orders, payments and void data from this device. Tables will be reset. Continue?", color = LimonText) },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearLocalSales()
                        showClearSalesConfirm = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonError)
                ) { Text("Clear") }
            },
            dismissButton = { TextButton(onClick = { showClearSalesConfirm = false }) { Text("Cancel", color = LimonTextSecondary) } },
            containerColor = LimonSurface
        )
    }

}

