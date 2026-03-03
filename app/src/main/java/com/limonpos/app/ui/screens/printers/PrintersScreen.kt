package com.limonpos.app.ui.screens.printers

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.PrinterEntity
import com.limonpos.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrintersScreen(
    viewModel: PrintersViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onSync: () -> Unit = {}
) {
    val printers by viewModel.printers.collectAsState(emptyList())
    val showAddDialog by viewModel.showAddDialog.collectAsState(false)
    val editingPrinter by viewModel.editingPrinter.collectAsState(null)
    val testPrintMessage by viewModel.testPrintMessage.collectAsState(null)
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(testPrintMessage) {
        testPrintMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearTestPrintMessage()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Printer Setup", fontWeight = FontWeight.Bold, color = LimonText)
                        Text("Monitor and configure printers", fontSize = 12.sp, color = LimonTextSecondary)
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
                    IconButton(onClick = { viewModel.showAddPrinterDialog() }) {
                        Icon(Icons.Default.Add, contentDescription = "Add Printer", tint = LimonPrimary)
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
                            DropdownMenuItem(
                                text = { Text("Settings", color = LimonText) },
                                onClick = { menuExpanded = false; onNavigateToSettings() },
                                leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null, tint = LimonPrimary) }
                            )
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
            items(printers, key = { it.id }) { printer ->
                PrinterCard(
                    printer = printer,
                    onEdit = { viewModel.showEditPrinterDialog(printer) },
                    onTestPrint = { viewModel.testPrint(printer) },
                    onDelete = { viewModel.deletePrinter(printer) }
                )
            }
        }
    }

    if (showAddDialog) {
        PrinterEditDialog(
            printer = null,
            onDismiss = { viewModel.dismissAddDialog() },
            onSave = { name, type, ip, port, connectionType, kdsEnabled ->
                viewModel.addPrinter(name, type, ip, port, connectionType, kdsEnabled)
                viewModel.dismissAddDialog()
            }
        )
    }

    editingPrinter?.let { printer ->
        PrinterEditDialog(
            printer = printer,
            onDismiss = { viewModel.dismissEditDialog() },
            onSave = { name, type, ip, port, connectionType, kdsEnabled ->
                viewModel.updatePrinter(printer.copy(name = name, printerType = type, ipAddress = ip, port = port, connectionType = connectionType, kdsEnabled = kdsEnabled))
                viewModel.dismissEditDialog()
            }
        )
    }
}

@Composable
private fun PrinterCard(
    printer: PrinterEntity,
    onEdit: () -> Unit,
    onTestPrint: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = LimonSurface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.Print, contentDescription = null, tint = LimonPrimary, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.height(8.dp))
                    Text(printer.name, fontWeight = FontWeight.Bold, color = LimonText, fontSize = 18.sp)
                    Text("Type: ${printer.printerType}", color = LimonTextSecondary, fontSize = 14.sp)
                    if (printer.printerType.equals("kitchen", ignoreCase = true)) {
                        Text("KDS: ${if (printer.kdsEnabled) "On" else "Off"}", color = LimonTextSecondary, fontSize = 14.sp)
                    }
                    Text("IP Address: ${printer.ipAddress}", color = LimonTextSecondary, fontSize = 14.sp)
                    Text("Connection: ${printer.connectionType}", color = LimonTextSecondary, fontSize = 14.sp)
                    Text("Pending Jobs: 0", color = LimonTextSecondary, fontSize = 14.sp)
                    Text(printer.status, color = if (printer.status == "online") LimonSuccess else LimonTextSecondary, fontSize = 12.sp)
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onEdit) { Text("Edit Printer") }
                OutlinedButton(onClick = onTestPrint) { Text("Test Print") }
                OutlinedButton(onClick = onDelete, colors = ButtonDefaults.outlinedButtonColors(contentColor = LimonError)) { Text("Delete") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PrinterEditDialog(
    printer: PrinterEntity?,
    onDismiss: () -> Unit,
    onSave: (name: String, printerType: String, ipAddress: String, port: Int, connectionType: String, kdsEnabled: Boolean) -> Unit
) {
    var name by remember { mutableStateOf(printer?.name ?: "") }
    var printerType by remember { mutableStateOf(printer?.printerType ?: "kitchen") }
    var kdsEnabled by remember { mutableStateOf(printer?.kdsEnabled ?: true) }
    var ipAddress by remember { mutableStateOf(printer?.ipAddress ?: "") }
    var portStr by remember { mutableStateOf(printer?.port?.toString() ?: "9100") }
    var connectionType by remember { mutableStateOf(printer?.connectionType ?: "network") }
    var typeExpanded by remember { mutableStateOf(false) }
    var connExpanded by remember { mutableStateOf(false) }
    val typeOptions = listOf("kitchen" to "Kitchen", "bar" to "Bar", "cashier" to "Cashier")
    val connOptions = listOf("network" to "Network (LAN/Wi-Fi)")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (printer == null) "Add Printer" else "Edit Printer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Printer Name") }, modifier = Modifier.fillMaxWidth())
                ExposedDropdownMenuBox(expanded = typeExpanded, onExpandedChange = { typeExpanded = it }) {
                    OutlinedTextField(
                        value = typeOptions.find { it.first == printerType }?.second ?: printerType,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Printer Type") },
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeExpanded) }
                    )
                    ExposedDropdownMenu(expanded = typeExpanded, onDismissRequest = { typeExpanded = false }) {
                        typeOptions.forEach { (v, label) ->
                            DropdownMenuItem(text = { Text(label) }, onClick = { printerType = v; typeExpanded = false })
                        }
                    }
                }
                OutlinedTextField(
                    value = ipAddress,
                    onValueChange = { ipAddress = it },
                    label = { Text("IP Address") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri)
                )
                OutlinedTextField(
                    value = portStr,
                    onValueChange = { if (it.all { c -> c.isDigit() }) portStr = it },
                    label = { Text("Port") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                ExposedDropdownMenuBox(expanded = connExpanded, onExpandedChange = { connExpanded = it }) {
                    OutlinedTextField(
                        value = connOptions.find { it.first == connectionType }?.second ?: "Network (LAN/Wi-Fi)",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Connection Type") },
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = connExpanded) }
                    )
                    ExposedDropdownMenu(expanded = connExpanded, onDismissRequest = { connExpanded = false }) {
                        connOptions.forEach { (v, label) ->
                            DropdownMenuItem(text = { Text(label) }, onClick = { connectionType = v; connExpanded = false })
                        }
                    }
                }
                if (printerType.equals("kitchen", ignoreCase = true)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("KDS Enable", color = LimonText)
                        Switch(checked = kdsEnabled, onCheckedChange = { kdsEnabled = it })
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val port = portStr.toIntOrNull() ?: 9100
                onSave(name, printerType, ipAddress, port, connectionType, kdsEnabled)
            }) {
                Text("Save Changes", color = LimonPrimary, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = LimonTextSecondary)
            }
        },
        containerColor = LimonSurface
    )
}
