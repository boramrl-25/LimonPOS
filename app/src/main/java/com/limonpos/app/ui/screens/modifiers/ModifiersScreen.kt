package com.limonpos.app.ui.screens.modifiers

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.List
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.ui.theme.*
import com.limonpos.app.util.CurrencyUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModifiersScreen(
    viewModel: ModifiersViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val modifierGroups by viewModel.modifierGroupsWithOptions.collectAsState(emptyList())

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Modifiers", fontWeight = FontWeight.Bold, color = LimonText)
                        Text("From web sync", fontSize = 12.sp, color = LimonTextSecondary)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = onSync) {
                        Icon(Icons.Default.Refresh, contentDescription = "Sync", tint = LimonPrimary)
                    }
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Floor Plan", tint = LimonPrimary)
                    }
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings", tint = LimonPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = LimonSurface, titleContentColor = LimonText)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(modifierGroups, key = { it.group.id }) { item ->
                ModifierGroupCard(item = item)
            }
        }
    }
}

@Composable
private fun ModifierGroupCard(item: ModifierGroupWithOptions) {
    val group = item.group
    val options = item.options
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.List, contentDescription = null, tint = LimonPrimary, modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(group.name, fontWeight = FontWeight.Bold, color = LimonText, fontSize = 18.sp)
                    Text("Select ${group.minSelect}-${group.maxSelect} | Required: ${group.required}", color = LimonTextSecondary, fontSize = 12.sp)
                }
            }
            if (options.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Text("Options:", fontWeight = FontWeight.Medium, color = LimonTextSecondary, fontSize = 14.sp)
                options.forEach { opt ->
                    Row(
                        modifier = Modifier.padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(opt.name, color = LimonText, fontSize = 14.sp)
                        Text(CurrencyUtils.format(opt.price), color = LimonPrimary, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}
