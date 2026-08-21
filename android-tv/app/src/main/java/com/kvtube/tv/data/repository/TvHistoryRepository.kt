package com.kvtube.tv.data.repository

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.kvtube.tv.KTubeTvApp
import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.local.tvDataStore
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.model.toTvVideo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class TvHistoryItem(
    val videoId: String,
    val title: String,
    val channelTitle: String = "",
    val channelId: String = "",
    val thumbnail: String = "",
    val duration: String = "",
    val viewsText: String? = null,
    val publishedText: String? = null,
    val avatarUrl: String? = null,
    val isLive: Boolean = false,
    val watchedAt: Long = System.currentTimeMillis(),
    val playbackPositionMs: Long = 0L,
    val durationMs: Long = 0L,
) {
    val progressFraction: Float?
        get() = if (durationMs > 0 && playbackPositionMs > 0) {
            (playbackPositionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
        } else null

    fun toTvVideo(): TvVideo = TvVideo(
        id = videoId,
        title = title,
        channelTitle = channelTitle,
        channelId = channelId,
        thumbnail = thumbnail.ifBlank { "https://i.ytimg.com/vi/$videoId/mqdefault.jpg" },
        duration = duration,
        viewsText = viewsText,
        publishedText = publishedText,
        avatarUrl = avatarUrl,
        isLive = isLive,
    )
}

class TvHistoryRepository private constructor(private val context: Context) {
    companion object {
        private val KEY_HISTORY = stringPreferencesKey("kv_watch_history_v1")
        private const val MAX_HISTORY_ITEMS = 150

        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

        @Volatile
        private var INSTANCE: TvHistoryRepository? = null

        fun getInstance(context: Context? = null): TvHistoryRepository {
            val ctx = context ?: KTubeTvApp.instance
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TvHistoryRepository(ctx.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val scope = CoroutineScope(Dispatchers.IO)

    val historyFlow: Flow<List<TvHistoryItem>> = context.tvDataStore.data.map { prefs ->
        val raw = prefs[KEY_HISTORY] ?: return@map emptyList()
        try {
            json.decodeFromString<List<TvHistoryItem>>(raw)
                .sortedByDescending { it.watchedAt }
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun getHistory(): List<TvHistoryItem> {
        val prefs = context.tvDataStore.data.first()
        val raw = prefs[KEY_HISTORY] ?: return emptyList()
        return try {
            json.decodeFromString<List<TvHistoryItem>>(raw)
                .sortedByDescending { it.watchedAt }
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun recordWatch(video: TvVideo, positionMs: Long = 0L, durationMs: Long = 0L) {
        if (video.id.isBlank()) return
        val current = getHistory().toMutableList()
        val existingIndex = current.indexOfFirst { it.videoId == video.id }
        val existing = if (existingIndex >= 0) current.removeAt(existingIndex) else null

        val newItem = TvHistoryItem(
            videoId = video.id,
            title = video.title,
            channelTitle = video.channelTitle,
            channelId = video.channelId,
            thumbnail = video.thumbnail,
            duration = video.duration,
            viewsText = video.viewsText,
            publishedText = video.publishedText,
            avatarUrl = video.avatarUrl,
            isLive = video.isLive,
            watchedAt = System.currentTimeMillis(),
            playbackPositionMs = if (positionMs > 0) positionMs else (existing?.playbackPositionMs ?: 0L),
            durationMs = if (durationMs > 0) durationMs else (existing?.durationMs ?: 0L)
        )

        current.add(0, newItem)
        val trimmed = current.take(MAX_HISTORY_ITEMS)
        saveHistory(trimmed)

        // If Invidious auth token configured, sync to remote Invidious history
        syncRemoteAdd(video.id)
    }

    suspend fun recordWatch(video: InvidiousVideo, positionMs: Long = 0L, durationMs: Long = 0L) {
        recordWatch(video.toTvVideo(), positionMs, durationMs)
    }

    suspend fun updateProgress(videoId: String, positionMs: Long, durationMs: Long) {
        if (videoId.isBlank() || positionMs < 0) return
        val current = getHistory().toMutableList()
        val index = current.indexOfFirst { it.videoId == videoId }
        if (index >= 0) {
            val item = current[index]
            current[index] = item.copy(
                playbackPositionMs = positionMs,
                durationMs = if (durationMs > 0) durationMs else item.durationMs,
                watchedAt = System.currentTimeMillis()
            )
            saveHistory(current)
        }
    }

    suspend fun removeFromHistory(videoId: String) {
        val current = getHistory().toMutableList()
        val changed = current.removeAll { it.videoId == videoId }
        if (changed) {
            saveHistory(current)
            syncRemoteDelete(videoId)
        }
    }

    suspend fun clearHistory() {
        context.tvDataStore.edit { it.remove(KEY_HISTORY) }
    }

    private suspend fun saveHistory(items: List<TvHistoryItem>) {
        val raw = json.encodeToString(items)
        context.tvDataStore.edit { it[KEY_HISTORY] = raw }
    }

    private fun syncRemoteAdd(videoId: String) {
        if (ApiClient.token.isNullOrBlank()) return
        scope.launch {
            try {
                ApiClient.api.postAuthHistory(videoId)
            } catch (_: Exception) {}
        }
    }

    private fun syncRemoteDelete(videoId: String) {
        if (ApiClient.token.isNullOrBlank()) return
        scope.launch {
            try {
                ApiClient.api.deleteAuthHistory(videoId)
            } catch (_: Exception) {}
        }
    }

    suspend fun fetchAndMergeRemote(): List<TvHistoryItem> {
        val local = getHistory()
        if (ApiClient.token.isNullOrBlank()) return local

        return try {
            val remote = ApiClient.api.getAuthHistory()
            val remoteTv = remote.map { it.toTvVideo() }
            val existingIds = local.map { it.videoId }.toSet()
            val newFromRemote = remoteTv.filterNot { it.id in existingIds }.map { tv ->
                TvHistoryItem(
                    videoId = tv.id,
                    title = tv.title,
                    channelTitle = tv.channelTitle,
                    channelId = tv.channelId,
                    thumbnail = tv.thumbnail,
                    duration = tv.duration,
                    viewsText = tv.viewsText,
                    publishedText = tv.publishedText,
                    avatarUrl = tv.avatarUrl,
                    isLive = tv.isLive,
                    watchedAt = System.currentTimeMillis() - 1000
                )
            }
            if (newFromRemote.isNotEmpty()) {
                val merged = (local + newFromRemote).sortedByDescending { it.watchedAt }.take(MAX_HISTORY_ITEMS)
                saveHistory(merged)
                merged
            } else {
                local
            }
        } catch (_: Exception) {
            local
        }
    }
}
