package com.limonpos.app.ui.screens.voidapprovals

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
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.VoidRequestEntity
import com.limonpos.app.ui.theme.*
import com.limonpos.app.util.CurrencyUtils
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoidApprovalsScreen(
    viewModel: VoidApprovalsViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    canAccessSettings: Boolean = true,
    onSync: () -> Unit = {}
) {
    val pendingRequests by viewModel.pendingRequests.collectAsState(emptyList())
    val approvalCapability by viewModel.approvalCapability.collectAsState(null)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Void Approvals",
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
                                text = { Text("Sync Data", color = LimonText) },
                                onClick = { menuExpanded = false; onSync() },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
                            )
                            if (canAccessSettings) {
                                DropdownMenuItem(
                                    text = { Text("Settings", color = LimonText) },
                                    onClick = { menuExpanded = false; onNavigateToSettings() },
                                    leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
                                )
                            }
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
                    "No pending void requests",
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
                    VoidRequestCard(
                        request = request,
                        approvalCapability = approvalCapability,
                        canApprove = viewModel.canCurrentUserApprove(request, approvalCapability),
                        onApprove = { viewModel.approveRequest(request) },
                        onReject = { viewModel.rejectRequest(request) }
                    )
                }
            }
        }
    }
}

@Composable
private fun VoidRequestCard(
    request: VoidRequestEntity,
    approvalCapability: VoidApprovalsViewModel.ApprovalCapability?,
    canApprove: Boolean,
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
                "${request.quantity}x ${request.productName}",
                color = LimonText,
                fontWeight = FontWeight.Medium,
                fontSize = 16.sp
            )
            Text(
                "Table ${request.tableNumber} • ${CurrencyUtils.format(request.price * request.quantity)}",
                color = LimonTextSecondary,
                fontSize = 14.sp
            )
            Text(
                "Requested by ${request.requestedByUserName} at ${dateFormat.format(Date(request.requestedAt))}",
                color = LimonTextSecondary,
                fontSize = 12.sp
            )
            Text(
                "Supervisor: ${request.approvedBySupervisorUserName?.let { "✓ $it" } ?: "Pending"}",
                color = if (request.approvedBySupervisorUserId != null) LimonSuccess else LimonTextSecondary,
                fontSize = 12.sp
            )
            Text(
                "One approval required",
                color = LimonTextSecondary,
                fontSize = 11.sp
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onReject,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonError),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Reject", color = LimonError)
                }
                Button(
                    onClick = onApprove,
                    enabled = canApprove,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = LimonSuccess,
                        disabledContainerColor = LimonTextSecondary.copy(alpha = 0.5f)
                    ),
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
