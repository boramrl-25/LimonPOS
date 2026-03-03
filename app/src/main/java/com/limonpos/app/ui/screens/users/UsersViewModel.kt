package com.limonpos.app.ui.screens.users

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.entity.UserEntity
import com.limonpos.app.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class UsersViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val apiSyncRepository: com.limonpos.app.data.repository.ApiSyncRepository
) : ViewModel() {

    val users = userRepository.getAllUsers()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            if (apiSyncRepository.isOnline()) apiSyncRepository.syncFromApi()
        }
    }

    private val _showAddDialog = MutableStateFlow(false)
    val showAddDialog: StateFlow<Boolean> = _showAddDialog.asStateFlow()

    private val _editingUser = MutableStateFlow<UserEntity?>(null)
    val editingUser: StateFlow<UserEntity?> = _editingUser.asStateFlow()

    fun showAddUserDialog() {
        _showAddDialog.value = true
    }

    fun dismissAddDialog() {
        _showAddDialog.value = false
    }

    fun showEditUserDialog(user: UserEntity) {
        _editingUser.value = user
    }

    fun dismissEditDialog() {
        _editingUser.value = null
    }

    fun addUser(name: String, pin: String, role: String, active: Boolean, cashDrawerPermission: Boolean) {
        viewModelScope.launch {
            val user = UserEntity(
                id = UUID.randomUUID().toString(),
                name = name,
                pin = pin,
                role = role,
                active = active,
                cashDrawerPermission = cashDrawerPermission
            )
            userRepository.insertUser(user)
        }
    }

    fun updateUser(user: UserEntity) {
        viewModelScope.launch {
            userRepository.updateUser(user)
        }
    }

    fun deleteUser(user: UserEntity) {
        viewModelScope.launch {
            userRepository.deleteUser(user)
        }
    }
}
