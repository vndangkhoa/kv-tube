package com.kvtube.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.kvtube.tv.BuildConfig
import com.kvtube.tv.data.api.TvPairApi
import com.kvtube.tv.data.local.tvDataStore
import com.kvtube.tv.data.model.TvUpdateInfo
import com.kvtube.tv.data.repository.TvUpdateManager
import com.kvtube.tv.ui.components.TvTextField
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTSurfaceVariant
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private enum class SettingsSection(val title: String, val subtitle: String, val icon: ImageVector) {
    Connection("Connection", "Server, sign-in, pairing", Icons.Filled.Link),
    Updates("Updates", "App version & self-update", Icons.Filled.SystemUpdate),
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    var section by remember { mutableStateOf(SettingsSection.Connection) }
    var instanceUrl by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }

    // Update states
    var checkingUpdate by remember { mutableStateOf(false) }
    var updateInfo by remember { mutableStateOf<TvUpdateInfo?>(null) }
    var updateMessage by remember { mutableStateOf<String?>(null) }
    var downloading by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableStateOf(0f) }
    var downloadedFile by remember { mutableStateOf<java.io.File?>(null) }

    // Dialogs
    var showEditInstance by remember { mutableStateOf(false) }
    var showEditToken by remember { mutableStateOf(false) }
    var showPairing by remember { mutableStateOf(false) }

    val currentVersionName = BuildConfig.VERSION_NAME
    val currentVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

    fun persistConnection(url: String, tok: String, doneMessage: String) {
        scope.launch {
            val cleanUrl = url.trim().removeSuffix("/").ifBlank { "https://yt.khoavo.myds.me" }
            ctx.tvDataStore.edit {
                it[stringPreferencesKey("kv_invidious_instance")] = cleanUrl
                if (tok.isBlank()) it.remove(stringPreferencesKey("kv_invidious_token"))
                else it[stringPreferencesKey("kv_invidious_token")] = tok.trim()
            }
            com.kvtube.tv.data.api.ApiClient.baseUrl = "$cleanUrl/"
            com.kvtube.tv.data.api.ApiClient.token = tok.trim().ifBlank { null }
            instanceUrl = cleanUrl
            token = tok.trim()
            snackbar.showSnackbar(doneMessage)
        }
    }

    LaunchedEffect(Unit) {
        val prefs = ctx.tvDataStore.data.first()
        instanceUrl = prefs[stringPreferencesKey("kv_invidious_instance")] ?: "https://yt.khoavo.myds.me"
        token = prefs[stringPreferencesKey("kv_invidious_token")] ?: ""
        loaded = true
        com.kvtube.tv.data.api.ApiClient.baseUrl = if (instanceUrl.endsWith("/")) instanceUrl else "$instanceUrl/"
        com.kvtube.tv.data.api.ApiClient.token = token.ifBlank { null }
    }

    fun checkForUpdate() {
        if (checkingUpdate || downloading) return
        scope.launch {
            checkingUpdate = true
            updateInfo = null
            updateMessage = null
            downloadedFile = null
            try {
                val info = TvUpdateManager.checkForUpdate(currentVersionName)
                if (info != null) {
                    updateInfo = info
                    updateMessage = "✓ Update found: v${info.latestVersion}"
                } else {
                    updateMessage = "✓ You are on the latest version (v$currentVersionName)"
                }
            } catch (e: Exception) {
                updateMessage = "Check failed: ${e.message}"
            } finally {
                checkingUpdate = false
            }
        }
    }

    fun downloadUpdate() {
        val info = updateInfo ?: return
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
                    updateMessage = "✓ Download complete — select Install"
                } else {
                    updateMessage = "Download failed — try again later"
                }
            } catch (e: Exception) {
                updateMessage = "Download error: ${e.message}"
            } finally {
                downloading = false
            }
        }
    }

    Box(Modifier.fillMaxSize().background(YTBackground)) {
        Row(
            Modifier
                .fillMaxSize()
                .padding(horizontal = 48.dp, vertical = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(40.dp),
        ) {
            // ── Left: section menu ────────────────────────────────────────────
            Column(Modifier.width(320.dp)) {
                Text(
                    "Settings",
                    color = Color.White,
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                )
                Spacer(Modifier.height(28.dp))
                SettingsSection.entries.forEach { s ->
                    SectionMenuItem(
                        item = s,
                        selected = section == s,
                        onSelect = { section = s },
                    )
                    Spacer(Modifier.height(12.dp))
                }
            }

            // ── Right: active panel ───────────────────────────────────────────
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(24.dp))
                    .background(Color(0xFF1A1A1A))
                    .verticalScroll(rememberScrollState())
                    .padding(32.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                when (section) {
                    SettingsSection.Connection -> {
                        PanelTitle("Invidious backend")
                        Text(
                            "Same server as the web frontend (Settings → Invidious Setup).",
                            color = Color(0xFF888888),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        if (!loaded) {
                            Text("Loading…", color = Color.White)
                        } else {
                            SettingsRow(
                                title = "Instance URL",
                                value = instanceUrl.ifBlank { "Default" },
                                onClick = { showEditInstance = true },
                            )
                            SettingsRow(
                                title = "Sign-in token",
                                value = when {
                                    token.isBlank() -> "Not signed in"
                                    token.startsWith("{") -> "Bearer token …${token.takeLast(4)}"
                                    else -> "Session …${token.takeLast(4)}"
                                },
                                onClick = { showEditToken = true },
                            )
                            SettingsRow(
                                title = "Pair device (recommended)",
                                subtitle = "No typing — send your token from your phone or PC",
                                value = "",
                                highlightValue = true,
                                onClick = { showPairing = true },
                            )
                            TestConnectionRow(snackbar = snackbar)
                        }
                    }

                    SettingsSection.Updates -> {
                        PanelTitle("KV-Tube TV")
                        Text(
                            "Version $currentVersion",
                            color = Color(0xFFAAAAAA),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            "Check GitHub / Forgejo releases and install the latest APK directly on your TV (requires “Install unknown apps” permission).",
                            color = Color(0xFF888888),
                            style = MaterialTheme.typography.labelSmall,
                        )

                        SettingsRow(
                            title = if (checkingUpdate) "Checking…" else "Check for update",
                            value = "",
                            enabled = !checkingUpdate && !downloading,
                            onClick = { checkForUpdate() },
                        )

                        if (downloading) {
                            LinearProgressIndicator(
                                progress = { downloadProgress.coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text(
                                "Downloading ${(downloadProgress * 100).toInt()}% …",
                                color = Color(0xFFAAAAAA),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }

                        if (updateInfo != null && !downloading && downloadedFile == null) {
                            SettingsRow(
                                title = "Download v${updateInfo?.latestVersion}",
                                value = "",
                                onClick = { downloadUpdate() },
                            )
                        }
                        if (downloadedFile != null) {
                            SettingsRow(
                                title = "Install now",
                                subtitle = "Downloaded (${downloadedFile!!.length() / 1024} KB)",
                                value = "",
                                highlightValue = true,
                                onClick = {
                                    val ok = TvUpdateManager.installApk(ctx, downloadedFile!!)
                                    if (!ok) {
                                        scope.launch {
                                            snackbar.showSnackbar("Enable 'Install unknown apps' for KV-Tube TV in system Settings")
                                        }
                                    }
                                },
                            )
                        }

                        updateInfo?.let { info ->
                            Text(
                                "v${info.latestVersion} — ${info.releaseNotes.take(280)}",
                                color = Color(0xFFE0E0E0),
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 5,
                            )
                        }
                        updateMessage?.let { msg ->
                            Text(
                                msg,
                                color = if (msg.startsWith("✓")) Color(0xFF4CAF50) else Color(0xFFAAAAAA),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
        )
    }

    // ── Dialogs ───────────────────────────────────────────────────────────────
    if (showEditInstance) {
        TvEditValueDialog(
            title = "Instance URL",
            initialValue = instanceUrl,
            placeholder = "https://yt.khoavo.myds.me",
            onDismiss = { showEditInstance = false },
            onSave = { url ->
                showEditInstance = false
                persistConnection(url, token, "Saved — restart Home to refresh feed")
            },
        )
    }
    if (showEditToken) {
        TvEditValueDialog(
            title = "Sign-in token",
            initialValue = token,
            placeholder = "Paste token from web Settings — or use Pair device instead",
            allowRemove = token.isNotBlank(),
            onDismiss = { showEditToken = false },
            onSave = { tok ->
                showEditToken = false
                persistConnection(instanceUrl, tok, "Saved")
            },
            onRemove = {
                showEditToken = false
                persistConnection(instanceUrl, "", "Token removed")
            },
        )
    }
    if (showPairing) {
        val base = if (instanceUrl.endsWith("/")) instanceUrl else "$instanceUrl/"
        TvPairingDialog(
            baseUrl = base,
            onDismiss = { showPairing = false },
            onPaired = { url, tok ->
                showPairing = false
                persistConnection(
                    url?.ifBlank { instanceUrl } ?: instanceUrl,
                    tok ?: "",
                    "Paired — signed in ✓",
                )
            },
        )
    }
}

// ── Menu item ────────────────────────────────────────────────────────────────

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SectionMenuItem(
    item: SettingsSection,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(focused) { if (focused) onSelect() }
    Surface(
        onClick = onSelect,
        modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(18.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (selected) Color(0xFF2A2A2A) else Color.Transparent,
            focusedContainerColor = Color.White,
            contentColor = Color.White.copy(alpha = 0.85f),
            focusedContentColor = Color.Black,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, Color.Transparent)),
            focusedBorder = Border(BorderStroke(1.dp, Color.White)),
        ),
    ) {
        Row(
            Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(item.icon, contentDescription = null, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
            Column {
                Text(item.title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Text(
                    item.subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (focused) Color.Black.copy(alpha = 0.6f) else Color(0xFF888888),
                )
            }
        }
    }
}

// ── Generic settings row ─────────────────────────────────────────────────────

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SettingsRow(
    title: String,
    value: String,
    onClick: () -> Unit,
    subtitle: String? = null,
    enabled: Boolean = true,
    highlightValue: Boolean = false,
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(16.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = YTSurfaceVariant,
            focusedContainerColor = Color.White,
            contentColor = Color.White,
            focusedContentColor = Color.Black,
            disabledContainerColor = YTSurfaceVariant.copy(alpha = 0.5f),
            disabledContentColor = Color(0xFF666666),
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, Color.Transparent)),
            focusedBorder = Border(BorderStroke(1.dp, Color.Black)),
        ),
    ) {
        Row(
            Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                if (subtitle != null) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF999999),
                    )
                }
            }
            if (value.isNotBlank()) {
                Text(
                    value,
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                    color = Color(0xFFAAAAAA),
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 340.dp),
                )
            } else if (highlightValue) {
                Text(
                    "Open ›",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                    color = YTBrandRed,
                )
            }
        }
    }
}

