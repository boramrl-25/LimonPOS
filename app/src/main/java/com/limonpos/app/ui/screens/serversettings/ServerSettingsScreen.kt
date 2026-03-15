package com.limonpos.app.ui.screens.serversettings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.prefs.ServerPreferences
import com.limonpos.app.ui.theme.*
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServerSettingsScreen(
    viewModel: ServerSettingsViewModel = hiltViewModel(),
    isSetupUser: Boolean = false,
    isMaintenanceAccess: Boolean = false,
    onBack: () -> Unit
) {
    val baseUrl by viewModel.baseUrl.collectAsState()
    val secondaryBaseUrl by viewModel.secondaryBaseUrl.collectAsState()
    val tertiaryBaseUrl by viewModel.tertiaryBaseUrl.collectAsState()
    val message by viewModel.message.collectAsState()
    val testing by viewModel.testing.collectAsState()
    var inputUrl by remember { mutableStateOf(baseUrl) }
    var inputSecondary by remember { mutableStateOf(secondaryBaseUrl) }
    var inputTertiary by remember { mutableStateOf(tertiaryBaseUrl) }

    LaunchedEffect(baseUrl, secondaryBaseUrl, tertiaryBaseUrl) {
        inputUrl = baseUrl
        inputSecondary = secondaryBaseUrl
        inputTertiary = tertiaryBaseUrl
    }

    LaunchedEffect(message) {
        message?.let {
            delay(3000)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Server URL",
                        fontWeight = FontWeight.Bold,
                        color = LimonText
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            if (isSetupUser && !isMaintenanceAccess) Icons.Default.Logout else Icons.Default.ArrowBack,
                            contentDescription = if (isSetupUser && !isMaintenanceAccess) "Logout" else "Back",
                            tint = LimonText
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = LimonSurface,
                    titleContentColor = LimonText
                )
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
            Text(
                "Primary (Local A) tried first. Secondary (Local B) and Tertiary (Cloud) used if primary fails.",
                color = LimonTextSecondary,
                fontSize = 14.sp,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            OutlinedTextField(
                value = inputUrl,
                onValueChange = { inputUrl = it },
                label = { Text("Primary API URL (Local A)", color = LimonTextSecondary) },
                placeholder = { Text(ServerPreferences.DEFAULT_BASE_URL, color = LimonTextSecondary.copy(alpha = 0.6f)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = LimonText,
                    unfocusedTextColor = LimonText,
                    focusedBorderColor = LimonPrimary,
                    unfocusedBorderColor = LimonTextSecondary.copy(alpha = 0.5f),
                    focusedLabelColor = LimonPrimary,
                    cursorColor = LimonPrimary
                )
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = inputSecondary,
                onValueChange = { inputSecondary = it },
                label = { Text("Secondary (Local B) – optional", color = LimonTextSecondary) },
                placeholder = { Text("http://192.168.1.101:3002/api/", color = LimonTextSecondary.copy(alpha = 0.6f)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = LimonText,
                    unfocusedTextColor = LimonText,
                    focusedBorderColor = LimonPrimary,
                    unfocusedBorderColor = LimonTextSecondary.copy(alpha = 0.5f),
                    focusedLabelColor = LimonPrimary,
                    cursorColor = LimonPrimary
                )
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = inputTertiary,
                onValueChange = { inputTertiary = it },
                label = { Text("Tertiary (Cloud) – optional", color = LimonTextSecondary) },
                placeholder = { Text(ServerPreferences.DEFAULT_BASE_URL, color = LimonTextSecondary.copy(alpha = 0.6f)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = LimonText,
                    unfocusedTextColor = LimonText,
                    focusedBorderColor = LimonPrimary,
                    unfocusedBorderColor = LimonTextSecondary.copy(alpha = 0.5f),
                    focusedLabelColor = LimonPrimary,
                    cursorColor = LimonPrimary
                )
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Examples:\n• Emulator: http://10.0.2.2:3002/api/\n• Real device: http://192.168.1.100:3002/api/\n• localhost:3000 uses the default backend.",
                color = LimonTextSecondary,
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            Text(
                "Note: Opening this URL in browser may show 'connection not secure' (HTTP). Use it only in this field and Save.",
                color = LimonTextSecondary.copy(alpha = 0.8f),
                fontSize = 11.sp,
                modifier = Modifier.padding(bottom = 24.dp)
            )
            message?.let { msg ->
                Text(
                    msg,
                    color = if (msg.startsWith("Connection successful")) LimonSuccess else LimonPrimary,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = { viewModel.testConnection(inputUrl) },
                    modifier = Modifier.weight(1f),
                    enabled = !testing
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (testing) "Testing…" else "Test connection")
                }
                Button(
                    onClick = {
                        viewModel.saveUrl(
                            inputUrl,
                            inputSecondary.ifBlank { null },
                            inputTertiary.ifBlank { null }
                        )
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                ) {
                    Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Save")
                }
            }
        }
    }
}
