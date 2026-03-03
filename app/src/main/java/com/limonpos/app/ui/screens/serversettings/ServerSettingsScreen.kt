package com.limonpos.app.ui.screens.serversettings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
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
    onBack: () -> Unit
) {
    val baseUrl by viewModel.baseUrl.collectAsState()
    val message by viewModel.message.collectAsState()
    var inputUrl by remember { mutableStateOf(baseUrl) }

    LaunchedEffect(baseUrl) {
        inputUrl = baseUrl
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
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
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
                "Bu backend Zoho Books ile aynı veriyi kullanır. WiFi değişince bilgisayar IP'sini güncelleyin.",
                color = LimonTextSecondary,
                fontSize = 14.sp,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            OutlinedTextField(
                value = inputUrl,
                onValueChange = { inputUrl = it },
                label = { Text("API Server URL", color = LimonTextSecondary) },
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
                "Örnekler:\n• Emulator: http://10.0.2.2:3002/api/\n• Gerçek cihaz: http://192.168.1.100:3002/api/\n• localhost:3000 yazarsanız varsayılan backend kullanılır.",
                color = LimonTextSecondary,
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            Text(
                "Not: Bu adresi tarayıcıda (Chrome/Google) açarsanız \"bağlantı güvenli değil\" uyarısı normaldir (HTTP). Adresi yalnızca bu alana yazıp Kaydet ile kullanın.",
                color = LimonTextSecondary.copy(alpha = 0.8f),
                fontSize = 11.sp,
                modifier = Modifier.padding(bottom = 24.dp)
            )
            message?.let { msg ->
                Text(
                    msg,
                    color = LimonPrimary,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
            }
            Button(
                onClick = { viewModel.saveUrl(inputUrl) },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
            ) {
                Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Save")
            }
        }
    }
}