@Composable
private fun TestConnectionRow(snackbar: SnackbarHostState) {
    val scope = rememberCoroutineScope()
    var testing by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SettingsRow(
            title = "Test connection",
            value = "",
            enabled = !testing,
            onClick = {
                scope.launch {
                    testing = true
                    result = null
                    try {
                        val r = com.kvtube.tv.data.api.ApiClient.api.getTrending("VN")
                        result = "✓ Connected — trending: ${r.size} videos"
                    } catch (e: Exception) {
                        result = "✗ Failed: ${e.message ?: e.javaClass.simpleName}"
                    } finally {
                        testing = false
                    }
                }
            },
        )
        result?.let {
            Text(
                it,
                color = if (it.startsWith("✓")) Color(0xFF4CAF50) else Color(0xFFFF6B6B),
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun PanelTitle(text: String) {
    Text(
        text,
        color = Color.White,
        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
    )
}

// ── Edit-value dialog (D-pad safe) ───────────────────────────────────────────

@Composable
private fun TvEditValueDialog(
    title: String,
    initialValue: String,
    placeholder: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
    allowRemove: Boolean = false,
    onRemove: (() -> Unit)? = null,
) {
    var text by remember { mutableStateOf(initialValue) }
    val saveRequester = remember { FocusRequester() }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .width(680.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFF1E1E1E))
                .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(title, color = Color.White, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
            TvTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text(title, color = Color(0xFFAAAAAA)) },
                placeholder = { Text(placeholder, color = Color(0xFF6E6E6E)) },
                imeAction = androidx.compose.ui.text.input.ImeAction.Done,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = onDismiss) { Text("Cancel", color = Color.White) }
                Button(
                    onClick = { onSave(text.trim()) },
                    colors = ButtonDefaults.buttonColors(containerColor = YTBrandRed),
                    modifier = Modifier.focusRequester(saveRequester),
                ) { Text("Save") }
                if (allowRemove && onRemove != null) {
                    Spacer(Modifier.weight(1f))
                    Button(
                        onClick = onRemove,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF444444)),
                    ) { Text("Remove", color = Color.White) }
                }
            }
            Text(
                "Tip: D-pad up/down always jumps out of the text box.",
                color = Color(0xFF777777),
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }

    LaunchedEffect(Unit) { saveRequester.requestFocus() }
}

