package com.limonpos.app.ui.screens.dailycashentry

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.ui.theme.LimonPrimary
import com.limonpos.app.ui.theme.LimonError
import com.limonpos.app.ui.theme.LimonText
import com.limonpos.app.ui.theme.LimonTextSecondary
import com.limonpos.app.ui.theme.LimonSurface

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DailyCashEntryScreen(
    viewModel: DailyCashEntryViewModel = hiltViewModel(),
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val printWarning by viewModel.printWarning.collectAsState(null)

    printWarning?.let { message ->
        AlertDialog(
            onDismissRequest = { viewModel.dismissPrintWarning() },
            title = { Text("Print failed", color = LimonText) },
            text = { Text(message, color = LimonTextSecondary) },
            confirmButton = {
                Button(
                    onClick = { viewModel.retryPrint() },
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                ) {
                    Text("Retry", color = Color.Black)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissPrintWarning() }) {
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
                    Text("Daily Cash Entry", fontWeight = FontWeight.Bold, color = LimonText)
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = uiState.physicalCashInput,
                onValueChange = { viewModel.setPhysicalCashInput(it) },
                label = { Text("Cash (End of day count)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = LimonText,
                    unfocusedTextColor = LimonText,
                    focusedBorderColor = LimonPrimary,
                    cursorColor = LimonPrimary
                )
            )

            uiState.error?.let { err ->
                Text(err, color = LimonError, fontSize = 14.sp)
            }

            Button(
                onClick = { viewModel.save() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isLoading,
                colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = androidx.compose.ui.graphics.Color.White
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text("Save")
            }

            uiState.savedEntry?.let { entry ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = LimonSurface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (uiState.saveSuccess) {
                            Text("Saved successfully", fontSize = 14.sp, color = LimonPrimary)
                        }
                        Text(
                            "Cash: %.2f".format(entry.physicalCash),
                            fontSize = 16.sp,
                            color = LimonText
                        )
                        entry.userName?.let { Text("By: $it", fontSize = 12.sp, color = LimonTextSecondary) }
                    }
                }
            }
        }
    }
}
