package com.limonpos.app.ui.screens.users

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.limonpos.app.data.local.entity.UserEntity
import com.limonpos.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsersScreen(
    viewModel: UsersViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onNavigateToFloorPlan: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    canAccessSettings: Boolean = true,
    onSync: () -> Unit = {}
) {
    val users by viewModel.users.collectAsState(emptyList())
    val showAddDialog by viewModel.showAddDialog.collectAsState(false)
    val editingUser by viewModel.editingUser.collectAsState(null)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Users", fontWeight = FontWeight.Bold, color = LimonText) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = LimonText)
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToFloorPlan) {
                        Icon(Icons.Default.Home, contentDescription = "Home", tint = LimonPrimary)
                    }
                    IconButton(onClick = { viewModel.showAddUserDialog() }) {
                        Icon(Icons.Default.Add, contentDescription = "Add User", tint = LimonPrimary)
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
            items(users, key = { it.id }) { user ->
                UserCard(
                    user = user,
                    onEdit = { viewModel.showEditUserDialog(user) },
                    onDelete = { viewModel.deleteUser(user) }
                )
            }
        }
    }

    if (showAddDialog) {
        UserEditDialog(
            user = null,
            onDismiss = { viewModel.dismissAddDialog() },
            onSave = { name, pin, role, active, cashDrawerPermission ->
                viewModel.addUser(name, pin, role, active, cashDrawerPermission)
                viewModel.dismissAddDialog()
            }
        )
    }

    editingUser?.let { user ->
        UserEditDialog(
            user = user,
            onDismiss = { viewModel.dismissEditDialog() },
            onSave = { name, pin, role, active, cashDrawerPermission ->
                viewModel.updateUser(user.copy(name = name, pin = pin, role = role, active = active, cashDrawerPermission = cashDrawerPermission))
                viewModel.dismissEditDialog()
            }
        )
    }
}

@Composable
private fun UserCard(
    user: UserEntity,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
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
                Text(user.name, fontWeight = FontWeight.Bold, color = LimonText, fontSize = 18.sp)
                Text("PIN: ${user.pin}", color = LimonTextSecondary, fontSize = 14.sp)
                Text("Role: ${user.role}", color = LimonTextSecondary, fontSize = 14.sp)
                Text(if (user.active) "Active" else "Inactive", color = if (user.active) LimonSuccess else LimonError, fontSize = 12.sp)
                if (user.cashDrawerPermission) {
                    Text("Cash Drawer: Yes", color = LimonPrimary, fontSize = 12.sp)
                }
            }
            Row {
                IconButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = "Edit", tint = LimonPrimary, modifier = Modifier.size(20.dp))
                }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = LimonError, modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

@Composable
private fun UserEditDialog(
    user: UserEntity?,
    onDismiss: () -> Unit,
    onSave: (name: String, pin: String, role: String, active: Boolean, cashDrawerPermission: Boolean) -> Unit
) {
    var name by remember { mutableStateOf(user?.name ?: "") }
    var pin by remember { mutableStateOf(user?.pin ?: "") }
    var role by remember { mutableStateOf(user?.role ?: "waiter") }
    var active by remember { mutableStateOf(user?.active ?: true) }
    var cashDrawerPermission by remember { mutableStateOf(user?.cashDrawerPermission ?: false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (user == null) "Add User" else "Edit User") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = pin, onValueChange = { if (it.length <= 4 && it.all { c -> c.isDigit() }) pin = it }, label = { Text("PIN (4 digits)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = role, onValueChange = { role = it }, label = { Text("Role (admin/manager/waiter/cashier)") }, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Active", color = LimonText, modifier = Modifier.weight(1f))
                    Switch(checked = active, onCheckedChange = { active = it })
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Cash Drawer Permission", color = LimonText, modifier = Modifier.weight(1f))
                    Switch(checked = cashDrawerPermission, onCheckedChange = { cashDrawerPermission = it })
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(name, pin, role, active, cashDrawerPermission) }) {
                Text("Save", color = LimonPrimary, fontWeight = FontWeight.Bold)
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