// ── Pairing dialog ───────────────────────────────────────────────────────────

@Composable
private fun TvPairingDialog(
    baseUrl: String,
    onDismiss: () -> Unit,
    onPaired: (String?, String?) -> Unit,
) {
    var code by remember { mutableStateOf<String?>(null) }
    var phase by remember { mutableStateOf("loading") } // loading | waiting | paired | failed
    val doneRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        var localCode: String? = null
        val deadline = System.currentTimeMillis() + 10 * 60_000L
        while (System.currentTimeMillis() < deadline) {
            try {
                if (localCode == null) {
                    localCode = TvPairApi.createCode(baseUrl)
                    code = localCode
                    phase = "waiting"
                } else {
                    when (val s = TvPairApi.checkStatus(baseUrl, localCode)) {
                        is TvPairApi.Status.Paired -> {
                            phase = "paired"
                            onPaired(s.linked.instanceUrl, s.linked.token)
                            return@LaunchedEffect
                        }
                        TvPairApi.Status.Expired -> localCode = null
                        TvPairApi.Status.Waiting -> Unit
                    }
                }
            } catch (_: Exception) {
                // transient network errors — keep polling until deadline
            }
            delay(3000)
        }
        if (phase != "paired") phase = "failed"
    }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .width(680.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFF1E1E1E))
                .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Pair device", color = Color.White, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))

            when (phase) {
                "loading" -> {
                    CircularProgressIndicator(color = YTBrandRed)
                    Text("Generating code…", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                }
                "waiting" -> {
                    Text(
                        code ?: "",
                        color = Color.White,
                        style = MaterialTheme.typography.displaySmall.copy(
                            fontFamily = FontFamily.Monospace,
                            letterSpacing = 10.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        modifier = Modifier
                            .background(Color(0xFF111111), RoundedCornerShape(16.dp))
                            .padding(horizontal = 32.dp, vertical = 14.dp),
                    )
                    Text(
                        "On your phone or computer open KV-Tube Web → Settings →\n“Pair Android TV”, then enter this code.",
                        color = Color(0xFFAAAAAA),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = YTBrandRed)
                        Text("Waiting for link…", color = Color(0xFF888888), style = MaterialTheme.typography.labelSmall)
                    }
                }
                "paired" -> {
                    Text("✓ Paired!", color = Color(0xFF4CAF50), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                }
                else -> {
                    Text(
                        "Could not reach the pairing service.\nMake sure this TV points at your KV-Tube server (check Instance URL).",
                        color = Color(0xFFFF6B6B),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF333333)),
                modifier = Modifier.focusRequester(doneRequester),
            ) { Text(if (phase == "paired") "Done" else "Close", color = Color.White) }
        }
    }

    LaunchedEffect(Unit) { doneRequester.requestFocus() }
}
