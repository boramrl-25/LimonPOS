package com.limonpos.app.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.repository.ApiSyncRepository
import com.limonpos.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val apiSyncRepository: ApiSyncRepository
) : ViewModel() {

    val userRole: StateFlow<String?> = authRepository.getCurrentUserRole()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val isManager: StateFlow<Boolean> = authRepository.getCurrentUserRole()
        .map { it in listOf("manager", "admin", "supervisor") }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun clearMessage() { _message.value = null }

    fun clearLocalSales() {
        viewModelScope.launch {
            apiSyncRepository.clearLocalSales()
            _message.value = "Local sales cleared"
        }
    }

    /** Clears local sales only for orders created between fromDate and toDate (inclusive). Dates in yyyy-MM-dd. */
    fun clearLocalSalesInDateRange(fromDateStr: String, toDateStr: String) {
        viewModelScope.launch {
            val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            val fromDate = try { fmt.parse(fromDateStr.trim()) } catch (_: Exception) { null }
            val toDate = try { fmt.parse(toDateStr.trim()) } catch (_: Exception) { null }
            if (fromDate == null || toDate == null) {
                _message.value = "Invalid date format (use YYYY-MM-DD)"
                return@launch
            }
            val (fromMs, toMs) = withContext(Dispatchers.Default) {
                val fromCal = Calendar.getInstance(Locale.getDefault()).apply {
                    time = fromDate
                    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
                }
                val toCal = Calendar.getInstance(Locale.getDefault()).apply {
                    time = toDate
                    set(Calendar.HOUR_OF_DAY, 23); set(Calendar.MINUTE, 59); set(Calendar.SECOND, 59); set(Calendar.MILLISECOND, 999)
                }
                Pair(fromCal.timeInMillis, toCal.timeInMillis)
            }
            if (fromMs > toMs) {
                _message.value = "From date must be before To date"
                return@launch
            }
            apiSyncRepository.clearLocalSalesInDateRange(fromMs, toMs)
            _message.value = "Sales in date range cleared"
        }
    }

    fun logout() {
        viewModelScope.launch { authRepository.logout() }
    }
}
