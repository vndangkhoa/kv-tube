package com.kvtube.tv.data.api

import com.kvtube.tv.data.model.InvidiousAdaptiveFormat
import com.kvtube.tv.data.model.InvidiousCaption
import com.kvtube.tv.data.model.InvidiousFormatStream
import com.kvtube.tv.data.model.InvidiousThumbnail
import com.kvtube.tv.data.model.InvidiousVideo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Direct YouTube InnerTube fallback — bypasses Invidious entirely.
 * Uses the public ANDROID client (no PO token, no signature decipher).
 * Mirrors the backend's yt-dlp ANDROID fallback (KB §4).
 *
 * This is the TV equivalent of the web player's shaka + Invidious dashUrl:
 * when Invidious returns 500 "This content isn't available" (broken companion),
 * we fetch streams directly from youtubei/v1/player.
 */
object InnerTubeApi {
    private const val API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
    private const val PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?key=$API_KEY"

    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private data class ClientConfig(
        val name: String,
        val version: String,
        val userAgent: String,
        val androidSdk: Int? = null
    )

    // Multiple clients — ANDROID primary (direct URLs), VISIONOS (yt-dlp fallback, often works when ANDROID 403), IOS, WEB
    private val clients = listOf(
        ClientConfig("ANDROID", "20.10.38", "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip", 30),
        ClientConfig("ANDROID", "19.09.37", "com.google.android.youtube/19.09.37 (Linux; U; Android 10) gzip", 29),
        ClientConfig("VISIONOS", "1.0", "com.google.ios.youtube/19.29.1 (iPhone14,3; U; CPU iOS 17_5 like Mac OS X)", null),
        ClientConfig("IOS", "19.29.1", "com.google.ios.youtube/19.29.1 (iPhone14,3; U; CPU iOS 17_5 like Mac OS X)"),
        ClientConfig("WEB", "2.20241202.00.00", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    )

    /**
     * Fetches streaming data for [videoId] via InnerTube with multi-client fallback.
     * Tries ANDROID → IOS → WEB until one returns OK with playable streams.
     * Returns an [InvidiousVideo] populated with formatStreams/adaptiveFormats/dashUrl/hlsUrl
     * so the existing PlayerViewModel logic works unchanged.
     * Throws on playability error (age gate, removed, etc) after all clients fail.
     */
    suspend fun getVideo(videoId: String): InvidiousVideo = withContext(Dispatchers.IO) {
        val cleanId = videoId.trim()
        require(cleanId.isNotBlank()) { "Empty videoId" }

        var lastError: Exception? = null
        for (cfg in clients) {
            try {
                val result = fetchWithClient(cleanId, cfg)
                // Ensure at least one playable stream
                if (result.dashUrl.isNullOrBlank() && result.hlsUrl.isNullOrBlank()
                    && result.formatStreams.isEmpty() && result.adaptiveFormats.isEmpty()
                ) {
                    lastError = IllegalStateException("No streams from ${cfg.name}")
                    continue
                }
                return@withContext result
            } catch (e: Exception) {
                lastError = e
                // Don't retry on 404 removed video etc — but for UNPLAYABLE try next client
                val msg = e.message ?: ""
                if (msg.contains("Video unavailable") && !msg.contains("UNPLAYABLE")) {
                    // Hard error (removed/private) — no point trying other clients
                    throw e
                }
                continue
            }
        }
        throw lastError ?: IllegalStateException("All InnerTube clients failed for $cleanId")
    }

    private fun fetchWithClient(videoId: String, cfg: ClientConfig): InvidiousVideo {
        val bodyJson = JSONObject().apply {
            put("videoId", videoId)
            put("context", JSONObject().apply {
                put("client", JSONObject().apply {
                    put("clientName", cfg.name)
                    put("clientVersion", cfg.version)
                    if (cfg.androidSdk != null) put("androidSdkVersion", cfg.androidSdk)
                    put("hl", "en")
                    put("gl", "VN")
                })
            })
            put("contentCheckOk", true)
            put("racyCheckOk", true)
        }.toString()

        val req = Request.Builder()
            .url(PLAYER_URL)
            .post(bodyJson.toRequestBody("application/json".toMediaType()))
            .header("Content-Type", "application/json")
            .header("User-Agent", cfg.userAgent)
            .header("X-Goog-Api-Format-Version", "2")
            .build()

        client.newCall(req).execute().use { resp ->
            val raw = resp.body?.string() ?: throw IllegalStateException("Empty InnerTube response from ${cfg.name}")
            if (!resp.isSuccessful) {
                throw IllegalStateException("InnerTube ${cfg.name} HTTP ${resp.code}: ${raw.take(400)}")
            }
            return parsePlayerResponse(videoId, raw)
        }
    }

    private fun parsePlayerResponse(videoId: String, raw: String): InvidiousVideo {
        val root = JSONObject(raw)

        // --- playabilityStatus ---
        val statusObj = root.optJSONObject("playabilityStatus")
        val status = statusObj?.optString("status", "UNKNOWN") ?: "UNKNOWN"
        if (status != "OK") {
            val reason = statusObj?.optString("reason") ?: statusObj?.optString("messages")?.let { it } ?: status
            val subReason = statusObj?.optJSONArray("errorScreen")?.toString()?.take(200) ?: ""
            // LIVE, UNPLAYABLE etc — throw so caller can show proper error
            throw IllegalStateException(reason.ifBlank { "Video unavailable ($status) $subReason".take(300) })
        }

        val details = root.optJSONObject("videoDetails") ?: JSONObject()
        val microformat = root.optJSONObject("microformat")
            ?.optJSONObject("playerMicroformatRenderer") ?: JSONObject()
        val streaming = root.optJSONObject("streamingData") ?: JSONObject()

        val title = details.optString("title", "").ifBlank { microformat.optString("title", "Untitled") }
        val author = details.optString("author", "").ifBlank { details.optString("channelId", "Unknown") }
        val channelId = details.optString("channelId", "")
        val viewCount = details.optString("viewCount", "").toLongOrNull()
        val lengthSeconds = details.optString("lengthSeconds", "0").toIntOrNull() ?: 0
        val isLive = details.optBoolean("isLiveContent", false)
        val shortDesc = details.optString("shortDescription", "")
        val thumbList = buildList {
            // InnerTube provides thumbnails.thumbnails array
            val thumbs = details.optJSONObject("thumbnail")
                ?.optJSONArray("thumbnails")
            if (thumbs != null) {
                for (i in 0 until thumbs.length()) {
                    val t = thumbs.optJSONObject(i) ?: continue
                    val url = t.optString("url", "")
                    if (url.isNotBlank()) add(
                        InvidiousThumbnail(
                            url = url,
                            width = t.optInt("width"),
                            height = t.optInt("height")
                        )
                    )
                }
            }
            if (isEmpty()) add(InvidiousThumbnail(url = "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"))
        }
        val authorThumbs = mutableListOf<InvidiousThumbnail>()

        val dashUrl = streaming.optString("dashManifestUrl").takeIf { it.isNotBlank() }
        val hlsUrl = streaming.optString("hlsManifestUrl").takeIf { it.isNotBlank() }

        // --- formats (muxed, has both audio+video, usually 360p itag 18) -> formatStreams ---
        val muxed = mutableListOf<InvidiousFormatStream>()
        val formats = streaming.optJSONArray("formats")
        if (formats != null) {
            for (i in 0 until formats.length()) {
                val f = formats.optJSONObject(i) ?: continue
                val url = f.optString("url", "")
                if (url.isBlank()) continue // ciphered without url -> skip (ANDROID gives direct url)
                val itag = f.optInt("itag", 0).toString()
                val mime = f.optString("mimeType", "")
                val quality = f.optString("quality", "")
                val qualLabel = f.optString("qualityLabel").takeIf { it.isNotBlank() }
                val w = f.optInt("width", 0)
                val h = f.optInt("height", 0)
                muxed.add(
                    InvidiousFormatStream(
                        url = url,
                        itag = itag,
                        type = mime,
                        quality = quality,
                        fps = f.optInt("fps", 0).takeIf { it != 0 },
                        container = mime.substringBefore("/").substringBefore(";").ifBlank { null },
                        encoding = mime.substringAfter("codecs=\"", "").substringBefore("\"").ifBlank { null },
                        resolution = if (w > 0 && h > 0) "${w}x$h" else null,
                        qualityLabel = qualLabel ?: f.optString("qualityLabel").takeIf { it.isNotBlank() },
                        size = "${w}x$h"
                    )
                )
            }
        }

        // --- adaptiveFormats (video-only + audio-only) -> adaptiveFormats + maybe dash adaptive ---
        val adaptive = mutableListOf<InvidiousAdaptiveFormat>()
        val adaptiveJson = streaming.optJSONArray("adaptiveFormats")
        if (adaptiveJson != null) {
            for (i in 0 until adaptiveJson.length()) {
                val f = adaptiveJson.optJSONObject(i) ?: continue
                val url = f.optString("url", "")
                if (url.isBlank()) continue
                val itag = f.optInt("itag", 0).toString()
                val mime = f.optString("mimeType", "")
                val w = f.optInt("width", 0)
                val h = f.optInt("height", 0)
                val qualLabel = f.optString("qualityLabel").takeIf { it.isNotBlank() }
                val audioQ = f.optString("audioQuality").takeIf { it.isNotBlank() }
                adaptive.add(
                    InvidiousAdaptiveFormat(
                        url = url,
                        itag = itag,
                        type = mime,
                        qualityLabel = qualLabel,
                        resolution = if (w > 0 && h > 0) "${w}x$h" else null,
                        container = mime.substringBefore("/").substringBefore(";").ifBlank { null },
                        encoding = mime.substringAfter("codecs=\"", "").substringBefore("\"").ifBlank { null },
                        bitrate = f.optInt("bitrate", 0).toString().takeIf { it != "0" },
                        fps = f.optInt("fps", 0).takeIf { it != 0 },
                        audioQuality = audioQ,
                        audioSampleRate = f.optInt("audioSampleRate", 0).takeIf { it != 0 },
                        audioChannels = f.optInt("audioChannels", 0).takeIf { it != 0 }
                    )
                )
            }
        }

        // recommendedVideos left empty — Detail will fetch via other means
        return InvidiousVideo(
            title = title,
            videoId = videoId,
            videoThumbnails = thumbList,
            description = shortDesc,
            viewCount = viewCount,
            author = author,
            authorId = channelId,
            authorUrl = if (channelId.isNotBlank()) "/channel/$channelId" else null,
            authorThumbnails = authorThumbs,
            lengthSeconds = lengthSeconds,
            liveNow = isLive,
            dashUrl = dashUrl,
            hlsUrl = hlsUrl,
            adaptiveFormats = adaptive,
            formatStreams = muxed,
            captions = emptyList(),
            recommendedVideos = emptyList(),
            genre = null,
            genreUrl = null
        )
    }
}
