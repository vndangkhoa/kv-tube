package com.kvtube.android.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "watch_history")
data class WatchHistoryEntity(
    @PrimaryKey
    val videoId: String,
    val title: String,
    val thumbnail: String,
    val channelTitle: String,
    val channelId: String,
    val duration: String,
    val watchedAt: Long = System.currentTimeMillis()
)
