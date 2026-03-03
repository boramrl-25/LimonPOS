package com.limonpos.app.ui.screens.dailysales

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.CategorySaleRow
import com.limonpos.app.data.local.entity.ItemSaleRow
import com.limonpos.app.data.local.entity.VoidLogEntity
import com.limonpos.app.data.repository.RecallPaymentDetail
import com.limonpos.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DailySalesScreen(
    viewModel: DailySalesViewModel = hiltViewModel(),
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(Unit) { viewModel.loadDailySales() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Daily Sales", fontWeight = FontWeight.Bold, color = LimonText) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = LimonPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = LimonSurface,
                    titleContentColor = LimonText
                )
            )
        }
    ) { padding ->
        if (state.isLoading && state.categorySales.isEmpty() && state.itemSales.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = LimonPrimary)
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Text(
                        "Today's summary",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = LimonText
                    )
                }
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        SummaryCard(
                            title = "Total Cash",
                            amount = state.totalCash,
                            modifier = Modifier.weight(1f)
                        )
                        SummaryCard(
                            title = "Total Card",
                            amount = state.totalCard,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
                item {
                    SummaryCard(
                        title = "Total Sales",
                        amount = state.totalCash + state.totalCard,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                item {
                    SummaryCard(
                        title = "Total Void",
                        amount = state.totalVoidAmount,
                        modifier = Modifier.fillMaxWidth(),
                        isVoid = true
                    )
                }
                item {
                    SummaryCard(
                        title = "Refund Total",
                        amount = state.totalRefundAmount,
                        modifier = Modifier.fillMaxWidth(),
                        isVoid = true
                    )
                }

                if (state.recallPaymentDetails.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Payment method changed (Recall)",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = LimonText
                        )
                    }
                    items(state.recallPaymentDetails) { detail ->
                        RecallPaymentCard(detail = detail)
                    }
                }

                if (state.refunds.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Refund details",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = LimonText
                        )
                    }
                    items(state.refunds) { log ->
                        RefundDetailCard(log = log)
                    }
                }

                if (state.voids.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Void details",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = LimonText
                        )
                    }
                    items(state.voids) { log ->
                        VoidDetailCard(log = log)
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Category Sales",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = LimonText
                    )
                }
                if (state.categorySales.isEmpty()) {
                    item {
                        Text("No category sales today", color = LimonTextSecondary, fontSize = 14.sp)
                    }
                } else {
                    items(state.categorySales) { row ->
                        CategorySaleCard(row = row)
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Item Sales",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = LimonText
                    )
                }
                if (state.itemSales.isEmpty()) {
                    item {
                        Text("No item sales today", color = LimonTextSecondary, fontSize = 14.sp)
                    }
                } else {
                    items(state.itemSales) { row ->
                        ItemSaleCard(row = row)
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCard(
    title: String,
    amount: Double,
    modifier: Modifier = Modifier,
    isVoid: Boolean = false
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                title,
                fontSize = 14.sp,
                color = LimonTextSecondary
            )
            Text(
                "%.2f".format(amount),
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = if (isVoid) LimonError else LimonText
            )
        }
    }
}

@Composable
private fun RefundDetailCard(log: VoidLogEntity) {
    val timeStr = try {
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(log.createdAt))
    } catch (_: Exception) { "" }
    val isFullRefund = log.type == "refund_full"
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = LimonSurface)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    if (isFullRefund) "Full Bill Refund" else "Refund",
                    fontWeight = FontWeight.Medium,
                    color = LimonText,
                    fontSize = 14.sp
                )
                Text(timeStr, color = LimonTextSecondary, fontSize = 12.sp)
            }
            if (!isFullRefund && log.productName.isNotEmpty()) {
                Text("${log.productName} x${log.quantity}", color = LimonTextSecondary, fontSize = 13.sp)
            }
            if (isFullRefund && log.sourceTableNumber?.isNotEmpty() == true) {
                Text("Table ${log.sourceTableNumber}", color = LimonTextSecondary, fontSize = 13.sp)
            }
            Text("Amount: %.2f".format(log.amount), color = LimonError, fontSize = 13.sp)
            Text("By: ${log.userName}", color = LimonTextSecondary, fontSize = 12.sp)
        }
    }
}

@Composable
private fun RecallPaymentCard(detail: RecallPaymentDetail) {
    val timeStr = try {
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(detail.createdAt))
    } catch (_: Exception) { "" }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = LimonSurface)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Recall", fontWeight = FontWeight.Medium, color = LimonText, fontSize = 14.sp)
                Text(timeStr, color = LimonTextSecondary, fontSize = 12.sp)
            }
            Text("Table ${detail.sourceTableNumber} → ${detail.targetTableNumber}", color = LimonTextSecondary, fontSize = 13.sp)
            Text("Total reversed: %.2f".format(detail.totalReversed), color = LimonError, fontSize = 13.sp)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("Cash: %.2f".format(detail.cashReversed), color = LimonTextSecondary, fontSize = 12.sp)
                Text("Card: %.2f".format(detail.cardReversed), color = LimonTextSecondary, fontSize = 12.sp)
            }
            Text("By: ${detail.userName}", color = LimonTextSecondary, fontSize = 12.sp)
        }
    }
}

@Composable
private fun VoidDetailCard(log: VoidLogEntity) {
    val typeLabel = when (log.type) {
        "pre_void" -> "Pre-Void"
        "post_void" -> "Post-Void"
        "recalled_void" -> "Recalled Bill"
        else -> log.type
    }
    val timeStr = try {
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(log.createdAt))
    } catch (_: Exception) { "" }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = LimonSurface)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(typeLabel, fontWeight = FontWeight.Medium, color = LimonText, fontSize = 14.sp)
                Text(timeStr, color = LimonTextSecondary, fontSize = 12.sp)
            }
            if (log.productName.isNotEmpty()) {
                Text("${log.productName} x${log.quantity}", color = LimonTextSecondary, fontSize = 13.sp)
            }
            Text("Amount: %.2f".format(log.amount), color = LimonError, fontSize = 13.sp)
            if (log.details.isNotEmpty()) {
                Text(log.details, color = LimonTextSecondary, fontSize = 12.sp)
            }
            Text("By: ${log.userName}", color = LimonTextSecondary, fontSize = 12.sp)
        }
    }
}

@Composable
private fun CategorySaleCard(row: CategorySaleRow) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = LimonSurface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    row.categoryName ?: row.categoryId,
                    fontWeight = FontWeight.Medium,
                    color = LimonText,
                    fontSize = 14.sp
                )
                Text("Qty: ${row.totalQuantity}", color = LimonTextSecondary, fontSize = 12.sp)
            }
            Text(
                "%.2f".format(row.totalAmount),
                fontWeight = FontWeight.Bold,
                color = LimonPrimary,
                fontSize = 16.sp
            )
        }
    }
}

@Composable
private fun ItemSaleCard(row: ItemSaleRow) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = LimonSurface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    row.productName,
                    fontWeight = FontWeight.Medium,
                    color = LimonText,
                    fontSize = 14.sp
                )
                Text("x${row.totalQuantity}", color = LimonTextSecondary, fontSize = 12.sp)
            }
            Text(
                "%.2f".format(row.totalAmount),
                fontWeight = FontWeight.Bold,
                color = LimonPrimary,
                fontSize = 14.sp
            )
        }
    }
}
