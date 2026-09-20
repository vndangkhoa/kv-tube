package com.kvtube.android.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.BuildConfig
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.api.PairApi
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.update.UpdateInfo
import com.kvtube.android.data.update.UpdateManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.io.File
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
    val updateError: String? = null,
    val isTestingConnection: Boolean = false,
    val testSuccess: Boolean? = null,
    val testStatus: String? = null,
    val testLatencyMs: Long? = null,
    val testTroubleshootTip: String? = null,
    val saveMessage: String? = null,
    val cacheSizeBytes: Long = 0L
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settingsDataStore: SettingsDataStore,
    private val api: KVApi,
    private val pairApi: PairApi,
    private val updateManager: UpdateManager,
    private val subscriptionRepository: com.kvtube.android.data.repository.SubscriptionRepository,
    private val playbackManager: com.kvtube.android.player.PlaybackManager
) : ViewModel() {

    companion object {
        /** Pairing codes live on the KV-Tube web frontend, not on raw
         *  Invidious — fall back to the production web instance like the TV app. */
        const val PAIR_FALLBACK_BASE = "https://ut.khoavo.myds.me"
    }

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val sUrl = settingsDataStore.serverUrl.first()
            val sToken = settingsDataStore.invidiousToken.first()
            val sTheme = settingsDataStore.themeMode.first()
            val sRegion = settingsDataStore.region.first()

            _uiState.value = SettingsUiState(
                serverUrl = sUrl,
                invidiousToken = sToken,
                themeMode = sTheme,
                region = sRegion
            )
            refreshCacheSize()
            if (sUrl.isNotBlank()) {
                testConnection(sUrl)
            }
        }
    }

    fun saveServerUrl(url: String) {
        val clean = KVApi.normalizeUrl(url)
        viewModelScope.launch {
            settingsDataStore.setServerUrl(clean)
            api.setServerUrl(clean)
            com.kvtube.android.data.local.ThumbnailRouter.setServer(clean, api.isGateway())
            subscriptionRepository.clearCache()
            playbackManager.stopAndClear()
            _uiState.value = _uiState.value.copy(serverUrl = clean, saveMessage = "Server URL saved")
        }
    }

    fun saveInvidiousToken(token: String) {
        val clean = token.trim()
        viewModelScope.launch {
            settingsDataStore.setInvidiousToken(clean)
            api.setToken(clean)
            subscriptionRepository.clearCache()
            _uiState.value = _uiState.value.copy(invidiousToken = clean)
        }
    }

    fun saveSettings(serverUrl: String, token: String) {
        val cleanUrl = KVApi.normalizeUrl(serverUrl)
        val cleanToken = token.trim()
        viewModelScope.launch {
            settingsDataStore.setServerUrl(cleanUrl)
            settingsDataStore.setInvidiousToken(cleanToken)
            api.setServerUrl(cleanUrl)
            api.setToken(cleanToken)
            com.kvtube.android.data.local.ThumbnailRouter.setServer(cleanUrl, api.isGateway())
            subscriptionRepository.clearCache()
            playbackManager.stopAndClear()
            _uiState.value = _uiState.value.copy(
                serverUrl = cleanUrl,
                invidiousToken = cleanToken,
                saveMessage = "Settings saved successfully"
            )
        }
    }

    fun saveAndConnect(serverUrl: String, token: String, onComplete: (Boolean) -> Unit = {}) {
        val cleanUrl = KVApi.normalizeUrl(serverUrl)
        val cleanToken = token.trim()
        if (cleanUrl.isBlank()) {
            _uiState.value = _uiState.value.copy(
                isTestingConnection = false,
                testSuccess = false,
                testStatus = "Enter a server address first",
                testLatencyMs = null,
                testTroubleshootTip = "Please enter your server address (e.g. https://yt.khoavo.vndns.net)."
            )
            onComplete(false)
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isTestingConnection = true,
                testSuccess = null,
                testStatus = "Testing & saving...",
                testLatencyMs = null,
                testTroubleshootTip = null
            )
            val result = api.testServerConnection(cleanUrl)
            if (result.ok) {
                settingsDataStore.setServerUrl(cleanUrl)
                settingsDataStore.setInvidiousToken(cleanToken)
                api.setServerUrl(cleanUrl)
                api.setToken(cleanToken)
                com.kvtube.android.data.local.ThumbnailRouter.setServer(cleanUrl, result.isGateway)
                subscriptionRepository.clearCache()
                playbackManager.stopAndClear()
                _uiState.value = _uiState.value.copy(
                    serverUrl = cleanUrl,
                    invidiousToken = cleanToken,
                    isTestingConnection = false,
                    testSuccess = true,
                    testStatus = result.message,
                    testLatencyMs = result.latencyMs,
                    testTroubleshootTip = null,
                    saveMessage = "Connected & saved successfully"
                )
                onComplete(true)
            } else {
                _uiState.value = _uiState.value.copy(
                    isTestingConnection = false,
                    testSuccess = false,
                    testStatus = result.message,
                    testLatencyMs = null,
                    testTroubleshootTip = result.troubleshootTip
                )
                onComplete(false)
            }
        }
    }

    fun testConnection(url: String) {
        val cleanUrl = KVApi.normalizeUrl(url)
        if (cleanUrl.isBlank()) {
            _uiState.value = _uiState.value.copy(
                isTestingConnection = false,
                testSuccess = false,
                testStatus = "Enter a server address first",
                testLatencyMs = null,
                testTroubleshootTip = "Please enter your server address (e.g. https://yt.khoavo.vndns.net)."
            )
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isTestingConnection = true,
                testSuccess = null,
                testStatus = "Testing connection...",
                testLatencyMs = null,
                testTroubleshootTip = null
            )
            val result = api.testServerConnection(cleanUrl)
            _uiState.value = _uiState.value.copy(
                isTestingConnection = false,
                testSuccess = result.ok,
                testStatus = result.message,
                testLatencyMs = if (result.ok) result.latencyMs else null,
                testTroubleshootTip = result.troubleshootTip
            )
        }
    }

    fun clearSaveMessage() {
        _uiState.value = _uiState.value.copy(saveMessage = null)
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

    fun refreshCacheSize() {
        viewModelScope.launch(Dispatchers.IO) {
            val size = getDirSize(context.cacheDir)
            _uiState.value = _uiState.value.copy(cacheSizeBytes = size)
        }
    }

    fun clearCache() {
        viewModelScope.launch(Dispatchers.IO) {
            deleteDir(context.cacheDir)
            refreshCacheSize()
            _uiState.value = _uiState.value.copy(saveMessage = "Cache cleared successfully")
        }
    }

    private fun getDirSize(dir: File?): Long {
        if (dir == null || !dir.exists()) return 0L
        var size = 0L
        dir.listFiles()?.forEach { file ->
            size += if (file.isDirectory) getDirSize(file) else file.length()
        }
        return size
    }

    private fun deleteDir(dir: File?): Boolean {
        if (dir == null || !dir.exists()) return false
        var deleted = true
        dir.listFiles()?.forEach { file ->
            if (file.isDirectory) {
                deleted = deleted && deleteDir(file)
            } else {
                deleted = deleted && file.delete()
            }
        }
        return deleted
    }

    /** Base URL of the KV-Tube web frontend that brokers pairing codes. */
    fun pairingBaseUrl(): String =
        _uiState.value.serverUrl.trim().removeSuffix("/")
            .ifBlank { PAIR_FALLBACK_BASE }

    // --- Device pairing -------------------------------------------------------

    suspend fun createPairCode(): String = pairApi.createCode(pairingBaseUrl())

    suspend fun checkPairStatus(code: String): PairApi.Status =
        pairApi.checkStatus(pairingBaseUrl(), code)

    /**
     * Receives credentials handed over for [code] and persists them like a
     * manual save (DataStore + live KVApi + thumbnail router).
     */
    fun applyPairedCredentials(url: String?, token: String?) {
        val cleanUrl = url?.trim()?.removeSuffix("/").orEmpty()
        saveServerUrl(cleanUrl)
        saveInvidiousToken(token?.trim().orEmpty())
    }

    /** Pushes this device's saved connection to a code shown elsewhere. */
    suspend fun sendPairing(rawCode: String): PairApi.SendResult {
        val code = rawCode.trim().uppercase().replace(Regex("[^A-Z0-9]"), "")
        if (code.length < 4) return PairApi.SendResult.Error("Enter the 6-character code shown on the other device")
        val state = _uiState.value
        if (state.serverUrl.isBlank()) {
            return PairApi.SendResult.Error("Save a server address first — nothing to send")
        }
        return pairApi.sendCredentials(
            baseUrl = pairingBaseUrl(),
            code = code,
            instanceUrl = state.serverUrl,
            token = state.invidiousToken,
        )
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
