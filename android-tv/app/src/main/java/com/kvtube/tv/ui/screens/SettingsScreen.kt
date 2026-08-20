package com.kvtube.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.compose.ui.platform.LocalContext
import com.kvtube.tv.data.local.tvDataStore
import kotlinx.coroutines.launch
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.flow.first

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    var instanceUrl by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val prefs = ctx.tvDataStore.data.first()
        instanceUrl = prefs[stringPreferencesKey("kv_invidious_instance")] ?: "https://yt.khoavo.myds.me"
        token = prefs[stringPreferencesKey("kv_invidious_token")] ?: ""
        loaded = true
        com.kvtube.tv.data.api.ApiClient.baseUrl = if (instanceUrl.endsWith("/")) instanceUrl else "$instanceUrl/"
        com.kvtube.tv.data.api.ApiClient.token = token.ifBlank { null }
    }

    Column(Modifier.fillMaxSize().background(Color(0xFF0F0F0F)).padding(32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Settings", color = Color.White, style = MaterialTheme.typography.headlineSmall)
        Text("Invidious instance & token — same origin as the web frontend (Settings → Invidious Setup).", style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFFAAAAAA)))

        if (!loaded) {
            Text("Loading…", color = Color.White)
        } else {
            OutlinedTextField(
                value = instanceUrl,
                onValueChange = { instanceUrl = it },
                label = { Text("Invidious instance URL", color = Color(0xFFAAAAAA)) },
                placeholder = { Text("https://yt.khoavo.myds.me", color = Color(0xFF6E6E6E)) },
                modifier = Modifier.fillMaxWidth(0.7f),
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
                modifier = Modifier.fillMaxWidth(0.7f),
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
                        // Test with a lightweight call
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
