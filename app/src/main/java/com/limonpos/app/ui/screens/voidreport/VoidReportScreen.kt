package com.limonpos.app.ui.screens.voidreport

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.VoidLogEntity
import com.limonpos.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoidReportScreen(
    viewModel: VoidReportViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val voids by viewModel.voids.collectAsState(emptyList())
    val filterType by viewModel.filterType.collectAsState()
    var showFilterMenu by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.loadVoids() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Void Reports", fontWeight = FontWeight.Bold, color = LimonText) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Home", tint = LimonPrimary)
                    }
                    var settingsMenuExpanded by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { settingsMenuExpanded = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Menu", tint = LimonPrimary)
                        }
                        DropdownMenu(expanded = settingsMenuExpanded, onDismissRequest = { settingsMenuExpanded = false }) {
                            DropdownMenuItem(
                                text = { Text("Sync Data", color = LimonText) },
                                onClick = { settingsMenuExpanded = false; onSync() },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = LimonPrimary) }
                            )
                            DropdownMenuItem(
                                text = { Text("Settings", color = LimonText) },
                                onClick = { settingsMenuExpanded = false; onNavigateToSettings() },
                                leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
                            )
                        }
                    }
                    IconButton(onClick = { showFilterMenu = true }) {
                        Icon(Icons.Default.FilterList, contentDescription = "Filter", tint = LimonText)
                    }
                    DropdownMenu(
                        expanded = showFilterMenu,
                        onDismissRequest = { showFilterMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("All") },
                            onClick = {
                                viewModel.setFilterType(null)
                                showFilterMenu = false
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Pre-Void (before send to kitchen)") },
                            onClick = {
                                viewModel.setFilterType("pre_void")
                                showFilterMenu = false
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Post-Void (after send to kitchen)") },
                            onClick = {
                                viewModel.setFilterType("post_void")
                                showFilterMenu = false
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Recalled Bill Void") },
                            onClick = {
                                viewModel.setFilterType("recalled_void")
                                showFilterMenu = false
                            }
                        )
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
                .padding(16.dp)
        ) {
            filterType?.let { type ->
                Text(
                    "Filter: ${type.replace("_", " ")}",
                    color = LimonTextSecondary,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
            Text(
                "Who voided, when, and why. Each removal requires permission and reason.",
                color = LimonTextSecondary,
                fontSize = 13.sp,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            if (voids.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = androidx.compose.ui.Alignment.Center
                ) {
                    Text("No void records", color = LimonTextSecondary)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(voids, key = { it.id }) { log ->
                        VoidReportCard(log = log)
                    }
                }
            }
        }
    }
}

@Composable
private fun VoidReportCard(log: VoidLogEntity) {
    val dateStr = remember(log.createdAt) {
        SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date(log.createdAt))
    }
    val typeLabel = when (log.type) {
        "pre_void" -> "Pre-Void (before send to kitchen)"
        "post_void" -> "Post-Void (after send to kitchen)"
        "recalled_void" -> "Recalled Bill Void"
        else -> log.type
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(typeLabel, color = LimonPrimary, fontWeight = FontWeight.Medium, fontSize = 12.sp)
                Text(dateStr, color = LimonTextSecondary, fontSize = 12.sp)
            }
            Spacer(Modifier.height(4.dp))
            Text("${log.quantity}x ${log.productName}", fontWeight = FontWeight.Medium, color = LimonText, fontSize = 14.sp)
            Text("AED ${String.format("%.2f", log.amount)}", color = LimonTextSecondary, fontSize = 13.sp)
            Spacer(Modifier.height(4.dp))
            Text("By: ${log.userName}", color = LimonTextSecondary, fontSize = 12.sp)
            Text("Reason: ${log.details}", color = LimonText, fontSize = 13.sp)
            log.sourceTableNumber?.let { tbl ->
                Text("Table: $tbl", color = LimonTextSecondary, fontSize = 12.sp)
            }
        }
    }
}
