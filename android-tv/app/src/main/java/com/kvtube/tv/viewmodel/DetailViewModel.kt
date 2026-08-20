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
    private val _state = MutableStateFlow(DetailUiState())
    val state: StateFlow<DetailUiState> = _state

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
            } catch (e: retrofit2.HttpException) {
                val body = try { e.response()?.errorBody()?.string()?.take(400) } catch (_: Exception) { null }
                _state.value = DetailUiState(isLoading = false, error = body ?: "Video unavailable (HTTP ${e.code()}: ${e.message()})")
            } catch (e: Exception) {
                _state.value = DetailUiState(isLoading = false, error = e.message ?: "Failed to load video")
            }
        }
    }
}
