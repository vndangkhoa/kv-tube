package com.kvtube.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.kvtube.android.BuildConfig
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavController,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Server address
            SectionHeader("Server")

            var serverUrl by remember(uiState.serverUrl) {
                mutableStateOf(uiState.serverUrl)
            }

            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server Address") },
                placeholder = { Text("http://192.168.1.100:3000") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(8.dp))

            TextButton(
                onClick = {
                    scope.launch {
                        viewModel.saveServerUrl(serverUrl)
                    }
                }
            ) {
                Text("Save Server Address")
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

            // Theme
            SectionHeader("Appearance")

            ThemeOption(
                label = "Dark theme",
                selected = uiState.themeMode == "dark",
                onClick = {
                    scope.launch { viewModel.setThemeMode("dark") }
                }
            )
            ThemeOption(
                label = "Light theme",
                selected = uiState.themeMode == "light",
                onClick = {
                    scope.launch { viewModel.setThemeMode("light") }
                }
            )
            ThemeOption(
                label = "System default",
                selected = uiState.themeMode == "system",
                onClick = {
                    scope.launch { viewModel.setThemeMode("system") }
                }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

            // Region
            SectionHeader("Region")

            RegionOption(
                label = "Global",
                selected = uiState.region == "GLOBAL",
                onClick = { scope.launch { viewModel.setRegion("GLOBAL") } }
            )
            RegionOption(
                label = "US",
                selected = uiState.region == "US",
                onClick = { scope.launch { viewModel.setRegion("US") } }
            )
            RegionOption(
                label = "VN",
                selected = uiState.region == "VN",
                onClick = { scope.launch { viewModel.setRegion("VN") } }
            )
            RegionOption(
                label = "JP",
                selected = uiState.region == "JP",
                onClick = { scope.launch { viewModel.setRegion("JP") } }
            )
            RegionOption(
                label = "KR",
                selected = uiState.region == "KR",
                onClick = { scope.launch { viewModel.setRegion("KR") } }
            )
            RegionOption(
                label = "IN",
                selected = uiState.region == "IN",
                onClick = { scope.launch { viewModel.setRegion("IN") } }
            )
            RegionOption(
                label = "GB",
                selected = uiState.region == "GB",
                onClick = { scope.launch { viewModel.setRegion("GB") } }
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

            // Updates
            SectionHeader("Updates")

            Text(
                text = "Current version: v${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 12.dp)
            )

            if (uiState.isCheckingUpdate) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(16.dp)
                            .padding(end = 8.dp),
                        strokeWidth = 2.dp
                    )
                    Text(
                        text = "Checking for updates...",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            } else if (uiState.isDownloading) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "Downloading update...",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    LinearProgressIndicator(
                        progress = { uiState.downloadProgress },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        text = "${(uiState.downloadProgress * 100).toInt()}%",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                val updateInfo = uiState.updateInfo
                val error = uiState.updateError
                if (updateInfo != null) {
                    if (updateInfo.hasUpdate) {
                        Text(
                            text = "New version available: ${updateInfo.latestVersion}",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Download: ${updateInfo.downloadUrl}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (updateInfo.changelog.isNotBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = updateInfo.changelog,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 5
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = { viewModel.downloadUpdate() }
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
                } else if (error != null) {
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = { viewModel.checkForUpdate() },
                enabled = !uiState.isCheckingUpdate && !uiState.isDownloading
            ) {
                Text("Check for Updates")
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(bottom = 12.dp)
    )
}

@Composable
private fun ThemeOption(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f)
        )
        if (selected) {
            Text(
                text = "✓",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

@Composable
private fun RegionOption(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f)
        )
        if (selected) {
            Text(
                text = "✓",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}
