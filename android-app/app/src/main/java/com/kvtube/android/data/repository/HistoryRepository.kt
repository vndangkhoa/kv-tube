package com.kvtube.android.data.repository

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.bounded
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HistoryRepository @Inject constructor(
    private val api: KVApi
) {
    suspend fun getHistory(limit: Int = 50): List<VideoData> {
        return bounded { api.getHistory(limit) } ?: emptyList()
    }

    suspend fun addToHistory(videoId: String, title: String, thumbnail: String, uploader: String): Boolean {
        return bounded { api.addToHistory(videoId, title, thumbnail, uploader) } ?: false
    }

    suspend fun getLiked(limit: Int = 50): List<VideoData> {
        return bounded { api.getLiked(limit) } ?: emptyList()
    }
}
