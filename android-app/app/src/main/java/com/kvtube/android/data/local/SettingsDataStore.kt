package com.kvtube.android.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "kvtube_settings")

@Singleton
class SettingsDataStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        val SERVER_URL = stringPreferencesKey("server_url")
        val INVIDIOUS_TOKEN = stringPreferencesKey("invidious_token")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val REGION = stringPreferencesKey("region")
        val LAST_SUB_SEEN = longPreferencesKey("last_subscription_seen_ms")

        // No hardcoded host: the app only ever talks to the server the user
        // enters in Settings. Empty means "not configured yet".
        const val DEFAULT_SERVER_URL = ""
        const val DEFAULT_THEME_MODE = "dark"
        const val DEFAULT_REGION = "GLOBAL"
    }

    /** Exactly what the user saved — never silently replaced by a default. */
    val serverUrl: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[SERVER_URL]?.trim()?.removeSuffix("/") ?: ""
    }

    val invidiousToken: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[INVIDIOUS_TOKEN]?.trim() ?: ""
    }

    suspend fun setInvidiousToken(token: String) {
        context.dataStore.edit { preferences ->
            preferences[INVIDIOUS_TOKEN] = token.trim()
        }
    }

    val themeMode: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[THEME_MODE] ?: DEFAULT_THEME_MODE
    }

    val region: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[REGION] ?: DEFAULT_REGION
    }

    suspend fun setServerUrl(url: String) {
        val cleanUrl = url.trim().removeSuffix("/")
        context.dataStore.edit { preferences ->
            preferences[SERVER_URL] = cleanUrl
        }
    }

    suspend fun setThemeMode(mode: String) {
        context.dataStore.edit { preferences ->
            preferences[THEME_MODE] = mode
        }
    }

    suspend fun setRegion(region: String) {
        context.dataStore.edit { preferences ->
            preferences[REGION] = region
        }
    }

    /** When the user last looked at the subscription "new videos" panel. */
    val lastSubscriptionSeenMillis: Flow<Long> = context.dataStore.data.map { preferences ->
        preferences[LAST_SUB_SEEN] ?: 0L
    }

    suspend fun setLastSubscriptionSeenMillis(millis: Long) {
        context.dataStore.edit { preferences ->
            preferences[LAST_SUB_SEEN] = millis
        }
    }
}
