package com.kvtube.tv.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.model.toTvVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class DetailUiState(
    val video: InvidiousVideo? = null,
    val tvVideo: TvVideo? = null,
    val related: List<TvVideo> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

class DetailViewModel : ViewModel() {
    private val repo = InvidiousRepository()
    private val historyRepo = com.kvtube.tv.data.repository.TvHistoryRepository.getInstance()
    private val _state = MutableStateFlow(DetailUiState())
    val state: StateFlow<DetailUiState> = _state

    private fun extractJsonError(body: String): String? = try {
        val j = org.json.JSONObject(body)
        j.optString("error").takeIf { it.isNotBlank() } ?: j.toString().take(300)
    } catch (_: Exception) { body.take(400) }

    fun load(videoId: String) {
        val id = videoId.trim()
        if (id.isBlank()) {
            _state.value = DetailUiState(isLoading = false, error = "Video not found")
            return
        }
        viewModelScope.launch {
            _state.value = DetailUiState(isLoading = true)
            try {
                val v = repo.video(id)
                val tv = v.toTvVideo()
                val related = runCatching { repo.related(v) }.getOrDefault(emptyList())
                _state.value = DetailUiState(video = v, tvVideo = tv, related = related, isLoading = false)
                historyRepo.recordWatch(tv)
            } catch (e: retrofit2.HttpException) {
                val body = try { e.response()?.errorBody()?.string()?.take(500) } catch (_: Exception) { null }
                // Body is often JSON {"error":"..."} — extract the message for TV overlay
                val msg = body?.let { extractJsonError(it) } ?: body
                _state.value = DetailUiState(isLoading = false, error = msg ?: "Video unavailable (HTTP ${e.code()}: ${e.message()})")
            } catch (e: Exception) {
                // InnerTube fallback throws IllegalStateException with reason (e.g. "Video unavailable")
                _state.value = DetailUiState(isLoading = false, error = e.message?.take(500) ?: "Failed to load video")
            }
        }
    }
}
