package com.kvtube.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ChannelInfo(
    val id: String = "",
    val title: String = "",
    @SerialName("subscriber_count")
    val subscriberCount: Long = 0,
    val avatar: String = "",
    @SerialName("avatar_url")
    val avatarUrl: String = "",
    @SerialName("banner_url")
    val bannerUrl: String = "",
    val description: String = "",
    @SerialName("video_count")
    val videoCount: Int = 0
) {
    val displayAvatar: String
        get() = avatarUrl.ifEmpty { avatar }

    val displaySubscriberCount: String
        get() = when {
            subscriberCount >= 1_000_000 -> String.format("%.1fM subscribers", subscriberCount / 1_000_000.0)
            subscriberCount >= 1_000 -> String.format("%.1fK subscribers", subscriberCount / 1_000.0)
            subscriberCount > 0 -> "$subscriberCount subscribers"
            else -> ""
        }
}
