package com.kvtube.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Subscription(
    val id: Int = 0,
    @SerialName("channel_id")
    val channelId: String = "",
    @SerialName("channel_name")
    val channelName: String = "",
    @SerialName("channel_avatar")
    val channelAvatar: String = ""
)
