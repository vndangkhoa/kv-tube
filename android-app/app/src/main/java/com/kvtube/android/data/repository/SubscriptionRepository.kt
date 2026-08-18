package com.kvtube.android.data.repository

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.model.Subscription
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SubscriptionRepository @Inject constructor(
    private val api: KVApi
) {
    suspend fun getSubscriptions(): List<Subscription> {
        return api.getSubscriptions()
    }

    suspend fun getFeed(perChannel: Int = 5, channels: Int = 20, offset: Int = 0): List<VideoData> {
        return api.getSubscriptionFeed(perChannel, channels, offset)
    }

    suspend fun subscribe(channelId: String, channelName: String, channelAvatar: String): Boolean {
        return api.subscribe(channelId, channelName, channelAvatar)
    }

    suspend fun unsubscribe(channelId: String): Boolean {
        return api.unsubscribe(channelId)
    }

    suspend fun isSubscribed(channelId: String): Boolean {
        return api.isSubscribed(channelId)
    }
}
