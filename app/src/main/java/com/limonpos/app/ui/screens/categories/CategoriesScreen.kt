package com.limonpos.app.ui.screens.categories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.CategoryEntity
import com.limonpos.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoriesScreen(
    viewModel: CategoriesViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    canAccessSettings: Boolean = true,
    onSync: () -> Unit = {}
) {
    val categories by viewModel.categories.collectAsState(emptyList())

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Categories", fontWeight = FontWeight.Bold, color = LimonText)
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
                    if (canAccessSettings) {
                        IconButton(onClick = onNavigateToSettings) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings", tint = LimonPrimary)
                        }
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
            items(categories.filter { it.id != "all" }, key = { it.id }) { category ->
                CategoryCard(category = category)
            }
        }
    }
}

@Composable
private fun CategoryCard(category: CategoryEntity) {
    val color = try {
        Color(android.graphics.Color.parseColor(category.color.ifEmpty { "#84CC16" }))
    } catch (_: Exception) {
        LimonPrimary
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(color.copy(alpha = 0.3f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Category, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
            }
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(category.name, fontWeight = FontWeight.Bold, color = LimonText, fontSize = 18.sp)
                Text("Order: ${category.sortOrder} | Active: ${category.active}", color = LimonTextSecondary, fontSize = 12.sp)
            }
        }
    }
}
