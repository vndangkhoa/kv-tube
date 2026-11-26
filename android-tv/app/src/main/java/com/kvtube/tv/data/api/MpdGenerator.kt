package com.kvtube.tv.data.api

import android.content.Context
import com.kvtube.tv.data.model.InvidiousAdaptiveFormat
import com.kvtube.tv.player.TvAudioTracks
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
        durationSeconds: Int,
        extraAudioFormats: List<InvidiousAdaptiveFormat> = emptyList(),
    ): File? {
        return try {
            val duration = if (durationSeconds > 0) "PT${durationSeconds}S" else "PT0S"
            val videoMime = video.type.substringBefore(";").trim().ifBlank { "video/mp4" }
            val videoCodecs = extractCodecs(video.type) ?: video.encoding ?: "avc1.640028"
            val videoBandwidth = video.bitrate?.toIntOrNull() ?: 2500000
            val (w, h) = parseResolution(video)

            val fixedVideoUrl = ApiClient.rewriteStreamUrl(video.url)
            val vUrl = fixedVideoUrl.replace("&", "&amp;")

            val audioList = (if (extraAudioFormats.isNotEmpty()) extraAudioFormats else listOf(audio))
                .filter { it.url.isNotBlank() }
                .ifEmpty { listOf(audio) }

            val audioAdaptationSets = audioList.mapIndexed { idx, a ->
                val urlMeta = TvAudioTracks.parseUrlAudioMeta(a.url)
                val audioMime = a.type.substringBefore(";").trim().ifBlank { "audio/mp4" }
                val audioCodecs = extractCodecs(a.type) ?: a.encoding ?: "mp4a.40.2"
                val audioBandwidth = a.bitrate?.toIntOrNull() ?: 128000
                val audioRate = a.audioSampleRate ?: 44100
                val audioLang = a.audioLanguage?.takeIf { it.isNotBlank() } ?: urlMeta.language ?: "und"
                val isOrig = a.isOriginalAudio || urlMeta.isOriginal
                val isDub = !isOrig && (a.isDubbedAudio || urlMeta.isDubbed)
                val isDrc = urlMeta.isStableVolume

                val fixedAudioUrl = ApiClient.rewriteStreamUrl(a.url)
                val aUrl = fixedAudioUrl.replace("&", "&amp;")

                val roles = buildString {
                    if (isOrig) {
                        append("\n      <Role schemeIdUri=\"urn:mpeg:dash:role:2011\" value=\"main\"/>")
                    } else if (isDub) {
                        append("\n      <Role schemeIdUri=\"urn:mpeg:dash:role:2011\" value=\"alternate\"/>")
                        append("\n      <Role schemeIdUri=\"urn:mpeg:dash:role:2011\" value=\"dub\"/>")
                    }
                    if (isDrc) {
                        append("\n      <Role schemeIdUri=\"urn:mpeg:dash:role:2011\" value=\"enhanced-audio-intelligibility\"/>")
                    }
                }
                val labelText = a.audioTrackName?.takeIf { it.isNotBlank() }
                val labelXml = if (labelText != null) {
                    val esc = labelText.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    "\n      <Label>$esc</Label>"
                } else ""
                val repSuffix = buildString {
                    append(a.itag)
                    if (audioLang != "und") append("-$audioLang")
                    if (isOrig) append("-orig")
                    if (isDub) append("-dub")
                    if (isDrc) append("-drc")
                    if (audioList.size > 1) append("-$idx")
                }

                """    <AdaptationSet mimeType="$audioMime" codecs="$audioCodecs" lang="$audioLang" audioSamplingRate="$audioRate" segmentAlignment="true" startWithSAP="1">$roles$labelXml
      <Representation id="$repSuffix" bandwidth="$audioBandwidth" audioSamplingRate="$audioRate" codecs="$audioCodecs" mimeType="$audioMime">
        <BaseURL>$aUrl</BaseURL>
      </Representation>
    </AdaptationSet>"""
            }.joinToString("\n")

            val mpd = """
<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="$duration" minBufferTime="PT0.25S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
  <Period>
    <AdaptationSet mimeType="$videoMime" codecs="$videoCodecs" segmentAlignment="true" startWithSAP="1" width="$w" height="$h" maxWidth="$w" maxHeight="$h">
      <Representation id="${video.itag}" bandwidth="$videoBandwidth" width="$w" height="$h" codecs="$videoCodecs" mimeType="$videoMime">
        <BaseURL>$vUrl</BaseURL>
      </Representation>
    </AdaptationSet>
$audioAdaptationSets
  </Period>
</MPD>
            """.trimIndent()

            val file = File(context.cacheDir, "dash_${videoId}_${video.itag}_${audio.itag}_${audioList.size}.mpd")
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
