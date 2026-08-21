package com.kvtube.tv.data.repository

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.kvtube.tv.KTubeTvApp
import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.local.tvDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class TvTrendingKeywordsRepository private constructor(private val context: Context) {
    companion object {
        private val KEY_RECENT_SEARCHES = stringPreferencesKey("kv_recent_searches_v1")
        private val KEY_CACHED_TRENDING = stringPreferencesKey("kv_cached_trending_keywords")
        private val KEY_LAST_FETCH_TIME = longPreferencesKey("kv_last_trending_fetch_time")
        private const val MAX_RECENT = 20
        private const val CACHE_EXPIRY_MS = 60 * 60 * 1000L // 1 hour

        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

        val DEFAULT_VN_KEYWORDS = listOf(
            "Nhạc trẻ remix hot TikTok",
            "Bóng đá Việt Nam mới nhất",
            "Top trending Việt Nam",
            "Phim truyền hình hot VTV",
            "Review công nghệ điện thoại",
            "Gameshow truyền hình hay nhất",
            "Nhạc trữ tình bolero",
            "Podcast tâm sự chữa lành",
            "Highlights game Liên Quân",
            "Ẩm thực đường phố Sài Gòn",
            "Tin tức thời sự 24h",
            "Karaoke nhạc sống hay nhất",
            "Phim hoạt hình chiếu rạp",
            "Khoa học vũ trụ bí ẩn"
        )

        val VN_TOPIC_CATEGORIES = mapOf(
            "🎵 Âm nhạc" to listOf("Nhạc trẻ hay 2026", "Remix TikTok hot", "Nhạc trữ tình bolero", "Acoustic thư giãn", "Karaoke hay"),
            "🎬 Phim ảnh" to listOf("Phim truyền hình hay", "Trailer phim mới", "Review phim chiếu rạp", "Phim hài ngắn"),
            "⚽ Thể thao" to listOf("Bóng đá Việt Nam", "Highlights Ngoại Hạng Anh", "Trực tiếp bóng đá hôm nay", "Tin tức thể thao"),
            "🎮 Game & Giải trí" to listOf("Liên Quân Mobile", "PUBG Mobile highlights", "Minecraft Việt Nam", "Streamer hài hước"),
            "📱 Công nghệ & Đời sống" to listOf("Review điện thoại", "Mẹo công nghệ hay", "Ẩm thực đường phố", "Du lịch Việt Nam")
        )

        @Volatile
        private var INSTANCE: TvTrendingKeywordsRepository? = null

        fun getInstance(context: Context? = null): TvTrendingKeywordsRepository {
            val ctx = context ?: KTubeTvApp.instance
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TvTrendingKeywordsRepository(ctx.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val scope = CoroutineScope(Dispatchers.IO)
    private val _trendingKeywords = MutableStateFlow(DEFAULT_VN_KEYWORDS)
    val trendingKeywords: StateFlow<List<String>> = _trendingKeywords

    init {
        scope.launch {
            loadCachedTrending()
            refreshTrendingKeywords(force = false)
        }
    }

    // --- Recent Searches ---
    val recentSearchesFlow: Flow<List<String>> = context.tvDataStore.data.map { prefs ->
        val raw = prefs[KEY_RECENT_SEARCHES] ?: return@map emptyList()
        try {
            json.decodeFromString<List<String>>(raw)
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun addRecentSearch(query: String) {
        val clean = query.trim()
        if (clean.isBlank()) return
        val current = getRecentSearches().toMutableList()
        current.removeAll { it.equals(clean, ignoreCase = true) }
        current.add(0, clean)
        val trimmed = current.take(MAX_RECENT)
        context.tvDataStore.edit {
            it[KEY_RECENT_SEARCHES] = json.encodeToString(trimmed)
        }
    }

    suspend fun removeRecentSearch(query: String) {
        val current = getRecentSearches().toMutableList()
        if (current.removeAll { it.equals(query, ignoreCase = true) }) {
            context.tvDataStore.edit {
                it[KEY_RECENT_SEARCHES] = json.encodeToString(current)
            }
        }
    }

    suspend fun clearRecentSearches() {
        context.tvDataStore.edit { it.remove(KEY_RECENT_SEARCHES) }
    }

    private suspend fun getRecentSearches(): List<String> {
        val prefs = context.tvDataStore.data.first()
        val raw = prefs[KEY_RECENT_SEARCHES] ?: return emptyList()
        return try {
            json.decodeFromString<List<String>>(raw)
        } catch (_: Exception) {
            emptyList()
        }
    }

    // --- Dynamic VN Trending Keywords ---
    private suspend fun loadCachedTrending() {
        try {
            val prefs = context.tvDataStore.data.first()
            val raw = prefs[KEY_CACHED_TRENDING]
            if (!raw.isNullOrBlank()) {
                val list = json.decodeFromString<List<String>>(raw)
                if (list.isNotEmpty()) {
                    _trendingKeywords.value = list
                }
            }
        } catch (_: Exception) {}
    }

    suspend fun refreshTrendingKeywords(force: Boolean = false) {
        val prefs = context.tvDataStore.data.first()
        val lastFetch = prefs[KEY_LAST_FETCH_TIME] ?: 0L
        val now = System.currentTimeMillis()

        if (!force && (now - lastFetch < CACHE_EXPIRY_MS) && _trendingKeywords.value.size > DEFAULT_VN_KEYWORDS.size) {
            return
        }

        try {
            val extracted = mutableSetOf<String>()

            // 1. Fetch Vietnam Trending Videos and extract keywords from titles
            val trendingVideos = try {
                ApiClient.api.getTrending("VN")
            } catch (_: Exception) {
                emptyList()
            }

            for (v in trendingVideos) {
                val cleaned = cleanTitleToKeyword(v.title)
                if (cleaned.isNotBlank() && cleaned.length >= 3 && cleaned.length <= 40) {
                    extracted.add(cleaned)
                }
                v.author?.trim()?.takeIf { it.isNotBlank() && it.length >= 3 }?.let {
                    extracted.add(it)
                }
            }

            // 2. Fetch live suggestions for Vietnamese seed queries
            val seeds = listOf("nhạc", "phim", "bóng đá", "tin tức", "game")
            for (seed in seeds) {
                try {
                    val resp = ApiClient.api.getSuggestions(seed)
                    for (s in resp.suggestions.take(3)) {
                        val trimmed = s.trim()
                        if (trimmed.isNotBlank() && trimmed.length >= 3 && trimmed.length <= 40) {
                            extracted.add(trimmed)
                        }
                    }
                } catch (_: Exception) {}
            }

            // 3. Combine with curated fallback so we always have a rich set
            val combined = (extracted.toList() + DEFAULT_VN_KEYWORDS).distinct().take(30)

            if (combined.isNotEmpty()) {
                _trendingKeywords.value = combined
                context.tvDataStore.edit {
                    it[KEY_CACHED_TRENDING] = json.encodeToString(combined)
                    it[KEY_LAST_FETCH_TIME] = now
                }
            }
        } catch (_: Exception) {
            // Keep existing keywords
        }
    }

    suspend fun getLiveSuggestions(query: String): List<String> {
        val q = query.trim()
        if (q.isBlank()) return emptyList()
        return try {
            ApiClient.api.getSuggestions(q).suggestions.filter { it.isNotBlank() }.take(8)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun cleanTitleToKeyword(raw: String): String {
        var t = raw
        // Remove bracketed text like [Official MV], (Full HD), [Tập 10], etc.
        t = t.replace(Regex("\\[[^\\]]*\\]"), "")
        t = t.replace(Regex("\\([^\\)]*\\)"), "")
        // Remove common noisy tags
        t = t.replace(Regex("(?i)\\b(official|mv|full|hd|4k|teaser|trailer|tập\\s*\\d+|lyrics|video|vietsub|thuyết minh|remix|live)\\b"), "")
        // Clean separator characters
        t = t.replace(Regex("[|/•~_\\-]+"), " ")
        t = t.replace(Regex("\\s+"), " ").trim()
        return t
    }
}
