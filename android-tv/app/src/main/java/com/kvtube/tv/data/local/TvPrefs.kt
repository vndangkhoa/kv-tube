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
        val KEY_AUDIO_PREF = stringPreferencesKey("kv_tv_audio_pref") // original | vi | en | device

        // KV-Tube web gateway (fast video proxy + DASH). The raw Invidious host
        // yt.khoavo.vndns.net stalls on videoplayback, so it is upgraded below.
        const val DEFAULT_INSTANCE = "https://u.khoavo.vndns.net"

        private val LEGACY_INSTANCES = setOf(
            "https://yt.khoavo.vndns.net",
            "http://yt.khoavo.vndns.net",
            "https://invidious.khoavo.myds.me",
            "http://invidious.khoavo.myds.me",
            "https://yt.khoavo.myds.me",
            "http://yt.khoavo.myds.me",
            "https://ut.khoavo.myds.me",
            "http://ut.khoavo.myds.me"
        )

        fun resolveInstance(raw: String?): String {
            val trimmed = raw?.trim()?.removeSuffix("/") ?: ""
            if (trimmed.isBlank() || LEGACY_INSTANCES.any { trimmed.equals(it, ignoreCase = true) }) {
                return DEFAULT_INSTANCE
            }
            return trimmed
        }
    }

    val instanceUrl: Flow<String> = context.tvDataStore.data.map { resolveInstance(it[KEY_INSTANCE]) }
    val token: Flow<String?> = context.tvDataStore.data.map { it[KEY_TOKEN]?.trim()?.ifBlank { null } }
    val theme: Flow<String> = context.tvDataStore.data.map { it[KEY_THEME] ?: "youtube" }
    val audioPref: Flow<String> = context.tvDataStore.data.map { it[KEY_AUDIO_PREF] ?: "original" }

    suspend fun setInstanceUrl(url: String) {
        val clean = ApiClient.normalizeInstanceUrl(url)
        context.tvDataStore.edit { it[KEY_INSTANCE] = clean }
        ApiClient.setInstance(clean)
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

    suspend fun setAudioPref(prefKey: String) {
        val normalized = com.kvtube.tv.player.AudioLanguagePreference.fromKey(prefKey).key
        context.tvDataStore.edit { it[KEY_AUDIO_PREF] = normalized }
        context.getSharedPreferences("kv_tv_playback", Context.MODE_PRIVATE)
            .edit()
            .putString("audio_pref", normalized)
            .apply()
    }

    suspend fun bootstrap() {
        val prefs = context.tvDataStore.data.first()
        val rawInst = prefs[KEY_INSTANCE]
        val resolved = resolveInstance(rawInst)
        if (rawInst != null && resolved != rawInst.trim().removeSuffix("/")) {
            context.tvDataStore.edit { it[KEY_INSTANCE] = resolved }
        }
        val clean = ApiClient.normalizeInstanceUrl(resolved)
        val tok = prefs[KEY_TOKEN]?.trim()?.ifBlank { null }
        ApiClient.setInstance(clean, tok)
        val savedAudioPref = prefs[KEY_AUDIO_PREF]
        if (!savedAudioPref.isNullOrBlank()) {
            val normalized = com.kvtube.tv.player.AudioLanguagePreference.fromKey(savedAudioPref).key
            context.getSharedPreferences("kv_tv_playback", Context.MODE_PRIVATE)
                .edit()
                .putString("audio_pref", normalized)
                .apply()
        }
    }
}
