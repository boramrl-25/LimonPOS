package com.limonpos.app.ui.screens.voidreport

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.local.dao.VoidLogDao
import com.limonpos.app.data.local.entity.VoidLogEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

@HiltViewModel
class VoidReportViewModel @Inject constructor(
    private val voidLogDao: VoidLogDao
) : ViewModel() {

    private val _voids = MutableStateFlow<List<VoidLogEntity>>(emptyList())
    val voids: StateFlow<List<VoidLogEntity>> = _voids.asStateFlow()

    private val _filterType = MutableStateFlow<String?>(null)
    val filterType: StateFlow<String?> = _filterType.asStateFlow()

    fun loadVoids() {
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) {
                _filterType.value?.let { type ->
                    voidLogDao.getVoidsByType(type)
                } ?: voidLogDao.getAllVoids()
            }
            _voids.value = list
        }
    }

    fun setFilterType(type: String?) {
        _filterType.value = type
        loadVoids()
    }
}
