package com.kvtube.android.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.kvtube.android.data.api.KVApi
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
        val SERVER_URL_USER_SET = booleanPreferencesKey("server_url_user_set")
        val SERVER_IS_GATEWAY = booleanPreferencesKey("server_is_gateway")
        val SAVED_SERVER_URLS = stringPreferencesKey("saved_server_urls")
        val INVIDIOUS_TOKEN = stringPreferencesKey("invidious_token")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val REGION = stringPreferencesKey("region")
        val LAST_SUB_SEEN = longPreferencesKey("last_subscription_seen_ms")

        // No hardcoded host: the app only ever talks to the server the user
        // enters in Settings. Empty means "not configured yet".
        // The KV-Tube web gateway (Next.js) in front of Invidious. It serves the
        // same API under /api/invidious and, crucially, a fast video proxy +
        // DASH path. The raw Invidious host (yt.khoavo.vndns.net) stalls on
        // videoplayback (companion round-trips), which showed up as "time runs
        // but no video".
        const val DEFAULT_SERVER_URL = "https://u.khoavo.vndns.net"

        /** Previously shipped defaults that must now point at the gateway. */
        private val LEGACY_SERVER_URLS = setOf("https://yt.khoavo.vndns.net", "http://yt.khoavo.vndns.net")

        fun upgradeLegacyServer(url: String): String =
            if (url.trim().removeSuffix("/").lowercase() in LEGACY_SERVER_URLS) DEFAULT_SERVER_URL else url

        internal fun resolveEffectiveServerUrl(storedUrl: String?, userSet: Boolean): String {
            val clean = storedUrl?.trim()?.removeSuffix("/").orEmpty()
            if (userSet && clean.isNotBlank()) return clean
            return upgradeLegacyServer(clean.ifBlank { DEFAULT_SERVER_URL })
        }

        internal fun mergeSavedServerUrls(
            existingRaw: String?,
            priorityUrl: String,
            maxEntries: Int = 5
        ): List<String> {
            val head = KVApi.normalizeUrl(priorityUrl)
            val tail = existingRaw.orEmpty()
                .lineSequence()
                .map { KVApi.normalizeUrl(it) }
                .filter { it.isNotBlank() }
            return (listOfNotNull(head.takeIf { it.isNotBlank() }) + tail)
                .distinct()
                .take(maxEntries)
        }

        const val DEFAULT_THEME_MODE = "dark"
        const val DEFAULT_REGION = "GLOBAL"
    }

    val serverUrl: Flow<String> = context.dataStore.data.map { preferences ->
        resolveEffectiveServerUrl(
            storedUrl = preferences[SERVER_URL],
            userSet = preferences[SERVER_URL_USER_SET] == true
        )
    }

    val serverIsGateway: Flow<Boolean?> = context.dataStore.data.map { preferences ->
        preferences[SERVER_IS_GATEWAY]
    }

    val savedServerUrls: Flow<List<String>> = context.dataStore.data.map { preferences ->
        mergeSavedServerUrls(
            existingRaw = preferences[SAVED_SERVER_URLS],
            priorityUrl = preferences[SERVER_URL].orEmpty()
        )
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

    suspend fun setServerUrl(url: String, isGateway: Boolean? = null) {
        val cleanUrl = KVApi.normalizeUrl(url)
        context.dataStore.edit { preferences ->
            val prevUrl = preferences[SERVER_URL].orEmpty()
            preferences[SERVER_URL] = cleanUrl
            if (cleanUrl.isNotBlank()) {
                preferences[SERVER_URL_USER_SET] = true
                preferences[SAVED_SERVER_URLS] =
                    mergeSavedServerUrls(preferences[SAVED_SERVER_URLS], cleanUrl).joinToString("\n")
            }
            if (isGateway != null) {
                preferences[SERVER_IS_GATEWAY] = isGateway
            } else if (prevUrl != cleanUrl) {
                preferences.remove(SERVER_IS_GATEWAY)
            }
        }
    }

    suspend fun rememberServerUrl(url: String) {
        val cleanUrl = KVApi.normalizeUrl(url)
        if (cleanUrl.isBlank()) return
        context.dataStore.edit { preferences ->
            preferences[SAVED_SERVER_URLS] =
                mergeSavedServerUrls(preferences[SAVED_SERVER_URLS], cleanUrl).joinToString("\n")
        }
    }

    suspend fun setServerIsGateway(isGateway: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[SERVER_IS_GATEWAY] = isGateway
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
