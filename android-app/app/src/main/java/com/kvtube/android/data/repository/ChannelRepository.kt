package com.kvtube.android.data.repository

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.bounded
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.model.ChannelInfo
import com.kvtube.android.data.model.VideoData
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChannelRepository @Inject constructor(
    private val api: KVApi,
    private val extractorHelper: ExtractorHelper
) {
    suspend fun getChannelInfo(channelId: String): ChannelInfo? {
        return bounded(8_000L) { api.getChannelInfo(channelId) }
    }

    suspend fun getChannelPage(channelId: String, limit: Int = 48): ChannelInfo? {
        return bounded(8_000L) { api.getChannelPage(channelId, limit) }
    }

    suspend fun getChannelVideos(channelId: String, limit: Int = 48): List<VideoData> {
        return bounded(8_000L) { api.getChannelVideos(channelId, limit) } ?: emptyList()
    }

    suspend fun getChannelWithVideos(
        channelId: String,
        limit: Int = 48
    ): Pair<ChannelInfo?, List<VideoData>> = coroutineScope {
        val infoDeferred = async { bounded(8_000L) { api.getChannelInfo(channelId) } }
        val videosDeferred = async { bounded(8_000L) { api.getChannelVideos(channelId, limit) } ?: emptyList() }
        var channel = infoDeferred.await()
        var videos = videosDeferred.await()
        if (channel == null || videos.isEmpty()) {
            val fallback = bounded(12_000L) { extractorHelper.getChannelInfoAndVideos(channelId, limit) }
            if (fallback != null) {
                channel = channel ?: fallback.first
                if (videos.isEmpty()) {
                    videos = fallback.second
                }
            }
        }
        Pair(channel, videos)
    }

    suspend fun getChannelAvatarFallback(channelId: String): String? {
        val map = bounded { api.getChannelAvatars(channelId) } ?: return null
        return map[channelId]?.displayAvatar
    }
}
