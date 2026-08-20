package com.kvtube.tv

import android.app.Application
import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.local.tvDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import androidx.datastore.preferences.core.stringPreferencesKey

class KTubeTvApp : Application() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        scope.launch {
            try {
                val prefs = tvDataStore.data.first()
                val inst = prefs[stringPreferencesKey("kv_invidious_instance")]?.trim()?.removeSuffix("/")?.ifBlank { "https://yt.khoavo.myds.me" } ?: "https://yt.khoavo.myds.me"
                val token = prefs[stringPreferencesKey("kv_invidious_token")]?.trim()?.ifBlank { null }
                ApiClient.baseUrl = if (inst.endsWith("/")) inst else "$inst/"
                ApiClient.token = token
            } catch (_: Exception) {
                ApiClient.baseUrl = "https://yt.khoavo.myds.me/"
            }
        }
    }
}
