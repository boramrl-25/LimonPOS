package com.limonpos.app.ui.screens.modifiers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.dao.ModifierGroupDao
import com.limonpos.app.data.local.dao.ModifierOptionDao
import com.limonpos.app.data.local.entity.ModifierGroupEntity
import com.limonpos.app.data.local.entity.ModifierOptionEntity
import com.limonpos.app.data.repository.ApiSyncRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ModifierGroupWithOptions(
    val group: ModifierGroupEntity,
    val options: List<ModifierOptionEntity>
)

@HiltViewModel
class ModifiersViewModel @Inject constructor(
    private val modifierGroupDao: ModifierGroupDao,
    private val modifierOptionDao: ModifierOptionDao,
    private val apiSyncRepository: ApiSyncRepository
) : ViewModel() {

    init {
        viewModelScope.launch {
            if (apiSyncRepository.isOnline()) apiSyncRepository.syncFromApi()
        }
    }

    val modifierGroupsWithOptions = combine(
        modifierGroupDao.getAllModifierGroups(),
        modifierOptionDao.getAllModifierOptions()
    ) { groups, allOptions ->
        groups.map { group ->
            ModifierGroupWithOptions(group, allOptions.filter { it.modifierGroupId == group.id })
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
