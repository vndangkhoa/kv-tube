package com.kvtube.android.data.repository

import com.kvtube.android.data.local.WatchHistoryDao
import com.kvtube.android.data.local.WatchHistoryEntity
import com.kvtube.android.data.model.VideoData
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Watch history persisted locally in Room — survives restarts, works offline
 * and no longer depends on the retired server endpoints.
 */
@Singleton
class HistoryRepository @Inject constructor(
    private val historyDao: WatchHistoryDao
) {
    fun observeAll(): Flow<List<VideoData>> =
        historyDao.getAll().map { list -> list.map { it.toVideoData() } }

    suspend fun getHistory(limit: Int = 50): List<VideoData> =
        historyDao.getAll().first().take(limit).map { it.toVideoData() }

    /** Records (or refreshes) a watch entry. Safe to call repeatedly. */
    suspend fun record(
        videoId: String,
        title: String = "",
        thumbnail: String = "",
        uploader: String = "",
        channelId: String = "",
        duration: String = ""
    ) {
        if (videoId.isBlank()) return
        val existing = historyDao.getByVideoId(videoId)
        historyDao.upsert(
            WatchHistoryEntity(
                videoId = videoId,
                title = title.ifBlank { existing?.title ?: "" },
                thumbnail = thumbnail.ifBlank { existing?.thumbnail ?: "" },
                channelTitle = uploader.ifBlank { existing?.channelTitle ?: "" },
                channelId = channelId.ifBlank { existing?.channelId ?: "" },
                duration = duration.ifBlank { existing?.duration ?: "" },
                watchedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun remove(videoId: String) = historyDao.deleteByVideoId(videoId)

    suspend fun clearAll() = historyDao.clearAll()

    private fun WatchHistoryEntity.toVideoData() = VideoData(
        id = videoId,
        title = title,
        thumbnail = thumbnail,
        uploader = channelTitle,
        channelTitle = channelTitle,
        channelId = channelId,
        duration = duration,
        watchedAt = watchedAt.toString()
    )
}
