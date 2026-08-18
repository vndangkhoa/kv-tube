package com.kvtube.android.data.repository

import android.util.Log
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class VideoRepository @Inject constructor(
    private val api: KVApi,
    private val extractorHelper: ExtractorHelper
) {
    companion object {
        private const val TAG = "VideoRepository"
    }

    suspend fun search(query: String, limit: Int = 30, region: String = ""): List<VideoData> {
        val serverResults = try {
            api.search(query, limit, region)
        } catch (e: Exception) {
            Log.w(TAG, "Server search failed: ${e.message}")
            emptyList()
        }

        if (serverResults.isNotEmpty()) {
            return serverResults
        }

        // On-device NewPipe fallback
        Log.d(TAG, "Using on-device extractor fallback for search: $query")
        val localResults = extractorHelper.searchVideos(query)
        return localResults.ifEmpty { emptyList() }
    }

    suspend fun getHomeFeed(limit: Int = 30, offset: Int = 0, region: String = ""): List<VideoData> {
        val serverFeed = try {
            api.getHomeFeed(limit, offset, region)
        } catch (e: Exception) {
            Log.w(TAG, "Server home feed failed: ${e.message}")
            emptyList()
        }

        if (serverFeed.isNotEmpty()) {
            return serverFeed
        }

        // Try server trending
        val serverTrending = try {
            api.getTrending(limit, region)
        } catch (e: Exception) {
            emptyList()
        }

        if (serverTrending.isNotEmpty()) {
            return serverTrending
        }

        // On-device NewPipe trending fallback
        Log.d(TAG, "Using on-device extractor fallback for home feed")
        val localTrending = extractorHelper.getTrendingVideos()
        if (localTrending.isNotEmpty()) {
            return localTrending
        }

        // Final fallback: search for trending
        return extractorHelper.searchVideos("trending videos 2026")
    }

    suspend fun getTrending(limit: Int = 30, region: String = ""): List<VideoData> {
        val serverTrending = try {
            api.getTrending(limit, region)
        } catch (e: Exception) {
            emptyList()
        }

        if (serverTrending.isNotEmpty()) {
            return serverTrending
        }

        val localTrending = extractorHelper.getTrendingVideos()
        return localTrending.ifEmpty { extractorHelper.searchVideos("trending videos 2026") }
    }

    suspend fun getVideoInfo(videoId: String): VideoData {
        // 1. Try server API
        try {
            val info = api.getVideoInfo(videoId)
            if (info.title.isNotBlank()) {
                return info
            }
        } catch (e: Exception) {
            Log.w(TAG, "Server getVideoInfo failed for $videoId: ${e.message}")
        }

        // 2. On-device extractor fallback (immune to server IP ban)
        val localInfo = extractorHelper.getVideoDetails(videoId)
        if (localInfo != null) {
            return localInfo
        }

        return VideoData(id = videoId)
    }

    suspend fun getPlaybackInfo(videoId: String, audio: String = "opus"): PlaybackInfo {
        return try {
            api.getPlaybackInfo(videoId, audio)
        } catch (e: Exception) {
            PlaybackInfo()
        }
    }

    suspend fun getRelatedVideos(videoId: String, limit: Int = 15): List<VideoData> {
        val serverRelated = try {
            api.getRelatedVideos(videoId, limit)
        } catch (e: Exception) {
            emptyList()
        }

        if (serverRelated.isNotEmpty()) {
            return serverRelated
        }

        val localRelated = extractorHelper.getRelatedVideos(videoId)
        if (localRelated.isNotEmpty()) {
            return localRelated
        }

        return extractorHelper.searchVideos("recommended videos")
    }

    suspend fun getComments(videoId: String, limit: Int = 20): List<Comment> {
        val serverComments = try {
            api.getComments(videoId, limit)
        } catch (e: Exception) {
            emptyList()
        }

        if (serverComments.isNotEmpty()) {
            return serverComments
        }

        return extractorHelper.getComments(videoId)
    }
}
