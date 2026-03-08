package com.limonpos.app.ui.screens.zohobooks

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.ui.theme.*
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ZohoBooksSettingsScreen(
    viewModel: ZohoBooksSettingsViewModel = hiltViewModel(),
    onBack: () -> Unit
) {
    val isEnabled by viewModel.isEnabled.collectAsState(false)
    val accessToken by viewModel.accessToken.collectAsState("")
    val organizationId by viewModel.organizationId.collectAsState("")
    val customerId by viewModel.customerId.collectAsState("")
    val message by viewModel.message.collectAsState()

    var tokenInput by remember { mutableStateOf(accessToken) }
    var orgInput by remember { mutableStateOf(organizationId) }
    var custInput by remember { mutableStateOf(customerId) }

    LaunchedEffect(accessToken, organizationId, customerId) {
        tokenInput = accessToken
        orgInput = organizationId
        custInput = customerId
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
                title = { Text("Zoho Books", fontWeight = FontWeight.Bold, color = LimonText) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
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
            Text(
                "Instant sales transfer: Sales are sent to Zoho Books as Sales Receipt when payment is completed.",
                color = LimonTextSecondary,
                fontSize = 14.sp,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
            ) {
                Switch(
                    checked = isEnabled,
                    onCheckedChange = { viewModel.setEnabled(it) },
                    colors = SwitchDefaults.colors(checkedThumbColor = LimonPrimary, checkedTrackColor = LimonPrimary.copy(alpha = 0.5f))
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Zoho Books aktif", color = LimonText) 
            }
            Spacer(modifier = Modifier.height(24.dp))
            OutlinedTextField(
                value = tokenInput,
                onValueChange = { tokenInput = it },
                label = { Text("Access Token") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = LimonPrimary,
                    focusedLabelColor = LimonPrimary,
                    cursorColor = LimonPrimary,
                    focusedTextColor = LimonText
                )
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = orgInput,
                onValueChange = { orgInput = it },
                label = { Text("Organization ID") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = LimonPrimary,
                    focusedLabelColor = LimonPrimary,
                    cursorColor = LimonPrimary,
                    focusedTextColor = LimonText
                )
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = custInput,
                onValueChange = { custInput = it },
                label = { Text("Customer ID (Walk-in customer)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = LimonPrimary,
                    focusedLabelColor = LimonPrimary,
                    cursorColor = LimonPrimary,
                    focusedTextColor = LimonText
                )
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = { viewModel.saveCredentials(tokenInput, orgInput, custInput) },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
            ) {
                Text("Save")
            }
        }
    }
}
