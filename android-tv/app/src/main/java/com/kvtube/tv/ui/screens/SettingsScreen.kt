package com.kvtube.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.tv.material3.*
import com.kvtube.tv.BuildConfig
import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.api.TvPairApi
import com.kvtube.tv.data.local.tvDataStore
import com.kvtube.tv.data.model.TvUpdateInfo
import com.kvtube.tv.data.repository.TvUpdateManager
import com.kvtube.tv.ui.components.KvBrandLockup
import com.kvtube.tv.ui.components.TvTextField
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBorder
import com.kvtube.tv.ui.theme.YTBorderSubtle
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusGlow
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTSurface
import com.kvtube.tv.ui.theme.YTSurfaceElevated
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.ui.theme.YTTextTertiary
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
    val connectionMenuFocus = remember { FocusRequester() }
    val updatesMenuFocus = remember { FocusRequester() }
    val activeMenuFocus = if (section == SettingsSection.Connection) connectionMenuFocus else updatesMenuFocus
    var instanceUrl by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }

    var checkingUpdate by remember { mutableStateOf(false) }
    var updateInfo by remember { mutableStateOf<TvUpdateInfo?>(null) }
    var updateMessage by remember { mutableStateOf<String?>(null) }
    var downloading by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableStateOf(0f) }
    var downloadedFile by remember { mutableStateOf<java.io.File?>(null) }

    var showEditInstance by remember { mutableStateOf(false) }
    var showEditToken by remember { mutableStateOf(false) }
    var showPairing by remember { mutableStateOf(false) }

    val currentVersionName = BuildConfig.VERSION_NAME
    val currentVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

    fun persistConnection(url: String, tok: String, doneMessage: String) {
        scope.launch {
            val cleanUrl = ApiClient.normalizeInstanceUrl(url)
            val cleanTok = tok.trim().ifBlank { null }
            ctx.tvDataStore.edit {
                it[stringPreferencesKey("kv_invidious_instance")] = cleanUrl
                if (cleanTok == null) it.remove(stringPreferencesKey("kv_invidious_token"))
                else it[stringPreferencesKey("kv_invidious_token")] = cleanTok
            }
            ApiClient.setInstance(cleanUrl, cleanTok)
            instanceUrl = cleanUrl
            token = cleanTok.orEmpty()
            snackbar.showSnackbar(doneMessage)
        }
    }

    LaunchedEffect(Unit) {
        val prefs = ctx.tvDataStore.data.first()
        val rawInst = prefs[stringPreferencesKey("kv_invidious_instance")] ?: ApiClient.DEFAULT_INSTANCE
        instanceUrl = ApiClient.normalizeInstanceUrl(rawInst)
        token = prefs[stringPreferencesKey("kv_invidious_token")] ?: ""
        loaded = true
        ApiClient.setInstance(instanceUrl, token.ifBlank { null })
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
                .padding(horizontal = 36.dp, vertical = 26.dp),
            horizontalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            // ── Left: section menu ────────────────────────────────────────────
            Column(
                modifier = Modifier
                    .width(268.dp)
                    .fillMaxHeight(),
            ) {
                Text(
                    text = "Settings",
                    color = YTTextPrimary,
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
                Spacer(Modifier.height(22.dp))
                SettingsSection.entries.forEach { s ->
                    SectionMenuItem(
                        item = s,
                        selected = section == s,
                        onSelect = { section = s },
                        focusRequester = if (s == SettingsSection.Connection) connectionMenuFocus else updatesMenuFocus,
                    )
                    Spacer(Modifier.height(10.dp))
                }
                Spacer(Modifier.weight(1f))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    KvBrandLockup(
                        showWordmark = true,
                        badgeWidth = 22.dp,
                        badgeHeight = 16.dp,
                        wordmarkSizeSp = 13.5f,
                    )
                    Text(
                        text = "v$currentVersionName",
                        color = YTTextTertiary,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }

            // ── Right: active panel ───────────────────────────────────────────
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(20.dp))
                    .background(YTSurface)
                    .border(0.75.dp, YTBorderSubtle, RoundedCornerShape(20.dp))
                    .verticalScroll(rememberScrollState())
                    .padding(28.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                when (section) {
                    SettingsSection.Connection -> {
                        PanelTitle("Invidious backend")
                        Text(
                            text = "Same server as the KV-Tube web frontend (Settings -> Invidious Setup).",
                            color = YTTextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(4.dp))
                        if (!loaded) {
                            Text("Loading…", color = YTTextPrimary)
                        } else {
                            SettingsRow(
                                title = "Instance URL",
                                value = instanceUrl.ifBlank { "Default" },
                                leftFocusRequester = activeMenuFocus,
                                onClick = { showEditInstance = true },
                            )
                            SettingsRow(
                                title = "Sign-in token",
                                value = when {
                                    token.isBlank() -> "Not signed in"
                                    token.startsWith("{") -> "Bearer …${token.takeLast(4)}"
                                    else -> "Session …${token.takeLast(4)}"
                                },
                                leftFocusRequester = activeMenuFocus,
                                onClick = { showEditToken = true },
                            )
                            SettingsRow(
                                title = "Pair device (recommended)",
                                subtitle = "No typing — send your token from your phone or PC",
                                value = "",
                                highlightValue = true,
                                leftFocusRequester = activeMenuFocus,
                                onClick = { showPairing = true },
                            )
                            TestConnectionRow(leftFocusRequester = activeMenuFocus)
                        }
                    }

                    SettingsSection.Updates -> {
                        PanelTitle("KV-Tube TV")
                        Text(
                            text = "Version $currentVersion",
                            color = YTTextPrimary,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                        )
                        Text(
                            text = "Check releases and install the latest APK directly on your TV (requires “Install unknown apps” permission).",
                            color = YTTextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(Modifier.height(4.dp))

                        SettingsRow(
                            title = if (checkingUpdate) "Checking…" else "Check for update",
                            value = "",
                            enabled = !checkingUpdate && !downloading,
                            leftFocusRequester = activeMenuFocus,
                            onClick = { checkForUpdate() },
                        )

                        if (downloading) {
                            LinearProgressIndicator(
                                progress = { downloadProgress.coerceIn(0f, 1f) },
                                color = YTBrandRed,
                                trackColor = Color.White.copy(alpha = 0.2f),
                                modifier = Modifier.fillMaxWidth().height(5.dp).clip(CircleShape),
                            )
                            Text(
                                text = "Downloading ${(downloadProgress * 100).toInt()}% …",
                                color = YTTextSecondary,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }

                        if (updateInfo != null && !downloading && downloadedFile == null) {
                            SettingsRow(
                                title = "Download v${updateInfo?.latestVersion}",
                                value = "",
                                highlightValue = true,
                                leftFocusRequester = activeMenuFocus,
                                onClick = { downloadUpdate() },
                            )
                        }
                        if (downloadedFile != null) {
                            SettingsRow(
                                title = "Install now",
                                subtitle = "Downloaded (${downloadedFile!!.length() / 1024} KB)",
                                value = "",
                                highlightValue = true,
                                leftFocusRequester = activeMenuFocus,
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
                                text = "v${info.latestVersion} — ${info.releaseNotes.take(280)}",
                                color = Color(0xFFE0E0E0),
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 5,
                            )
                        }
                        updateMessage?.let { msg ->
                            Text(
                                text = msg,
                                color = if (msg.startsWith("✓")) Color(0xFF4CAF50) else YTTextSecondary,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
        }

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
        )
    }

    if (showEditInstance) {
        TvEditValueDialog(
            title = "Instance URL",
            initialValue = instanceUrl,
            placeholder = "https://u.khoavo.vndns.net",
            onDismiss = { showEditInstance = false },
            onSave = { url ->
                showEditInstance = false
                persistConnection(url, token, "Instance updated — feeds refreshed ✓")
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

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SectionMenuItem(
    item: SettingsSection,
    selected: Boolean,
    onSelect: () -> Unit,
    focusRequester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(focused) { if (focused) onSelect() }
    Surface(
        onClick = onSelect,
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { focused = it.isFocused }
            .let { if (focusRequester != null) it.focusRequester(focusRequester) else it },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(14.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.02f),
        glow = ClickableSurfaceDefaults.glow(
            focusedGlow = Glow(elevationColor = YTFocusGlow, elevation = 10.dp),
        ),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (selected) Color.White.copy(alpha = 0.14f) else Color.Transparent,
            focusedContainerColor = YTFocus,
            contentColor = YTTextPrimary,
            focusedContentColor = YTFocusInk,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border.None,
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
        ),
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(item.icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(14.dp))
            Column {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                )
                Text(
                    text = item.subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (focused) Color(0xFF444444) else YTTextSecondary,
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SettingsRow(
    title: String,
    value: String,
    onClick: () -> Unit,
    subtitle: String? = null,
    enabled: Boolean = true,
    highlightValue: Boolean = false,
    leftFocusRequester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }

    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { focused = it.isFocused }
            .let {
                if (leftFocusRequester != null) it.focusProperties { left = leftFocusRequester } else it
            },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(14.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.015f),
        glow = ClickableSurfaceDefaults.glow(
            focusedGlow = Glow(elevationColor = YTFocusGlow, elevation = 10.dp),
        ),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = YTSurfaceElevated,
            focusedContainerColor = YTFocus,
            contentColor = YTTextPrimary,
            focusedContentColor = YTFocusInk,
            disabledContainerColor = YTSurfaceElevated.copy(alpha = 0.45f),
            disabledContentColor = YTTextTertiary,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(0.75.dp, YTBorderSubtle)),
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
        ),
    ) {
        Row(
            Modifier.padding(horizontal = 20.dp, vertical = 15.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                )
                if (subtitle != null) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (focused) Color(0xFF444444) else YTTextSecondary,
                    )
                }
            }
            if (value.isNotBlank()) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                    color = if (focused) Color(0xFF222222) else YTTextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 320.dp),
                )
            } else if (highlightValue) {
                Text(
                    text = "Open ›",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                    color = if (focused) YTFocusInk else YTBrandRed,
                )
            }
        }
    }
}

@Composable
private fun TestConnectionRow(leftFocusRequester: FocusRequester? = null) {
    val scope = rememberCoroutineScope()
    var testing by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SettingsRow(
            title = if (testing) "Testing connection…" else "Test connection",
            value = "",
            enabled = !testing,
            leftFocusRequester = leftFocusRequester,
            onClick = {
                scope.launch {
                    testing = true
                    result = null
                    try {
                        val r = ApiClient.api.getTrending("VN")
                        val modeStr = if (ApiClient.isGatewayMode) " (gateway mode)" else ""
                        result = "✓ Connected$modeStr — trending: ${r.size} videos"
                    } catch (e: Exception) {
                        result = "✗ Failed: ${e.message ?: e.javaClass.simpleName} (${ApiClient.baseUrl})"
                    } finally {
                        testing = false
                    }
                }
            },
        )
        result?.let {
            Text(
                text = it,
                color = if (it.startsWith("✓")) Color(0xFF4CAF50) else Color(0xFFFF6B6B),
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PanelTitle(text: String) {
    Text(
        text = text,
        color = YTTextPrimary,
        style = MaterialTheme.typography.titleLarge.copy(
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
        ),
    )
}

@OptIn(ExperimentalTvMaterial3Api::class)
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
                .width(640.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(YTSurfaceElevated)
                .border(1.dp, YTBorder, RoundedCornerShape(20.dp))
                .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = title,
                color = YTTextPrimary,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            )
            TvTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text(title, color = YTTextSecondary) },
                placeholder = { Text(placeholder, color = YTTextTertiary) },
                imeAction = ImeAction.Done,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onDismiss,
                    shape = ButtonDefaults.shape(CircleShape),
                    colors = ButtonDefaults.colors(
                        containerColor = YTChip,
                        contentColor = YTTextPrimary,
                        focusedContainerColor = YTFocus,
                        focusedContentColor = YTFocusInk,
                    ),
                ) {
                    Text("Cancel", fontWeight = FontWeight.Medium)
                }
                Button(
                    onClick = { onSave(text.trim()) },
                    shape = ButtonDefaults.shape(CircleShape),
                    colors = ButtonDefaults.colors(
                        containerColor = YTBrandRed,
                        contentColor = Color.White,
                        focusedContainerColor = YTFocus,
                        focusedContentColor = YTFocusInk,
                    ),
                    modifier = Modifier.focusRequester(saveRequester),
                ) {
                    Text("Save", fontWeight = FontWeight.Bold)
                }
                if (allowRemove && onRemove != null) {
                    Spacer(Modifier.weight(1f))
                    Button(
                        onClick = onRemove,
                        shape = ButtonDefaults.shape(CircleShape),
                        colors = ButtonDefaults.colors(
                            containerColor = Color(0xFF333333),
                            contentColor = YTTextPrimary,
                            focusedContainerColor = YTFocus,
                            focusedContentColor = YTFocusInk,
                        ),
                    ) {
                        Text("Remove", fontWeight = FontWeight.Medium)
                    }
                }
            }
            Text(
                text = "Tip: D-pad up/down moves cleanly between input and buttons.",
                color = YTTextTertiary,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }

    LaunchedEffect(Unit) { saveRequester.requestFocus() }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TvPairingDialog(
    baseUrl: String,
    onDismiss: () -> Unit,
    onPaired: (String?, String?) -> Unit,
) {
    var code by remember { mutableStateOf<String?>(null) }
    var phase by remember { mutableStateOf("loading") }
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
            } catch (_: Exception) {}
            delay(3000)
        }
        if (phase != "paired") phase = "failed"
    }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .width(640.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(YTSurfaceElevated)
                .border(1.dp, YTBorder, RoundedCornerShape(20.dp))
                .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Pair device",
                color = YTTextPrimary,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            )

            when (phase) {
                "loading" -> {
                    CircularProgressIndicator(color = YTBrandRed)
                    Text("Generating code…", color = YTTextSecondary, style = MaterialTheme.typography.bodySmall)
                }
                "waiting" -> {
                    Text(
                        text = code ?: "",
                        color = YTTextPrimary,
                        style = MaterialTheme.typography.displaySmall.copy(
                            fontFamily = FontFamily.Monospace,
                            letterSpacing = 10.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        modifier = Modifier
                            .background(YTBackground, RoundedCornerShape(14.dp))
                            .border(1.dp, YTBorderSubtle, RoundedCornerShape(14.dp))
                            .padding(horizontal = 32.dp, vertical = 14.dp),
                    )
                    Text(
                        text = "On your phone or computer open KV-Tube Web -> Settings ->\n“Pair Android TV”, then enter this code.",
                        color = YTTextSecondary,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = YTBrandRed)
                        Text("Waiting for link…", color = YTTextTertiary, style = MaterialTheme.typography.labelSmall)
                    }
                }
                "paired" -> {
                    Text(
                        text = "✓ Paired!",
                        color = Color(0xFF4CAF50),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                }
                else -> {
                    Text(
                        text = "Could not reach the pairing service.\nMake sure this TV points at your KV-Tube server (check Instance URL).",
                        color = Color(0xFFFF6B6B),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            Button(
                onClick = onDismiss,
                shape = ButtonDefaults.shape(CircleShape),
                colors = ButtonDefaults.colors(
                    containerColor = YTChip,
                    contentColor = YTTextPrimary,
                    focusedContainerColor = YTFocus,
                    focusedContentColor = YTFocusInk,
                ),
                modifier = Modifier.focusRequester(doneRequester),
            ) {
                Text(if (phase == "paired") "Done" else "Close", fontWeight = FontWeight.SemiBold)
            }
        }
    }

    LaunchedEffect(Unit) { doneRequester.requestFocus() }
}
