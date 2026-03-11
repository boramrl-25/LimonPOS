package com.limonpos.app.ui.screens.products

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.ProductEntity
import com.limonpos.app.ui.theme.*
import com.limonpos.app.util.CurrencyUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductsScreen(
    viewModel: ProductsViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    canAccessSettings: Boolean = true,
    onSync: () -> Unit = {}
) {
    val products by viewModel.products.collectAsState(emptyList())
    val categories by viewModel.categories.collectAsState(emptyList())
    val categoryMap = remember(categories) { categories.associateBy { it.id } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Products", fontWeight = FontWeight.Bold, color = LimonText)
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
            items(products, key = { it.id }) { product ->
                val categoryName = categoryMap[product.categoryId]?.name ?: "-"
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = LimonSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.Inventory, contentDescription = null, tint = LimonPrimary, modifier = Modifier.size(24.dp))
                            Spacer(Modifier.height(8.dp))
                            Text(product.name, fontWeight = FontWeight.Bold, color = LimonText, fontSize = 18.sp)
                            Text("Category: $categoryName", color = LimonTextSecondary, fontSize = 14.sp)
                            Text(CurrencyUtils.format(product.price), color = LimonPrimary, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                            Text("Till: ${if (product.showInTill) "On" else "Off"}", color = LimonTextSecondary, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}
