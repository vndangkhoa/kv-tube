package com.kvtube.android.ui.screens.shorts

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
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

data class ShortsCommentsState(
    val videoId: String? = null,
    val comments: List<Comment> = emptyList(),
    val continuation: String? = null,
    val commentsCount: Int? = null,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val isSheetOpen: Boolean = false
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

    private val _commentsState = MutableStateFlow(ShortsCommentsState())
    val commentsState: StateFlow<ShortsCommentsState> = _commentsState.asStateFlow()

    private var currentRegion: String = "GLOBAL"
    private var commentsJob: Job? = null

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

    fun openComments(videoId: String) {
        // If already open for this exact video and comments are loaded, just ensure sheet is open
        if (_commentsState.value.isSheetOpen && _commentsState.value.videoId == videoId && _commentsState.value.comments.isNotEmpty()) {
            return
        }

        commentsJob?.cancel()
        _commentsState.value = ShortsCommentsState(
            videoId = videoId,
            isLoading = true,
            isSheetOpen = true
        )

        commentsJob = viewModelScope.launch {
            try {
                val page = videoRepository.getCommentsPage(videoId)
                if (_commentsState.value.videoId == videoId) {
                    _commentsState.value = _commentsState.value.copy(
                        comments = page.comments,
                        continuation = page.continuation,
                        commentsCount = page.commentCount,
                        isLoading = false
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load comments for short $videoId: ${e.message}")
                if (_commentsState.value.videoId == videoId) {
                    _commentsState.value = _commentsState.value.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to load comments"
                    )
                }
            }
        }
    }

    fun closeComments() {
        commentsJob?.cancel()
        _commentsState.value = _commentsState.value.copy(isSheetOpen = false)
    }

    fun loadMoreComments() {
        val state = _commentsState.value
        val vid = state.videoId ?: return
        val token = state.continuation
        if (token.isNullOrBlank() || state.isLoadingMore) return

        viewModelScope.launch {
            _commentsState.value = _commentsState.value.copy(isLoadingMore = true)
            try {
                val nextPage = videoRepository.getCommentsPage(vid, continuation = token)
                if (_commentsState.value.videoId == vid) {
                    _commentsState.value = _commentsState.value.copy(
                        comments = _commentsState.value.comments + nextPage.comments,
                        continuation = nextPage.continuation,
                        isLoadingMore = false
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load more comments for short $vid: ${e.message}")
                _commentsState.value = _commentsState.value.copy(isLoadingMore = false)
            }
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
