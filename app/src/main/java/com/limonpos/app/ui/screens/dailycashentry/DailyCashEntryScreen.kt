package com.limonpos.app.ui.screens.dailycashentry

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.ui.theme.*
import com.limonpos.app.util.CurrencyUtils

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
            title = { Text("Print Error", color = LimonText) },
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
                    Text("Close", color = LimonTextSecondary)
                }
            },
            containerColor = LimonSurface
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("Daily Transaction", fontWeight = FontWeight.Bold, color = LimonText)
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            uiState.error?.let { err ->
                Text(err, color = LimonError, fontSize = 14.sp)
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = LimonSurface),
                shape = MaterialTheme.shapes.medium
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Cash", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = LimonText)
                    Text("System cash: ${CurrencyUtils.format(uiState.systemCash)}", fontSize = 13.sp, color = LimonTextSecondary)
                    OutlinedTextField(
                        value = uiState.cashInput,
                        onValueChange = { viewModel.setCashInput(it) },
                        label = { Text("Cash amount") },
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
                    Button(
                        onClick = { viewModel.saveCash() },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !uiState.isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                    ) {
                        if (uiState.isLoading && uiState.lastSavedType == "cash") {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)
                            Spacer(Modifier.width(8.dp))
                        }
                        Text("Add Cash")
                    }
                    if (uiState.cashEntries.isNotEmpty()) {
                        Text("Today's cash entries: ${uiState.cashEntries.size}", fontSize = 12.sp, color = LimonTextSecondary)
                    }
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = LimonSurface),
                shape = MaterialTheme.shapes.medium
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Card", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = LimonText)
                    Text("System card: ${CurrencyUtils.format(uiState.systemCard)}", fontSize = 13.sp, color = LimonTextSecondary)
                    OutlinedTextField(
                        value = uiState.cardRefInput,
                        onValueChange = { viewModel.setCardRefInput(it) },
                        label = { Text("Card reference (1–15 digits)") },
                        singleLine = true,
                        placeholder = { Text("123456789012345") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = LimonText,
                            unfocusedTextColor = LimonText,
                            focusedBorderColor = LimonPrimary,
                            cursorColor = LimonPrimary
                        )
                    )
                    OutlinedTextField(
                        value = uiState.cardAmountInput,
                        onValueChange = { viewModel.setCardAmountInput(it) },
                        label = { Text("Card amount") },
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
                    Button(
                        onClick = { viewModel.saveCard() },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !uiState.isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary)
                    ) {
                        if (uiState.isLoading && uiState.lastSavedType == "card") {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)
                            Spacer(Modifier.width(8.dp))
                        }
                        Text("Add Card")
                    }
                    if (uiState.cardEntries.isNotEmpty()) {
                        Text("Today's card entries: ${uiState.cardEntries.size}", fontSize = 12.sp, color = LimonTextSecondary)
                    }
                }
            }
        }
    }
}
