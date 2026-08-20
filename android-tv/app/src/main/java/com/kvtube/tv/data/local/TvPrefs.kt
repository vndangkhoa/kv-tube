package com.kvtube.tv.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.kvtube.tv.data.api.ApiClient
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

class TvPrefs(private val context: Context) {
    companion object {
        val KEY_INSTANCE = stringPreferencesKey("kv_invidious_instance")
        val KEY_TOKEN = stringPreferencesKey("kv_invidious_token")
        val KEY_THEME = stringPreferencesKey("kv_tv_theme") // default | youtube

        const val DEFAULT_INSTANCE = "https://yt.khoavo.myds.me"
    }

    val instanceUrl: Flow<String> = context.tvDataStore.data.map { it[KEY_INSTANCE]?.trim()?.removeSuffix("/")?.ifBlank { DEFAULT_INSTANCE } ?: DEFAULT_INSTANCE }
    val token: Flow<String?> = context.tvDataStore.data.map { it[KEY_TOKEN]?.trim()?.ifBlank { null } }
    val theme: Flow<String> = context.tvDataStore.data.map { it[KEY_THEME] ?: "youtube" }

    suspend fun setInstanceUrl(url: String) {
        val clean = url.trim().removeSuffix("/").ifBlank { DEFAULT_INSTANCE }
        context.tvDataStore.edit { it[KEY_INSTANCE] = clean }
        ApiClient.baseUrl = "$clean/"
    }

    suspend fun setToken(token: String?) {
        val clean = token?.trim()?.ifBlank { null }
        if (clean == null) context.tvDataStore.edit { it.remove(KEY_TOKEN) }
        else context.tvDataStore.edit { it[KEY_TOKEN] = clean }
        ApiClient.token = clean
    }

    suspend fun setTheme(theme: String) {
        context.tvDataStore.edit { it[KEY_THEME] = theme }
    }

    suspend fun bootstrap() {
        val prefs = context.tvDataStore.data.first()
        val inst = prefs[KEY_INSTANCE]?.trim()?.removeSuffix("/")?.ifBlank { DEFAULT_INSTANCE } ?: DEFAULT_INSTANCE
        val tok = prefs[KEY_TOKEN]?.trim()?.ifBlank { null }
        ApiClient.baseUrl = if (inst.endsWith("/")) inst else "$inst/"
        ApiClient.token = tok
    }
}
