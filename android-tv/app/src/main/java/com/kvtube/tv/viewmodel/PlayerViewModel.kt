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
                val body = try { e.response()?.errorBody()?.string()?.take(400) } catch (_: Exception) { null }
                _state.value = PlayerUiState(isLoading = false, error = body ?: "Video unavailable (HTTP ${e.code()}: ${e.message()})")
            } catch (e: Exception) {
                _state.value = PlayerUiState(isLoading = false, error = e.message ?: "Failed to load")
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

    // Returns a stream URL. Prefers DASH for maximum resolution (4K/1080p),
    // then falls back to HLS or muxed progressive streams.
    fun bestStreamUrl(video: InvidiousVideo): String? {
        fun fix(u: String): String = when {
            u.startsWith("//") -> "https:$u"
            u.startsWith("/") -> "https://yt.khoavo.myds.me$u"
            u.startsWith("http://") -> u.replace("http://", "https://")
            else -> u
        }
        
        // 1. DASH is best for maximum resolution (up to 4K) and adaptive quality.
        video.dashUrl?.takeIf { it.isNotBlank() }?.let { return fix(it) }
        
        // 2. HLS is second best for adaptive quality.
        video.hlsUrl?.takeIf { it.isNotBlank() }?.let { return fix(it) }

        fun muxedHeight(f: com.kvtube.tv.data.model.InvidiousFormatStream): Int =
            f.qualityLabel?.filter { it.isDigit() }?.toIntOrNull() ?: f.resolution?.substringAfter("x")?.toIntOrNull() ?: 0
            
        // 3. Best muxed MP4 with sound (usually capped at 720p).
        video.formatStreams.filter { it.url.isNotBlank() }.maxByOrNull { muxedHeight(it) }?.url?.let { return fix(it) }
        
        // 4. Last resort: adaptive video-only (will be silent without separate audio).
        return video.adaptiveFormats.firstOrNull { it.type.startsWith("video/") }?.url?.let { fix(it) } 
            ?: video.formatStreams.firstOrNull()?.url?.let { fix(it) }
    }

    fun bestMime(url: String): String = when {
        url.contains("/api/manifest/dash/") || url.endsWith(".mpd") -> "application/dash+xml"
        url.endsWith(".m3u8") -> "application/x-mpegURL"
        else -> "video/mp4"
    }
}
