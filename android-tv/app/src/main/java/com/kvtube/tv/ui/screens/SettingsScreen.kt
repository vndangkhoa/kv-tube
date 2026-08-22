package com.kvtube.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.compose.ui.platform.LocalContext
import com.kvtube.tv.BuildConfig
import com.kvtube.tv.data.local.tvDataStore
import com.kvtube.tv.data.model.TvUpdateInfo
import com.kvtube.tv.data.repository.TvUpdateManager
import kotlinx.coroutines.launch
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.flow.first
import java.io.File

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    var instanceUrl by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }

    // Update states
    var checkingUpdate by remember { mutableStateOf(false) }
    var updateInfo by remember { mutableStateOf<TvUpdateInfo?>(null) }
    var updateMessage by remember { mutableStateOf<String?>(null) }
    var downloading by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableStateOf(0f) }
    var downloadedFile by remember { mutableStateOf<File?>(null) }

    val currentVersion = remember { "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})" }
    val currentVersionName = remember { BuildConfig.VERSION_NAME }

    LaunchedEffect(Unit) {
        val prefs = ctx.tvDataStore.data.first()
        instanceUrl = prefs[stringPreferencesKey("kv_invidious_instance")] ?: "https://yt.khoavo.myds.me"
        token = prefs[stringPreferencesKey("kv_invidious_token")] ?: ""
        loaded = true
        com.kvtube.tv.data.api.ApiClient.baseUrl = if (instanceUrl.endsWith("/")) instanceUrl else "$instanceUrl/"
        com.kvtube.tv.data.api.ApiClient.token = token.ifBlank { null }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
            .verticalScroll(rememberScrollState())
            .padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Text("Settings", color = Color.White, style = MaterialTheme.typography.headlineSmall)

        // --- App Info & Update Section ---
        Card(
            modifier = Modifier.fillMaxWidth(0.85f),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E1E))
        ) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("KV-Tube TV", color = Color.White, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                Text("Version $currentVersion", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                Text(
                    "Check for updates from GitHub / Forgejo. Download and install the latest APK directly on your TV (requires “Install unknown apps” permission).",
                    color = Color(0xFF888888),
                    style = MaterialTheme.typography.labelSmall
                )

                // Status / update info
                updateInfo?.let { info ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF2A2A2A))
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Update available: v${info.latestVersion}", color = Color(0xFFFF6B6B), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                            Text("Installed: v${info.currentVersion}", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.labelSmall)
                            if (info.releaseNotes.isNotBlank()) {
                                Text(
                                    info.releaseNotes.take(400),
                                    color = Color(0xFFE0E0E0),
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 4
                                )
                            }
                            Text("Download: ${info.downloadUrl}", color = Color(0xFF888888), style = MaterialTheme.typography.labelSmall, maxLines = 1)
                        }
                    }
                }
                updateMessage?.let { msg ->
                    Text(msg, color = if (msg.startsWith("✓") || msg.contains("available")) Color(0xFF4CAF50) else Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                }
                if (downloading) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        LinearProgressIndicator(progress = { downloadProgress.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                        Text("Downloading ${(downloadProgress * 100).toInt()}% …", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.labelSmall)
                    }
                }
                downloadedFile?.let { file ->
                    Text("Downloaded to ${file.name} (${file.length() / 1024} KB) — ready to install.", color = Color(0xFF4CAF50), style = MaterialTheme.typography.labelSmall)
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(
                        onClick = {
                            if (checkingUpdate || downloading) return@Button
                            scope.launch {
                                checkingUpdate = true
                                updateInfo = null
                                updateMessage = null
                                downloadedFile = null
                                try {
                                    val info = TvUpdateManager.checkForUpdate(currentVersionName)
                                    if (info != null) {
                                        updateInfo = info
                                        updateMessage = "✓ Update found: v${info.latestVersion} (tag ${info.tagName})"
                                        snackbar.showSnackbar("Update available: v${info.latestVersion}")
                                    } else {
                                        updateMessage = "✓ You are on the latest version (v$currentVersionName)"
                                        snackbar.showSnackbar("No update available")
                                    }
                                } catch (e: Exception) {
                                    updateMessage = "Check failed: ${e.message}"
                                    snackbar.showSnackbar("Update check failed: ${e.message}")
                                } finally {
                                    checkingUpdate = false
                                }
                            }
                        },
                        enabled = !checkingUpdate && !downloading
                    ) {
                        Text(if (checkingUpdate) "Checking…" else "Check for update")
                    }

                    // Download button (visible when updateInfo present)
                    if (updateInfo != null && !downloading && downloadedFile == null) {
                        OutlinedButton(
                            onClick = {
                                val info = updateInfo ?: return@OutlinedButton
                                scope.launch {
                                    downloading = true
                                    downloadProgress = 0f
                                    updateMessage = null
                                    try {
                                        val file = TvUpdateManager.downloadUpdate(ctx, info.downloadUrl) { prog ->
                                            downloadProgress = prog
                                        }
                                        if (file != null) {
                                            downloadedFile = file
                                            updateMessage = "✓ Download complete"
                                            snackbar.showSnackbar("Download complete — tap Install")
                                        } else {
                                            updateMessage = "Download failed — check URL or try manual download from GitHub"
                                            snackbar.showSnackbar("Download failed")
                                        }
                                    } catch (e: Exception) {
                                        updateMessage = "Download error: ${e.message}"
                                    } finally {
                                        downloading = false
                                    }
                                }
                            }
                        ) { Text("Download") }
                    }

                    // Install button (visible after download)
                    if (downloadedFile != null) {
                        Button(
                            onClick = {
                                val file = downloadedFile ?: return@Button
                                val ok = TvUpdateManager.installApk(ctx, file)
                                if (!ok) {
                                    scope.launch { snackbar.showSnackbar("Install failed — enable 'Install unknown apps' for KV-Tube TV in system Settings") }
                                }
                            }
                        ) { Text("Install") }
                    }
                }
                if (updateInfo != null && downloadedFile == null) {
                    Text("If download fails (no TV APK asset in release), open GitHub releases page manually: github.com/vndangkhoa/kv-tube", color = Color(0xFF888888), style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        // --- Invidious Section ---
        Text("Invidious Backend", color = Color.White, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
        Text("Invidious instance & token — same origin as the web frontend (Settings → Invidious Setup).", style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFFAAAAAA)))

        if (!loaded) {
            Text("Loading…", color = Color.White)
        } else {
            OutlinedTextField(
                value = instanceUrl,
                onValueChange = { instanceUrl = it },
                label = { Text("Invidious instance URL", color = Color(0xFFAAAAAA)) },
                placeholder = { Text("https://yt.khoavo.myds.me", color = Color(0xFF6E6E6E)) },
                modifier = Modifier.fillMaxWidth(0.85f),
                singleLine = true,
                colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White,
                    focusedBorderColor = Color.White.copy(alpha = 0.5f),
                    unfocusedBorderColor = Color.White.copy(alpha = 0.22f),
                    focusedContainerColor = Color(0xFF212121),
                    unfocusedContainerColor = Color(0xFF212121),
                    focusedLabelColor = Color(0xFFAAAAAA),
                    unfocusedLabelColor = Color(0xFFAAAAAA),
                    focusedPlaceholderColor = Color(0xFF6E6E6E),
                    unfocusedPlaceholderColor = Color(0xFF6E6E6E),
                ),
            )
            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("Invidious token (SID or Bearer JSON) — optional", color = Color(0xFFAAAAAA)) },
                placeholder = { Text("Paste token from web Settings", color = Color(0xFF6E6E6E)) },
                modifier = Modifier.fillMaxWidth(0.85f),
                singleLine = true,
                colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White,
                    focusedBorderColor = Color.White.copy(alpha = 0.5f),
                    unfocusedBorderColor = Color.White.copy(alpha = 0.22f),
                    focusedContainerColor = Color(0xFF212121),
                    unfocusedContainerColor = Color(0xFF212121),
                    focusedLabelColor = Color(0xFFAAAAAA),
                    unfocusedLabelColor = Color(0xFFAAAAAA),
                    focusedPlaceholderColor = Color(0xFF6E6E6E),
                    unfocusedPlaceholderColor = Color(0xFF6E6E6E),
                ),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = {
                    scope.launch {
                        ctx.tvDataStore.edit {
                            it[stringPreferencesKey("kv_invidious_instance")] = instanceUrl.trim().removeSuffix("/")
                            if (token.isBlank()) it.remove(stringPreferencesKey("kv_invidious_token"))
                            else it[stringPreferencesKey("kv_invidious_token")] = token.trim()
                        }
                        com.kvtube.tv.data.api.ApiClient.baseUrl = if (instanceUrl.trim().endsWith("/")) instanceUrl.trim() else "${instanceUrl.trim()}/"
                        com.kvtube.tv.data.api.ApiClient.token = token.trim().ifBlank { null }
                        snackbar.showSnackbar("Saved — restart Home to refresh feed")
                    }
                }) { Text("Save") }
                OutlinedButton(onClick = {
                    scope.launch {
                        try {
                            val r = com.kvtube.tv.data.api.ApiClient.api.getTrending("VN")
                            snackbar.showSnackbar("Connected — trending: ${r.size} videos")
                        } catch (e: Exception) {
                            snackbar.showSnackbar("Failed: ${e.message ?: e.javaClass.simpleName}")
                        }
                    }
                }) { Text("Test connection") }
            }
            Text("Default backend for this repo: https://yt.khoavo.myds.me (docker-compose Invidious). Override if self-hosting elsewhere.", style = MaterialTheme.typography.labelSmall.copy(color = Color(0xFF888888)))
        }
        SnackbarHost(hostState = snackbar)
    }
}
