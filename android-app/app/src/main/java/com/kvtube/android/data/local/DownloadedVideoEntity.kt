package com.kvtube.android.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloaded_videos")
data class DownloadedVideoEntity(
    @PrimaryKey val videoId: String,
    val title: String,
    val quality: String,
    val filePath: String,
    val fileSize: Long,
    val duration: String,
    val thumbnail: String,
    val channelTitle: String,
    val contentUri: String? = null,
    val downloadedAt: Long = System.currentTimeMillis()
)
