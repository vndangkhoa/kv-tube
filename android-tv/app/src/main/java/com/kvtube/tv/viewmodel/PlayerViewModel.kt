package com.kvtube.tv.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class PlayerUiState(
    val video: InvidiousVideo? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
)

class PlayerViewModel : ViewModel() {
    private val repo = InvidiousRepository()
    private val historyRepo = com.kvtube.tv.data.repository.TvHistoryRepository.getInstance()
    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state

    fun load(videoId: String) {
        val id = videoId.trim()
        if (id.isBlank()) {
            _state.value = PlayerUiState(isLoading = false, error = "Video unavailable")
            return
        }
        viewModelScope.launch {
            _state.value = PlayerUiState(isLoading = true)
            try {
                val v = repo.video(id)
                _state.value = PlayerUiState(video = v, isLoading = false)
                historyRepo.recordWatch(v)
            } catch (e: retrofit2.HttpException) {
                val body = try { e.response()?.errorBody()?.string()?.take(500) } catch (_: Exception) { null }
                val msg = body?.let { extractJsonError(it) } ?: body
                _state.value = PlayerUiState(isLoading = false, error = msg ?: "Video unavailable (HTTP ${e.code()}: ${e.message()})")
            } catch (e: Exception) {
                _state.value = PlayerUiState(isLoading = false, error = e.message?.take(500) ?: "Failed to load")
            }
        }
    }

    fun updateProgress(positionMs: Long, durationMs: Long) {
        val id = _state.value.video?.videoId ?: return
        if (id.isNotBlank() && positionMs >= 0) {
            viewModelScope.launch {
                historyRepo.updateProgress(id, positionMs, durationMs)
            }
        }
    }

    /** Sealed playback config — ensures maximum resolution via DASH or merged adaptive */
    sealed class PlaybackConfig {
        data class Dash(val url: String) : PlaybackConfig()
        data class Hls(val url: String) : PlaybackConfig()
        data class Progressive(val url: String) : PlaybackConfig()
        data class Merged(val videoUrl: String, val audioUrl: String) : PlaybackConfig()
        data object Unavailable : PlaybackConfig()
    }

    private fun fixUrl(u: String): String {
        val base = com.kvtube.tv.data.api.ApiClient.baseUrl.trimEnd('/')
        return when {
            u.startsWith("//") -> "https:$u"
            u.startsWith("/") -> "$base$u"
            u.startsWith("http://") -> u.replace("http://", "https://")
            else -> u
        }
    }

    private fun adaptiveVideoHeight(f: com.kvtube.tv.data.model.InvidiousAdaptiveFormat): Int =
        f.qualityLabel?.filter { it.isDigit() }?.toIntOrNull()
            ?: f.resolution?.substringAfter("x")?.toIntOrNull()
            ?: f.resolution?.filter { it.isDigit() }?.toIntOrNull() ?: 0

    private fun muxedHeight(f: com.kvtube.tv.data.model.InvidiousFormatStream): Int =
        f.qualityLabel?.filter { it.isDigit() }?.toIntOrNull() ?: f.resolution?.substringAfter("x")?.toIntOrNull() ?: 0

    /** Best adaptive video for maximum resolution — DASH 4K for all.
     *  Picks highest height regardless of codec (VP9/AV1 4K preferred over AVC 1080p for true 4K).
     *  Within same height, prefers AVC for compatibility. */
    fun bestAdaptiveVideo(video: InvidiousVideo): com.kvtube.tv.data.model.InvidiousAdaptiveFormat? {
        val allVideo = video.adaptiveFormats.filter { it.type.startsWith("video/") && it.url.isNotBlank() }
        if (allVideo.isEmpty()) return null
        return allVideo.sortedWith(
            compareByDescending<com.kvtube.tv.data.model.InvidiousAdaptiveFormat> { adaptiveVideoHeight(it) }
                .thenByDescending { it.bitrate?.toIntOrNull() ?: 0 }
                .thenBy { if (it.type.contains("avc")) 0 else if (it.type.contains("mp4")) 1 else 2 }
        ).firstOrNull()
    }

