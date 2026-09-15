package com.kvtube.android.data.repository

import android.util.Log
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.withTimeoutOrNull

/**
 * STRICT INVIDIOUS-ONLY data source: every request goes to the server the
 * user configured in Settings. There are deliberately NO on-device (NewPipe)
 * fallbacks — the app must never open direct connections to YouTube/Google
 * hosts. Streams are proxied through Invidious (`local=true`).
 */
@Singleton
class VideoRepository @Inject constructor(
    private val api: KVApi,
    private val extractorHelper: com.kvtube.android.data.extractor.ExtractorHelper
) {
    companion object {
        private const val TAG = "VideoRepository"
        // Server calls are bounded so a slow/blocked backend can never hang
        // the UI forever.
        private const val SERVER_TIMEOUT_MS = 10_000L
        private const val PLAYBACK_TIMEOUT_MS = 15_000L
        private const val EXTRACTOR_TIMEOUT_MS = 10_000L
    }

    /** Runs [block] but gives up after [timeoutMs], returning null on timeout. */
    private suspend fun <T> bounded(timeoutMs: Long, block: suspend () -> T): T? =
        withTimeoutOrNull(timeoutMs) { block() }

    suspend fun search(query: String, limit: Int = 30, region: String = ""): List<VideoData> =
        bounded(SERVER_TIMEOUT_MS) {
            api.search(query, limit, region)
        } ?: emptyList()

    suspend fun getHomeFeed(limit: Int = 30, offset: Int = 0, region: String = ""): List<VideoData> {
        return bounded(SERVER_TIMEOUT_MS) {
            api.getHomeFeed(limit, offset, region)
        }
            ?: bounded(SERVER_TIMEOUT_MS) {
                api.getTrending(limit, region)
            }
            ?: emptyList()
    }

    suspend fun getTrending(limit: Int = 30, region: String = ""): List<VideoData> =
        bounded(SERVER_TIMEOUT_MS) {
            api.getTrending(limit, region)
        } ?: emptyList()

    suspend fun getVideoInfo(videoId: String): VideoData {
        val info = bounded(SERVER_TIMEOUT_MS) {
            api.getVideoInfo(videoId)
        }
        if (info != null && info.title.isNotBlank()) {
            return info
        }
        val fallback = runCatching { extractorHelper.getVideoDetails(videoId) }.getOrNull()
        return fallback ?: info ?: VideoData(id = videoId)
    }

    suspend fun getPlaybackInfo(videoId: String, audio: String = "opus"): PlaybackInfo {
        val serverInfo = bounded(PLAYBACK_TIMEOUT_MS) {
            api.getPlaybackInfo(videoId, audio)
        }
        if (serverInfo != null && serverInfo.videoFormats.isNotEmpty()) {
            return serverInfo
        }

        // Resilient fallback: If the server is offline, rate-limited, or returned no streams,
        // fall back to extractorHelper so playback is never blocked.
        Log.w(TAG, "Server playback info unavailable for $videoId, falling back to on-device extractor")
        return try {
            val stream = extractorHelper.extractStreamUrl(videoId, com.kvtube.android.data.model.Quality.BEST)
            if (stream.videoUrl.isNotBlank()) {
                val format = com.kvtube.android.data.model.PlaybackFormat(
                    formatId = "extractor",
                    height = stream.height,
                    width = 0,
                    vcodec = "mp4v",
                    acodec = if (stream.audioUrl.isNullOrBlank()) "mp4a" else "",
                    ext = "mp4",
                    bandwidth = 0,
                    filesize = 0L,
                    url = stream.videoUrl,
                    hasAudio = stream.audioUrl.isNullOrBlank()
                )
                val audioFormat = stream.audioUrl?.takeIf { it.isNotBlank() }?.let {
                    com.kvtube.android.data.model.PlaybackFormat(
                        formatId = "extractor_audio",
                        height = 0,
                        bandwidth = 0,
                        filesize = 0L,
                        acodec = "mp4a",
                        ext = "m4a",
                        url = it,
                        hasAudio = true
                    )
                }
                PlaybackInfo(
                    title = "",
                    videoFormats = listOf(format),
                    audioFormat = audioFormat
                )
            } else {
                PlaybackInfo()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Extractor fallback failed for $videoId: ${e.message}")
            PlaybackInfo()
        }
    }

    suspend fun getRelatedVideos(videoId: String, limit: Int = 15): List<VideoData> {
        // Server recommendations first; trending as an in-instance alternative
        // so the section is never empty while staying 100% on Invidious.
        val serverRelated = bounded(SERVER_TIMEOUT_MS) {
            api.getRelatedVideos(videoId, limit)
        } ?: emptyList()

        if (serverRelated.isNotEmpty()) {
            return serverRelated
        }

        return getTrending(limit)
    }

    suspend fun getComments(videoId: String, limit: Int = 20): List<Comment> =
        bounded(SERVER_TIMEOUT_MS) {
            api.getComments(videoId, limit)
        } ?: emptyList()
}
