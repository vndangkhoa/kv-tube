package com.kvtube.tv.data.api

import android.content.Context
import com.kvtube.tv.data.model.InvidiousAdaptiveFormat
import java.io.File

/**
 * Generates a minimal DASH MPD that references two progressive googlevideo URLs
 * (one video-only, one audio-only) as separate AdaptationSets.
 * ExoPlayer's DASH support handles this far more robustly than MergingMediaSource
 * for mixed codecs/containers, and ensures maximum-resolution playback (1080p/4K)
 * with audio on all devices.
 */
object MpdGenerator {

    fun generate(
        context: Context,
        videoId: String,
        video: InvidiousAdaptiveFormat,
        audio: InvidiousAdaptiveFormat,
        durationSeconds: Int
    ): File? {
        return try {
            val duration = if (durationSeconds > 0) "PT${durationSeconds}S" else "PT0S"
            val videoMime = video.type.substringBefore(";").trim().ifBlank { "video/mp4" }
            val audioMime = audio.type.substringBefore(";").trim().ifBlank { "audio/mp4" }
            val videoCodecs = extractCodecs(video.type) ?: video.encoding ?: "avc1.640028"
            val audioCodecs = extractCodecs(audio.type) ?: audio.encoding ?: "mp4a.40.2"
            val videoBandwidth = video.bitrate?.toIntOrNull() ?: 2500000
            val audioBandwidth = audio.bitrate?.toIntOrNull() ?: 128000
            val (w, h) = parseResolution(video)
            val audioRate = audio.audioSampleRate ?: 44100

            // Escape URLs for XML
            val vUrl = video.url.replace("&", "&amp;")
            val aUrl = audio.url.replace("&", "&amp;")

            val mpd = """
<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="$duration" minBufferTime="PT1.5S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
  <Period>
    <AdaptationSet mimeType="$videoMime" codecs="$videoCodecs" segmentAlignment="true" startWithSAP="1" width="$w" height="$h" maxWidth="$w" maxHeight="$h">
      <Representation id="${video.itag}" bandwidth="$videoBandwidth" width="$w" height="$h" codecs="$videoCodecs" mimeType="$videoMime">
        <BaseURL>$vUrl</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="$audioMime" codecs="$audioCodecs" lang="en" audioSamplingRate="$audioRate" segmentAlignment="true" startWithSAP="1">
      <Representation id="${audio.itag}" bandwidth="$audioBandwidth" audioSamplingRate="$audioRate" codecs="$audioCodecs" mimeType="$audioMime">
        <BaseURL>$aUrl</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
            """.trimIndent()

            val file = File(context.cacheDir, "dash_${videoId}_${video.itag}_${audio.itag}.mpd")
            file.writeText(mpd)
            file
        } catch (e: Exception) {
            null
        }
    }

    private fun extractCodecs(mime: String): String? {
        // mime = video/mp4; codecs="avc1.640028, mp4a.40.2" or audio/webm; codecs="opus"
        val start = mime.indexOf("codecs=\"")
        if (start == -1) return null
        val end = mime.indexOf('"', start + 8)
        if (end == -1) return null
        return mime.substring(start + 8, end).substringBefore(",").trim()
    }

    private fun parseResolution(fmt: InvidiousAdaptiveFormat): Pair<Int, Int> {
        val res = fmt.resolution ?: fmt.qualityLabel ?: ""
        // Try "1920x1080"
        if (res.contains("x")) {
            val parts = res.split("x")
            val w = parts.getOrNull(0)?.filter { it.isDigit() }?.toIntOrNull() ?: 0
            val h = parts.getOrNull(1)?.filter { it.isDigit() }?.toIntOrNull() ?: 0
            if (w > 0 && h > 0) return w to h
        }
        // Try "1080p"
        val h = res.filter { it.isDigit() }.toIntOrNull() ?: 0
        if (h > 0) {
            val w = when (h) {
                2160 -> 3840
                1440 -> 2560
                1080 -> 1920
                720 -> 1280
                480 -> 854
                360 -> 640
                240 -> 426
                144 -> 256
                else -> (h * 16 / 9)
            }
            return w to h
        }
        return 1280 to 720
    }
}