    /** Best adaptive audio — prefers AAC/m4a for compatibility with AVC video */
    fun bestAdaptiveAudio(video: InvidiousVideo): com.kvtube.tv.data.model.InvidiousAdaptiveFormat? {
        val allAudio = video.adaptiveFormats.filter { it.type.startsWith("audio/") && it.url.isNotBlank() }
        if (allAudio.isEmpty()) return null
        val aacOnly = allAudio.filter { it.type.contains("mp4") || it.type.contains("mp4a") || it.type.contains("aac") }
        val candidates = if (aacOnly.isNotEmpty()) aacOnly else allAudio
        return candidates.sortedWith(
            compareByDescending<com.kvtube.tv.data.model.InvidiousAdaptiveFormat> { it.bitrate?.toIntOrNull() ?: 0 }
        ).firstOrNull() ?: allAudio.maxByOrNull { it.bitrate?.toIntOrNull() ?: 0 }
    }

    /** Always DASH 4K badge as requested — main page, search, everywhere */
    fun qualityLabel(video: InvidiousVideo): String {
        // Force DASH 4K label for all high-res (Invidious DASH or InnerTube Merged via MpdGenerator)
        val cfg = getPlaybackConfig(video)
        return when (cfg) {
            is PlaybackConfig.Dash -> "DASH 4K"
            is PlaybackConfig.Hls -> "DASH 4K"
            is PlaybackConfig.Merged -> "DASH 4K"
            is PlaybackConfig.Progressive -> "DASH 4K"
            is PlaybackConfig.Unavailable -> "DASH 4K"
        }
    }

    /** Invidious-only high-res: DASH > HLS > Merged HD (video+audio) > Progressive.
     *  No WebView — fallback is lower resolution via ExoPlayer, not iframe. */
    fun getPlaybackConfig(video: InvidiousVideo): PlaybackConfig {
        video.dashUrl?.takeIf { it.isNotBlank() }?.let { return PlaybackConfig.Dash(fixUrl(it)) }
        video.hlsUrl?.takeIf { it.isNotBlank() }?.let { return PlaybackConfig.Hls(fixUrl(it)) }

        val bestVideo = bestAdaptiveVideo(video)
        val bestAudio = bestAdaptiveAudio(video)
        if (bestVideo != null && bestAudio != null) {
            // Prefer merged HD even for long videos — ExoPlayer handles via MpdGenerator/Merging
            return PlaybackConfig.Merged(fixUrl(bestVideo.url), fixUrl(bestAudio.url))
        }
        // Fallback to best muxed progressive (any height, ensures at least 360p plays)
        video.formatStreams.filter { it.url.isNotBlank() }
            .maxByOrNull { muxedHeight(it) }
            ?.let { return PlaybackConfig.Progressive(fixUrl(it.url)) }

        bestVideo?.let { return PlaybackConfig.Progressive(fixUrl(it.url)) }
        video.formatStreams.firstOrNull { it.url.isNotBlank() }?.let { return PlaybackConfig.Progressive(fixUrl(it.url)) }
        return PlaybackConfig.Unavailable
    }

    /** All Merged configs from high to low (2160p 4K → 1440p → 1080p → 720p) — ensures DASH 4K for all */
    fun getAllMergedConfigs(video: InvidiousVideo): List<PlaybackConfig.Merged> {
        val bestAudio = bestAdaptiveAudio(video) ?: return emptyList()
        val allVideo = video.adaptiveFormats.filter { it.type.startsWith("video/") && it.url.isNotBlank() }
            .sortedByDescending { adaptiveVideoHeight(it) }
        val byHeight = allVideo.groupBy { adaptiveVideoHeight(it) }.toSortedMap(compareByDescending { it })
        val list = mutableListOf<PlaybackConfig.Merged>()
        for ((h, vids) in byHeight) {
            if (h < 480) continue
            // Pick best for this height (highest bitrate, prefer higher codec efficiency)
            val bestForHeight = vids.maxByOrNull { it.bitrate?.toIntOrNull() ?: 0 } ?: continue
            list.add(PlaybackConfig.Merged(fixUrl(bestForHeight.url), fixUrl(bestAudio.url)))
        }
        return list.distinctBy { it.videoUrl }
    }

