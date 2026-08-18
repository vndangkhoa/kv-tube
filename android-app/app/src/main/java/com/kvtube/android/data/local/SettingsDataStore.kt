package com.kvtube.android.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
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
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val REGION = stringPreferencesKey("region")

        const val DEFAULT_SERVER_URL = "https://ut.khoavo.myds.me"
        const val DEFAULT_THEME_MODE = "dark"
        const val DEFAULT_REGION = "GLOBAL"
    }

    val serverUrl: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[SERVER_URL]?.trim()?.removeSuffix("/")?.ifEmpty { DEFAULT_SERVER_URL } ?: DEFAULT_SERVER_URL
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
            preferences[SERVER_URL] = cleanUrl.ifEmpty { DEFAULT_SERVER_URL }
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
}
