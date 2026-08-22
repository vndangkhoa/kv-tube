package com.kvtube.android.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.BuildConfig
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.update.UpdateInfo
import com.kvtube.android.data.update.UpdateManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val serverUrl: String = "",
    val invidiousToken: String = "",
    val themeMode: String = "dark",
    val region: String = "GLOBAL",
    val updateInfo: UpdateInfo? = null,
    val isCheckingUpdate: Boolean = false,
    val isDownloading: Boolean = false,
    val downloadProgress: Float = 0f,
    val updateError: String? = null
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settingsDataStore: SettingsDataStore,
    private val api: KVApi,
    private val updateManager: UpdateManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            _uiState.value = SettingsUiState(
                serverUrl = settingsDataStore.serverUrl.first(),
                invidiousToken = settingsDataStore.invidiousToken.first(),
                themeMode = settingsDataStore.themeMode.first(),
                region = settingsDataStore.region.first()
            )
        }
    }

    fun saveServerUrl(url: String) {
        viewModelScope.launch {
            settingsDataStore.setServerUrl(url)
            api.setServerUrl(url)
            _uiState.value = _uiState.value.copy(serverUrl = url)
        }
    }

    fun saveInvidiousToken(token: String) {
        viewModelScope.launch {
            settingsDataStore.setInvidiousToken(token)
            api.setToken(token)
            _uiState.value = _uiState.value.copy(invidiousToken = token)
        }
    }

    fun setThemeMode(mode: String) {
        viewModelScope.launch {
            settingsDataStore.setThemeMode(mode)
            _uiState.value = _uiState.value.copy(themeMode = mode)
        }
    }

    fun setRegion(region: String) {
        viewModelScope.launch {
            settingsDataStore.setRegion(region)
            _uiState.value = _uiState.value.copy(region = region)
        }
    }

    fun checkForUpdate() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isCheckingUpdate = true,
                updateError = null,
                updateInfo = null
            )
            val info = updateManager.checkForUpdate(BuildConfig.VERSION_NAME)
            _uiState.value = _uiState.value.copy(
                isCheckingUpdate = false,
                updateInfo = info,
                updateError = if (info == null) "Failed to check for updates" else null
            )
        }
    }

    fun downloadUpdate() {
        val url = _uiState.value.updateInfo?.downloadUrl ?: return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isDownloading = true,
                downloadProgress = 0f
            )
            val file = updateManager.downloadUpdate(url) { progress ->
                _uiState.value = _uiState.value.copy(downloadProgress = progress)
            }
            if (file != null) {
                _uiState.value = _uiState.value.copy(
                    isDownloading = false,
                    downloadProgress = 1f
                )
                updateManager.installApk(file)
            } else {
                _uiState.value = _uiState.value.copy(
                    isDownloading = false,
                    updateError = "Download failed"
                )
            }
        }
    }
}