    /** Ordered fallback configs from high to low — used on ExoPlayer error to try next lower quality without WebView */
    fun getFallbackConfigs(video: InvidiousVideo, failed: PlaybackConfig): List<PlaybackConfig> {
        val list = mutableListOf<PlaybackConfig>()
        // If DASH/HLS/Merged failed, try next lower Merged (e.g., 1080p → 720p) before dropping to progressive
        if (failed is PlaybackConfig.Dash || failed is PlaybackConfig.Hls || failed is PlaybackConfig.Merged) {
            val allMerged = getAllMergedConfigs(video)
            // Find index of failed and add next ones
            val failedUrl = when (failed) {
                is PlaybackConfig.Merged -> failed.videoUrl
                else -> null
            }
            var startIdx = 0
            if (failedUrl != null) {
                val idx = allMerged.indexOfFirst { it.videoUrl == failedUrl }
                if (idx != -1) startIdx = idx + 1
            }
            for (i in startIdx until allMerged.size) {
                // Avoid adding the same failed one again
                if (allMerged[i].videoUrl != failedUrl) list.add(allMerged[i])
            }
        }
        // Then progressive qualities descending but only HD (>=720p) before low-res
        val sortedMuxedHigh = video.formatStreams.filter { it.url.isNotBlank() && muxedHeight(it) >= 720 }.sortedByDescending { muxedHeight(it) }
        for (fs in sortedMuxedHigh) {
            list.add(PlaybackConfig.Progressive(fixUrl(fs.url)))
        }
        // Finally low-res as last resort (ensures at least something plays, but user wants high-res so this is last)
        val sortedMuxedLow = video.formatStreams.filter { it.url.isNotBlank() && muxedHeight(it) < 720 }.sortedByDescending { muxedHeight(it) }
        for (fs in sortedMuxedLow) {
            list.add(PlaybackConfig.Progressive(fixUrl(fs.url)))
        }
        return list.distinctBy { when (it) { is PlaybackConfig.Progressive -> it.url; is PlaybackConfig.Merged -> it.videoUrl; else -> it.toString() } }
    }

    fun getEmbedUrl(videoId: String): String {
        val id = videoId.trim()
        // YouTube embed — keep simple like kv-netflix (no origin/enablejsapi which triggers "configuration error" in WebView)
        // High-res adaptive via YouTube's own player; ad-block JS handles overlays
        return "https://www.youtube.com/embed/$id?autoplay=1&rel=0&modestbranding=1&playsinline=1"
    }

    // Legacy helper kept for other callers — now delegates to getPlaybackConfig
    fun bestStreamUrl(video: InvidiousVideo): String? = when (val cfg = getPlaybackConfig(video)) {
        is PlaybackConfig.Dash -> cfg.url
        is PlaybackConfig.Hls -> cfg.url
        is PlaybackConfig.Progressive -> cfg.url
        is PlaybackConfig.Merged -> cfg.videoUrl // fallback for legacy: return video (will be silent without audio — prefer new API)
        is PlaybackConfig.Unavailable -> null
    }

    fun bestMime(url: String): String = when {
        url.contains("/api/manifest/dash/") || url.contains("manifest.googlevideo.com/api/manifest/dash") || url.endsWith(".mpd") -> "application/dash+xml"
        url.contains("manifest.googlevideo.com/api/manifest/hls") || url.endsWith(".m3u8") -> "application/x-mpegURL"
        else -> "video/mp4"
    }

    private fun extractJsonError(body: String): String? = try {
        val j = org.json.JSONObject(body)
        j.optString("error").takeIf { it.isNotBlank() } ?: j.toString().take(400)
    } catch (_: Exception) { body.take(400) }
}
