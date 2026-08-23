package com.kvtube.android.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "subscribed_channels")
data class SubscribedChannelEntity(
    @PrimaryKey
    val channelId: String,
    val channelName: String,
    val channelAvatar: String = "",
    val subscribedAt: Long = System.currentTimeMillis()
)
