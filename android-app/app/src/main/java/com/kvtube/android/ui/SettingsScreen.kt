package com.kvtube.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Contrast
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.kvtube.android.BuildConfig
import com.kvtube.android.data.api.PairApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private data class RegionEntry(
    val code: String,
    val label: String,
    val flag: String
)

private val regions = listOf(
    RegionEntry("GLOBAL", "Global", "\uD83C\uDF0D"),
    RegionEntry("US", "United States", "\uD83C\uDDFA\uD83C\uDDF8"),
    RegionEntry("VN", "Vietnam", "\uD83C\uDDFB\uD83C\uDDF3"),
    RegionEntry("JP", "Japan", "\uD83C\uDDEF\uD83C\uDDF5"),
    RegionEntry("KR", "South Korea", "\uD83C\uDDF0\uD83C\uDDF7"),
    RegionEntry("IN", "India", "\uD83C\uDDEE\uD83C\uDDF3"),
    RegionEntry("GB", "United Kingdom", "\uD83C\uDDEC\uD83C\uDDE7"),
    RegionEntry("DE", "Germany", "\uD83C\uDDE9\uD83C\uDDEA"),
    RegionEntry("FR", "France", "\uD83C\uDDEB\uD83C\uDDF7"),
    RegionEntry("BR", "Brazil", "\uD83C\uDDE7\uD83C\uDDF7"),
    RegionEntry("TH", "Thailand", "\uD83C\uDDF9\uD83C\uDDED"),
    RegionEntry("ID", "Indonesia", "\uD83C\uDDEE\uD83C\uDDE9"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    var showReceivePairing by remember { mutableStateOf(false) }
    var showSendPairing by remember { mutableStateOf(false) }
    var showHelpDialog by remember { mutableStateOf(false) }
    var showRegionSheet by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        Spacer(modifier = Modifier.height(12.dp))

        // Title Header
        Text(
            text = "Settings",
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(bottom = 14.dp, start = 4.dp)
        )

        // 1. Server Section
        SettingsCard(
            icon = Icons.Default.Cloud,
            title = "Server & Account"
        ) {
            var serverUrl by remember(uiState.serverUrl) {
                mutableStateOf(uiState.serverUrl)
            }
            var invidiousToken by remember(uiState.invidiousToken) {
                mutableStateOf(uiState.invidiousToken)
            }
            var tokenVisible by remember { mutableStateOf(false) }

            LaunchedEffect(uiState.saveMessage) {
                if (uiState.saveMessage != null) {
                    delay(3000)
                    viewModel.clearSaveMessage()
                }
            }

            // Connection Status Banner
            if (uiState.testStatus != null) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = when (uiState.testSuccess) {
                        true -> MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                        false -> MaterialTheme.colorScheme.error.copy(alpha = 0.12f)
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    },
                    border = BorderStroke(
                        1.dp,
                        when (uiState.testSuccess) {
                            true -> MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                            false -> MaterialTheme.colorScheme.error.copy(alpha = 0.35f)
                            else -> MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                        }
                    )
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = when (uiState.testSuccess) {
                                    true -> Icons.Default.CheckCircle
                                    false -> Icons.Default.ErrorOutline
                                    else -> Icons.Default.Info
                                },
                                contentDescription = null,
                                tint = when (uiState.testSuccess) {
                                    true -> MaterialTheme.colorScheme.primary
                                    false -> MaterialTheme.colorScheme.error
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = uiState.testStatus ?: "",
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = when (uiState.testSuccess) {
                                    true -> MaterialTheme.colorScheme.primary
                                    false -> MaterialTheme.colorScheme.error
                                    else -> MaterialTheme.colorScheme.onSurface
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }

                        if (!uiState.testTroubleshootTip.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "💡 Tip: ${uiState.testTroubleshootTip}",
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // Quick Presets & Troubleshooting link
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Quick Presets:",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                TextButton(
                    onClick = { showHelpDialog = true },
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp, vertical = 0.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.HelpOutline,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Why can't I connect?",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SettingsViewModel.PRESET_INSTANCES.forEach { (presetUrl, label) ->
                    val isSelected = serverUrl.trim().removeSuffix("/") == presetUrl
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                serverUrl = presetUrl
                                viewModel.testConnection(presetUrl)
                            },
                        shape = RoundedCornerShape(8.dp),
                        color = if (isSelected)
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                        else
                            MaterialTheme.colorScheme.surfaceVariant,
                        border = if (isSelected)
                            BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
                        else null
                    ) {
                        Text(
                            text = label,
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server Address") },
                placeholder = { Text("https://yt.khoavo.vndns.net") },
                singleLine = true,
                trailingIcon = {
                    if (serverUrl.isNotBlank()) {
                        IconButton(onClick = { serverUrl = "" }) {
                            Icon(
                                imageVector = Icons.Default.Clear,
                                contentDescription = "Clear",
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                ),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = invidiousToken,
                onValueChange = { invidiousToken = it },
                label = { Text("Invidious Token (for subscriptions)") },
                placeholder = { Text("SID cookie value or JSON token") },
                singleLine = true,
                visualTransformation = if (tokenVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { tokenVisible = !tokenVisible }) {
                        Icon(
                            imageVector = if (tokenVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = if (tokenVisible) "Hide token" else "Show token",
                            modifier = Modifier.size(20.dp)
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                ),
                shape = RoundedCornerShape(12.dp)
            )

            Text(
                text = "Paste your Invidious session token to enable your Subscriptions feed (Instance: Preferences → Tokens).",
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            if (uiState.saveMessage != null) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                ) {
                    Text(
                        text = "✓ ${uiState.saveMessage}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = { viewModel.testConnection(serverUrl) },
                    enabled = !uiState.isTestingConnection && serverUrl.isNotBlank(),
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (uiState.isTestingConnection) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(6.dp))
                    }
                    Text("Test", maxLines = 1)
                }

                Button(
                    onClick = {
                        viewModel.saveSettings(serverUrl, invidiousToken)
                    },
                    modifier = Modifier.weight(2f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Save,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Save Server & Token")
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "DEVICE PAIRING",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.2.sp
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = { showReceivePairing = true },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Link,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Pair this device", maxLines = 1)
                }
                OutlinedButton(
                    onClick = { showSendPairing = true },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Send,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Send to device", maxLines = 1)
                }
            }

            Text(
                text = "Sync credentials with your TV or browser without typing credentials.",
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // 2. Theme Section (Dark, AMOLED Pure Black, Light, System)
        SettingsCard(
            icon = Icons.Default.PhoneAndroid,
            title = "Appearance"
        ) {
            val themeOptions = listOf(
                Triple("dark", "Dark", Icons.Default.DarkMode),
                Triple("amoled", "AMOLED", Icons.Default.Contrast),
                Triple("light", "Light", Icons.Default.LightMode),
                Triple("system", "System", Icons.Default.PhoneAndroid),
            )

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    themeOptions.take(2).forEach { (mode, label, icon) ->
                        val isSelected = uiState.themeMode == mode
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    scope.launch { viewModel.setThemeMode(mode) }
                                },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected)
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                            else
                                MaterialTheme.colorScheme.surfaceVariant,
                            border = if (isSelected)
                                BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
                            else null
                        ) {
                            Column(
                                modifier = Modifier.padding(vertical = 12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    imageVector = icon,
                                    contentDescription = label,
                                    tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = label,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    themeOptions.drop(2).forEach { (mode, label, icon) ->
                        val isSelected = uiState.themeMode == mode
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    scope.launch { viewModel.setThemeMode(mode) }
                                },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected)
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                            else
                                MaterialTheme.colorScheme.surfaceVariant,
                            border = if (isSelected)
                                BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
                            else null
                        ) {
                            Column(
                                modifier = Modifier.padding(vertical = 12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(
                                    imageVector = icon,
                                    contentDescription = label,
                                    tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = label,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // 3. Region Section (Bottom Sheet Picker)
        SettingsCard(
            icon = Icons.Default.Public,
            title = "Region"
        ) {
            val currentRegion = regions.find { it.code == uiState.region } ?: regions.first()

            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { showRegionSheet = true },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = currentRegion.flag, fontSize = 24.sp)
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Content Region",
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium)
                        )
                        Text(
                            text = "${currentRegion.label} (${currentRegion.code})",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = "Change region",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // 4. Updates Section
        SettingsCard(
            icon = Icons.Default.Download,
            title = "Updates"
        ) {
            Text(
                text = "Current version: v${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 12.dp)
            )

            when {
                uiState.isCheckingUpdate -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(20.dp)
                                .padding(end = 8.dp),
                            strokeWidth = 2.dp
                        )
                        Text(
                            text = "Checking for updates...",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }

                uiState.isDownloading -> {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "Downloading update...",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        LinearProgressIndicator(
                            progress = { uiState.downloadProgress },
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(4.dp))
                        )
                        Text(
                            text = "${(uiState.downloadProgress * 100).toInt()}%",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }

                uiState.updateInfo != null -> {
                    val info = uiState.updateInfo!!
                    if (info.hasUpdate) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = "New version available: ${info.latestVersion}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                if (info.changelog.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = info.changelog,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 5
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = { viewModel.downloadUpdate() },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Download & Install")
                        }
                    } else {
                        Text(
                            text = "You're up to date!",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                uiState.updateError != null -> {
                    Text(
                        text = uiState.updateError!!,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedButton(
                onClick = { viewModel.checkForUpdate() },
                enabled = !uiState.isCheckingUpdate && !uiState.isDownloading,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Check for Updates")
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // 5. About
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = "KV-Tube Android",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "Self-hosted private YouTube frontend • v${BuildConfig.VERSION_NAME}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(28.dp))
    }

    // Region Bottom Sheet
    if (showRegionSheet) {
        RegionPickerBottomSheet(
            currentRegionCode = uiState.region,
            onRegionSelected = { code ->
                scope.launch { viewModel.setRegion(code) }
                showRegionSheet = false
            },
            onDismiss = { showRegionSheet = false }
        )
    }

    // Connection Help Dialog
    if (showHelpDialog) {
        ConnectionHelpDialog(onDismiss = { showHelpDialog = false })
    }

    // Pairing dialogs
    if (showReceivePairing) {
        ReceivePairingDialog(
            viewModel = viewModel,
            onDismiss = { showReceivePairing = false }
        )
    }
    if (showSendPairing) {
        SendPairingDialog(
            viewModel = viewModel,
            onDismiss = { showSendPairing = false }
        )
    }
}

// ── Region Picker Bottom Sheet ───────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RegionPickerBottomSheet(
    currentRegionCode: String,
    onRegionSelected: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    val filteredRegions = remember(searchQuery) {
        if (searchQuery.isBlank()) regions
        else regions.filter {
            it.label.contains(searchQuery, ignoreCase = true) ||
            it.code.contains(searchQuery, ignoreCase = true)
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp)
        ) {
            Text(
                text = "Select Content Region",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 12.dp)
            )

            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search country or code...") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search",
                        modifier = Modifier.size(20.dp)
                    )
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            LazyColumn(modifier = Modifier.fillMaxWidth()) {
                items(filteredRegions, key = { it.code }) { region ->
                    val isSelected = region.code == currentRegionCode
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { onRegionSelected(region.code) }
                            .padding(vertical = 2.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = if (isSelected)
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                        else
                            androidx.compose.ui.graphics.Color.Transparent
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(text = region.flag, fontSize = 22.sp)
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = region.label,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = region.code,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            if (isSelected) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "Selected",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── Connection Troubleshooting Guide Dialog ──────────────────────────────────

@Composable
private fun ConnectionHelpDialog(onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.HelpOutline,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Connection Troubleshooting",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                HelpSection(
                    title = "1. Works on 4G but not home Wi-Fi?",
                    body = "Many home routers do not support NAT Loopback (hairpinning). When you are connected to home Wi-Fi and query your public domain (*.myds.me), the router drops the connection.\n\nFix: Set up a local DNS record on your router/NAS pointing your domain to the NAS local IP, or use your local NAS IP (e.g. http://192.168.1.10:3241) while at home."
                )

                HelpSection(
                    title = "2. HTTP 502 / 504 Bad Gateway",
                    body = "The Synology Reverse Proxy is answering, but the backend Docker container is unreachable.\n\nFix: Open Container Manager in DSM and make sure all containers (Invidious, Invidious-DB, Invidious-COMPANION, and Invidious-Materialious-UI) are running and healthy. Note that Invidious takes up to 60s to boot."
                )

                HelpSection(
                    title = "3. SSL Certificate / Handshake Error",
                    body = "Android strictly validates certificates and rejects self-signed certs.\n\nFix: In DSM Control Panel → Security → Certificate → Settings, verify that your domain is mapped to a valid Let's Encrypt certificate, not the default Synology certificate."
                )

                HelpSection(
                    title = "4. Connecting via Local LAN IP",
                    body = "You can connect without HTTPS using your local NAS IP address (e.g. http://192.168.1.50:3241 or http://192.168.1.50:7601). Cleartext HTTP is permitted on local networks."
                )

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Got it")
                }
            }
        }
    }
}

@Composable
private fun HelpSection(title: String, body: String) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 16.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// ── Pairing dialogs ──────────────────────────────────────────────────────────

/**
 * Shows a short code and polls until another device (TV, web browser or
 * phone) pushes this server's instance URL + Invidious token over.
 */
@Composable
private fun ReceivePairingDialog(
    viewModel: SettingsViewModel,
    onDismiss: () -> Unit
) {
    var code by remember { mutableStateOf<String?>(null) }
    // loading | waiting | paired | failed
    var phase by remember { mutableStateOf("loading") }

    LaunchedEffect(Unit) {
        var localCode: String? = null
        val deadline = System.currentTimeMillis() + 10 * 60_000L
        while (System.currentTimeMillis() < deadline && phase != "paired") {
            try {
                if (localCode == null) {
                    localCode = viewModel.createPairCode()
                    code = localCode
                    phase = "waiting"
                } else {
                    when (val s = viewModel.checkPairStatus(localCode)) {
                        is PairApi.Status.Paired -> {
                            viewModel.applyPairedCredentials(s.instanceUrl, s.token)
                            phase = "paired"
                            return@LaunchedEffect
                        }
                        PairApi.Status.Expired -> localCode = null
                        PairApi.Status.Waiting -> Unit
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
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Pair this device",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )

                when (phase) {
                    "loading" -> {
                        CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 3.dp)
                        Text(
                            text = "Generating code…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    "waiting" -> {
                        Text(
                            text = code ?: "",
                            style = MaterialTheme.typography.displaySmall.copy(
                                fontFamily = FontFamily.Monospace,
                                letterSpacing = 6.sp,
                                fontWeight = FontWeight.Bold
                            ),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                                    RoundedCornerShape(14.dp)
                                )
                                .padding(horizontal = 24.dp, vertical = 12.dp)
                        )
                        Text(
                            text = "On your TV, in Web → Settings → “Pair Android TV”, or on another phone → Settings → “Send to device”, enter this code.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(14.dp),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Waiting for link…",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    "paired" -> {
                        Text(
                            text = "✓ Paired! You're signed in.",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    else -> {
                        Text(
                            text = "Could not reach the pairing service.\nMake sure this device points at your KV-Tube web frontend (Server Address).",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center
                        )
                    }
                }

                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(if (phase == "paired") "Done" else "Cancel")
                }
            }
        }
    }
}

/** Pushes this device's saved connection to a code shown on another device. */
@Composable
private fun SendPairingDialog(
    viewModel: SettingsViewModel,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var resultMessage by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }
    val sent = resultMessage != null && !isError

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Send to another device",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Enter the 6-character code shown on your TV (“Pair device”) or in Web → Settings. Your saved server address and token will be sent.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                OutlinedTextField(
                    value = code,
                    onValueChange = {
                        code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(8)
                    },
                    label = { Text("Pairing code") },
                    placeholder = { Text("e.g. K7M2XQ") },
                    singleLine = true,
                    enabled = !sending && !sent,
                    isError = isError,
                    textStyle = TextStyle(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 20.sp,
                        letterSpacing = 4.sp
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )

                resultMessage?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    )
                }

                Button(
                    onClick = {
                        sending = true
                        resultMessage = null
                        scope.launch {
                            when (val r = viewModel.sendPairing(code)) {
                                is PairApi.SendResult.Ok -> {
                                    isError = false
                                    resultMessage = "✓ Sent! The other device is now signed in."
                                }
                                is PairApi.SendResult.Error -> {
                                    isError = true
                                    resultMessage = r.message
                                }
                            }
                            sending = false
                        }
                    },
                    enabled = !sending && code.trim().length >= 4 && !sent,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(if (sending) "Sending…" else "Send")
                }

                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (sent) "Done" else "Cancel")
                }
            }
        }
    }
}

@Composable
private fun SettingsCard(
    icon: ImageVector,
    title: String,
    content: @Composable () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            content()
        }
    }
}
