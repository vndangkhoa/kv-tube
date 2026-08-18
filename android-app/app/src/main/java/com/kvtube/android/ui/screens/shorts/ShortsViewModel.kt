package com.kvtube.android.ui.screens.shorts

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ShortsUiState(
    val videos: List<VideoData> = emptyList(),
    val isLoading: Boolean = true
)

@HiltViewModel
class ShortsViewModel @Inject constructor(
    private val videoRepository: VideoRepository,
    private val settingsDataStore: SettingsDataStore,
    private val extractorHelper: ExtractorHelper
) : ViewModel() {

    companion object {
        private const val TAG = "ShortsViewModel"
    }

    private val _uiState = MutableStateFlow(ShortsUiState())
    val uiState: StateFlow<ShortsUiState> = _uiState.asStateFlow()
    private var currentRegion: String = "GLOBAL"

    init {
        viewModelScope.launch {
            currentRegion = settingsDataStore.region.first()
            loadShorts()
        }
    }

    fun refresh() {
        loadShorts()
    }

    suspend fun getStreamUrl(videoId: String): String {
        return try {
            // 1. Fast on-device extraction first (~300ms)
            val extracted = extractorHelper.extractStreamUrl(videoId, Quality.RECOMMENDED)
            if (extracted.videoUrl.isNotBlank()) {
                return extracted.videoUrl
            }
            // 2. Server playback fallback with 2s timeout
            val playback = kotlinx.coroutines.withTimeoutOrNull(2000L) {
                runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()
            }
            val progressive = playback?.videoFormats?.firstOrNull { it.hasAudio && it.url.isNotEmpty() }
            progressive?.url ?: ""
        } catch (e: Exception) {
            Log.w(TAG, "Failed to resolve stream for short $videoId: ${e.message}")
            ""
        }
    }

    private fun loadShorts() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true)
                val query = if (currentRegion == "VN") "#shorts việt nam trending" else "#shorts trending"
                val videos = videoRepository.search(query, 20, currentRegion)
                _uiState.value = ShortsUiState(
                    videos = videos,
                    isLoading = false
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.value = ShortsUiState(isLoading = false)
            }
        }
    }
}
