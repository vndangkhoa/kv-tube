package com.kvtube.android.data.repository

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HistoryRepository @Inject constructor(
    private val api: KVApi
) {
    suspend fun getHistory(limit: Int = 50): List<VideoData> {
        return api.getHistory(limit)
    }

    suspend fun addToHistory(videoId: String, title: String, thumbnail: String, uploader: String): Boolean {
        return api.addToHistory(videoId, title, thumbnail, uploader)
    }

    suspend fun getLiked(limit: Int = 50): List<VideoData> {
        return api.getLiked(limit)
    }
}
