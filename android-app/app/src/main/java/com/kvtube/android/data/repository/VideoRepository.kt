package com.kvtube.android.data.repository

import android.util.Log
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.withTimeoutOrNull

@Singleton
class VideoRepository @Inject constructor(
    private val api: KVApi,
    private val extractorHelper: ExtractorHelper
) {
    companion object {
        private const val TAG = "VideoRepository"
        // Server calls are bounded so a slow/blocked backend (yt-dlp down,
        // IP banned, rate limited) can never hang the UI forever.
        private const val SERVER_TIMEOUT_MS = 5_000L
        // On-device NewPipe extraction gets more headroom.
        private const val EXTRACTOR_TIMEOUT_MS = 10_000L
    }

    /** Runs [block] but gives up after [timeoutMs], returning null on timeout. */
    private suspend fun <T> bounded(timeoutMs: Long, block: suspend () -> T): T? =
        withTimeoutOrNull(timeoutMs) { block() }

    suspend fun search(query: String, limit: Int = 30, region: String = ""): List<VideoData> {
        val serverResults = bounded(SERVER_TIMEOUT_MS) {
            api.search(query, limit, region)
        } ?: emptyList()

        if (serverResults.isNotEmpty()) {
            return serverResults
        }

        // On-device NewPipe fallback
        Log.d(TAG, "Using on-device extractor fallback for search: $query")
        val localResults = bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.searchVideos(query)
        } ?: emptyList()
        return localResults
    }

    suspend fun getHomeFeed(limit: Int = 30, offset: Int = 0, region: String = ""): List<VideoData> {
        val serverFeed = bounded(SERVER_TIMEOUT_MS) {
            api.getHomeFeed(limit, offset, region)
        } ?: emptyList()

        if (serverFeed.isNotEmpty()) {
            return serverFeed
        }

        // Try server trending
        val serverTrending = bounded(SERVER_TIMEOUT_MS) {
            api.getTrending(limit, region)
        } ?: emptyList()

        if (serverTrending.isNotEmpty()) {
            return serverTrending
        }

        // On-device NewPipe trending fallback
        Log.d(TAG, "Using on-device extractor fallback for home feed")
        val localTrending = bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.getTrendingVideos()
        } ?: emptyList()
        if (localTrending.isNotEmpty()) {
            return localTrending
        }

        // Final fallback: search for trending
        return bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.searchVideos("trending videos 2026")
        } ?: emptyList()
    }

    suspend fun getTrending(limit: Int = 30, region: String = ""): List<VideoData> {
        val serverTrending = bounded(SERVER_TIMEOUT_MS) {
            api.getTrending(limit, region)
        } ?: emptyList()

        if (serverTrending.isNotEmpty()) {
            return serverTrending
        }

        val localTrending = bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.getTrendingVideos()
        } ?: emptyList()
        if (localTrending.isNotEmpty()) {
            return localTrending
        }
        return bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.searchVideos("trending videos 2026")
        } ?: emptyList()
    }

    suspend fun getVideoInfo(videoId: String): VideoData {
        // 1. Try server API
        val serverInfo = bounded(SERVER_TIMEOUT_MS) {
            api.getVideoInfo(videoId)
        }
        if (serverInfo != null && serverInfo.title.isNotBlank()) {
            return serverInfo
        }

        // 2. On-device extractor fallback (immune to server IP ban)
        val localInfo = bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.getVideoDetails(videoId)
        }
        if (localInfo != null) {
            return localInfo
        }

        return VideoData(id = videoId)
    }

    suspend fun getPlaybackInfo(videoId: String, audio: String = "opus"): PlaybackInfo {
        return bounded(SERVER_TIMEOUT_MS) {
            api.getPlaybackInfo(videoId, audio)
        } ?: PlaybackInfo()
    }

    suspend fun getRelatedVideos(videoId: String, limit: Int = 15): List<VideoData> {
        val serverRelated = bounded(SERVER_TIMEOUT_MS) {
            api.getRelatedVideos(videoId, limit)
        } ?: emptyList()

        if (serverRelated.isNotEmpty()) {
            return serverRelated
        }

        val localRelated = bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.getRelatedVideos(videoId)
        } ?: emptyList()
        if (localRelated.isNotEmpty()) {
            return localRelated
        }

        return bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.searchVideos("recommended videos")
        } ?: emptyList()
    }

    suspend fun getComments(videoId: String, limit: Int = 20): List<Comment> {
        val serverComments = bounded(SERVER_TIMEOUT_MS) {
            api.getComments(videoId, limit)
        } ?: emptyList()

        if (serverComments.isNotEmpty()) {
            return serverComments
        }

        return bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.getComments(videoId)
        } ?: emptyList()
    }
}
