package com.kvtube.android.data.repository

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.bounded
import com.kvtube.android.data.model.Subscription
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SubscriptionRepository @Inject constructor(
    private val api: KVApi
) {
    suspend fun getSubscriptions(): List<Subscription> {
        return bounded { api.getSubscriptions() } ?: emptyList()
    }

    suspend fun getFeed(perChannel: Int = 5, channels: Int = 20, offset: Int = 0): List<VideoData> {
        return bounded { api.getSubscriptionFeed(perChannel, channels, offset) } ?: emptyList()
    }

    suspend fun subscribe(channelId: String, channelName: String, channelAvatar: String): Boolean {
        return bounded { api.subscribe(channelId, channelName, channelAvatar) } ?: false
    }

    suspend fun unsubscribe(channelId: String): Boolean {
        return bounded { api.unsubscribe(channelId) } ?: false
    }

    suspend fun isSubscribed(channelId: String): Boolean {
        return bounded { api.isSubscribed(channelId) } ?: false
    }
}
