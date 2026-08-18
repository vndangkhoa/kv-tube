package com.kvtube.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class VideoData(
    val id: String = "",
    val title: String = "",
    val description: String = "",
    val duration: String = "",
    @SerialName("duration_seconds")
    val durationSeconds: Long = 0,
    val views: String = "",
    @SerialName("view_count")
    val viewCount: Long = 0,
    val published: String = "",
    @SerialName("upload_date")
    val uploadDate: String = "",
    @SerialName("uploaded_at")
    val uploadedAt: String = "",
    @SerialName("watched_at")
    val watchedAt: String = "",
    val thumbnail: String = "",
    val uploader: String = "",
    @SerialName("uploader_id")
    val uploaderId: String = "",
    @SerialName("channel_id")
    val channelId: String = "",
    @SerialName("channel_title")
    val channelTitle: String = "",
    @SerialName("channel_thumbnail")
    val channelThumbnail: String = "",
    @SerialName("subscriber_count")
    val subscriberCount: String = "",
    @SerialName("is_live")
    val isLive: Boolean = false,
    @SerialName("is_short")
    val isShort: Boolean = false,
    @SerialName("stream_url")
    val streamUrl: String = ""
) {
    val displayChannelTitle: String
        get() = channelTitle.ifEmpty { uploader }.ifEmpty { "Unknown Channel" }

    val displayChannelId: String
        get() = channelId.ifEmpty { uploaderId }.ifEmpty { uploader }

    val displayThumbnail: String
        get() = when {
            thumbnail.startsWith("http") -> thumbnail
            thumbnail.startsWith("/") -> "https://ut.khoavo.myds.me$thumbnail"
            id.isNotBlank() -> "https://i.ytimg.com/vi/$id/hqdefault.jpg"
            else -> ""
        }

    val displayViews: String
        get() = when {
            views.isNotBlank() -> views
            viewCount > 0 -> formatViewCount(viewCount)
            else -> ""
        }

    val displayPublished: String
        get() = when {
            published.isNotBlank() -> published
            uploadedAt.isNotBlank() -> uploadedAt
            uploadDate.isNotBlank() -> formatUploadDate(uploadDate)
            else -> ""
        }

    val viewCountFormatted: String
        get() = displayViews

    val publishedAt: String
        get() = displayPublished

    private fun formatViewCount(count: Long): String {
        return when {
            count >= 1_000_000_000 -> String.format("%.1fB views", count / 1_000_000_000.0)
            count >= 1_000_000 -> String.format("%.1fM views", count / 1_000_000.0)
            count >= 1_000 -> String.format("%.1fK views", count / 1_000.0)
            else -> "$count views"
        }
    }

    private fun formatUploadDate(rawDate: String): String {
        if (rawDate.length == 8) {
            val year = rawDate.substring(0, 4)
            val month = rawDate.substring(4, 6)
            val day = rawDate.substring(6, 8)
            return "$year-$month-$day"
        }
        return rawDate
    }
}
