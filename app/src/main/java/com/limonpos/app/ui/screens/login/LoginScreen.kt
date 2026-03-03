package com.limonpos.app.ui.screens.login

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.ui.theme.*

@Composable
fun LoginScreen(
    viewModel: LoginViewModel = hiltViewModel(),
    onLoginSuccess: () -> Unit,
    loginScreenKey: Int = 0
) {
    val pin by viewModel.pin.collectAsState()
    val error by viewModel.error.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    val loginSuccess by viewModel.loginSuccess.collectAsState()
    LaunchedEffect(loginSuccess) {
        if (loginSuccess) onLoginSuccess()
    }
    LaunchedEffect(loginScreenKey) {
        viewModel.clearPin()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(LimonPrimary, CircleShape)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Limon POS",
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            color = LimonText
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Enter your PIN to continue",
            fontSize = 16.sp,
            color = LimonTextSecondary
        )
        Spacer(modifier = Modifier.height(48.dp))

        Text(
            text = "●".repeat(pin.length).padEnd(4, '_').take(4),
            fontSize = 36.sp,
            fontWeight = FontWeight.Medium,
            color = LimonPrimary
        )
        Spacer(modifier = Modifier.height(24.dp))

        if (error != null) {
            Text(
                text = error!!,
                color = com.limonpos.app.ui.theme.LimonError,
                modifier = Modifier.padding(bottom = 16.dp)
            )
        }

        Numpad(
            onDigit = { viewModel.addDigit(it) },
            onClear = { viewModel.clearPin() },
            onBackspace = { viewModel.backspace() },
            onEnter = { viewModel.login() },
            enabled = !isLoading
        )
    }
}

@Composable
private fun Numpad(
    onDigit: (String) -> Unit,
    onClear: () -> Unit,
    onBackspace: () -> Unit,
    onEnter: () -> Unit,
    enabled: Boolean
) {
    val keys = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("C", "0", "⌫")
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        keys.forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                row.forEach { key ->
                    val isAction = key in listOf("C", "⌫")
                    Button(
                        onClick = {
                            when (key) {
                                "C" -> onClear()
                                "⌫" -> onBackspace()
                                else -> onDigit(key)
                            }
                        },
                        modifier = Modifier.size(72.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isAction) LimonTextSecondary else LimonPrimary,
                            contentColor = LimonText
                        ),
                        enabled = enabled
                    ) {
                        Text(
                            text = key,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Button(
            onClick = onEnter,
            modifier = Modifier
                .fillMaxWidth(0.8f)
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary, contentColor = LimonText),
            enabled = enabled
        ) {
            Text("Sign In", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
    }
}
