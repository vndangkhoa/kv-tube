package com.kvtube.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PlaybackFormat(
    @SerialName("format_id")
    val formatId: String = "",
    val height: Int = 0,
    val width: Int = 0,
    val vcodec: String = "",
    val acodec: String = "",
    val ext: String = "",
    val bandwidth: Int = 0,
    val fps: Int = 0,
    val filesize: Long = 0,
    val url: String = "",
    @SerialName("has_audio")
    val hasAudio: Boolean = false,
    @SerialName("fragment_count")
    val fragmentCount: Int = 0,
    @SerialName("init_url")
    val initUrl: String = "",
    @SerialName("media_url")
    val mediaUrl: String = ""
) {
    val qualityLabel: String
        get() = when {
            height >= 2160 -> "4K (2160p)"
            height >= 1440 -> "1440p (2K)"
            height >= 1080 -> "1080p"
            height >= 720 -> "720p"
            height >= 480 -> "480p"
            height >= 360 -> "360p"
            height >= 240 -> "240p"
            height >= 144 -> "144p"
            else -> if (height > 0) "${height}p" else "Audio Only"
        }
}

@Serializable
data class PlaybackInfo(
    val title: String = "",
    val duration: Double = 0.0,
    @SerialName("video_formats")
    val videoFormats: List<PlaybackFormat> = emptyList(),
    @SerialName("audio_format")
    val audioFormat: PlaybackFormat? = null
)
