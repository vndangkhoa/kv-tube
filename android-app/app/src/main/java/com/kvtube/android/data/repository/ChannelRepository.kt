package com.kvtube.android.data.repository

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.model.ChannelInfo
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChannelRepository @Inject constructor(
    private val api: KVApi
) {
    suspend fun getChannelInfo(channelId: String): ChannelInfo? {
        return api.getChannelInfo(channelId)
    }

    suspend fun getChannelPage(channelId: String, limit: Int = 48): ChannelInfo? {
        return api.getChannelPage(channelId, limit)
    }

    suspend fun getChannelVideos(channelId: String, limit: Int = 48): List<VideoData> {
        return api.getChannelVideos(channelId, limit)
    }

    suspend fun getChannelAvatarFallback(channelId: String): String? {
        val map = api.getChannelAvatars(channelId)
        return map[channelId]?.displayAvatar
    }
}
