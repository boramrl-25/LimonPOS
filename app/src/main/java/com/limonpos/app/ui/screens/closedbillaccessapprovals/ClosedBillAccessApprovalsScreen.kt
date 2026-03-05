package com.limonpos.app.ui.screens.closedbillaccessapprovals

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.ClosedBillAccessRequestEntity
import com.limonpos.app.ui.theme.LimonPrimary
import com.limonpos.app.ui.theme.LimonSurface
import com.limonpos.app.ui.theme.LimonText
import com.limonpos.app.ui.theme.LimonTextSecondary
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClosedBillAccessApprovalsScreen(
    viewModel: ClosedBillAccessApprovalsViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val pendingRequests by viewModel.pendingRequests.collectAsState(emptyList())

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Closed Bill Access Requests",
                        fontWeight = FontWeight.Bold,
                        color = LimonText
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Home", tint = LimonPrimary)
                    }
                    var menuExpanded by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { menuExpanded = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Menu", tint = LimonPrimary)
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            DropdownMenuItem(
                                text = { Text("Table Service", color = LimonText) },
                                onClick = { menuExpanded = false; onNavigateToFloorPlan() },
                                leadingIcon = { Icon(Icons.Default.Restaurant, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Sync Data", color = LimonText) },
                                onClick = { menuExpanded = false; onSync() },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
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
        if (pendingRequests.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "No pending closed bill access requests",
                    color = LimonTextSecondary,
                    fontSize = 16.sp
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(pendingRequests, key = { it.id }) { request ->
                    ClosedBillAccessRequestCard(
                        request = request,
                        onApprove = { viewModel.approveRequest(request) },
                        onReject = { viewModel.rejectRequest(request) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ClosedBillAccessRequestCard(
    request: ClosedBillAccessRequestEntity,
    onApprove: () -> Unit,
    onReject: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                request.requestedByUserName,
                color = LimonText,
                fontWeight = FontWeight.Medium,
                fontSize = 16.sp
            )
            Text(
                "Requested at ${dateFormat.format(Date(request.requestedAt))}",
                color = LimonTextSecondary,
                fontSize = 13.sp
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onReject,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Reject", color = Color.Red)
                }
                Button(
                    onClick = onApprove,
                    colors = ButtonDefaults.buttonColors(containerColor = LimonPrimary),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp), tint = Color.White)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Approve", color = Color.White)
                }
            }
        }
    }
}

