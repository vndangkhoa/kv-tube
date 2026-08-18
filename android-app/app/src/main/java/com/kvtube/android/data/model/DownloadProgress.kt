package com.kvtube.android.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class DownloadStatus {
    IDLE,
    QUEUED,
    EXTRACTING,
    DOWNLOADING,
    PROCESSING,
    COMPLETED,
    ERROR,
    CANCELLED
}

@Serializable
enum class Quality(val value: String, val label: String) {
    LOW("low", "Low (≤360p)"),
    RECOMMENDED("recommended", "Recommended (≤1080p)"),
    BEST("best", "Best Quality")
}

enum class SortCriteria(val label: String) {
    DATE("Date Downloaded"),
    NAME("Video Title"),
    SIZE("File Size"),
    CHANNEL("Channel Name")
}

@Serializable
data class DownloadProgress(
    val videoId: String = "",
    val percent: Float = 0f,
    val speed: String = "",
    val eta: String = "",
    val status: DownloadStatus = DownloadStatus.IDLE,
    val message: String = "",
    val title: String? = null,
    val thumbnail: String? = null,
    val channelTitle: String? = null,
    val duration: String? = null,
    val quality: String? = null
)
