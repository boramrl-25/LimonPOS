package com.limonpos.app.ui.screens.serversettings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.limonpos.app.data.prefs.ServerPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@HiltViewModel
class ServerSettingsViewModel @Inject constructor(
    private val serverPreferences: ServerPreferences
) : ViewModel() {

    val baseUrl = serverPreferences.baseUrl.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        ServerPreferences.DEFAULT_BASE_URL
    )
    val secondaryBaseUrl = serverPreferences.secondaryBaseUrl.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        ""
    )
    val tertiaryBaseUrl = serverPreferences.tertiaryBaseUrl.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        ""
    )

    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()

    private val _testing = MutableStateFlow(false)
    val testing = _testing.asStateFlow()

    fun saveUrl(url: String, secondary: String? = null, tertiary: String? = null) {
        viewModelScope.launch {
            try {
                serverPreferences.setBaseUrl(url)
                serverPreferences.setSecondaryBaseUrl(secondary)
                serverPreferences.setTertiaryBaseUrl(tertiary)
                _message.update { "Saved. Changes apply immediately." }
            } catch (e: Exception) {
                _message.update { "Error: ${e.message}" }
            }
        }
    }

    /** Verilen URL'ye GET /health atar; başarılıysa "Bağlantı başarılı!", değilse hata mesajı gösterir. */
    fun testConnection(url: String) {
        viewModelScope.launch {
            _testing.update { true }
            _message.update { null }
            val result = withContext(Dispatchers.IO) {
                val base = url.trim().removeSuffix("/") + "/"
                val healthUrl = base + "health"
                try {
                    val client = OkHttpClient.Builder()
                        .connectTimeout(10, TimeUnit.SECONDS)
                        .readTimeout(10, TimeUnit.SECONDS)
                        .build()
                    val request = Request.Builder().url(healthUrl).build()
                    val response = client.newCall(request).execute()
                    if (response.isSuccessful) "Connection successful!" else "Server error: ${response.code}"
                } catch (e: Exception) {
                    "Cannot connect: ${e.message}"
                }
            }
            _message.update { result }
            _testing.update { false }
        }
    }

    fun clearMessage() {
        _message.update { null }
    }
}
