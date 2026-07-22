package com.kvtube.android.ui.screens.watch

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.DownloadProgress
import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.DownloadRepository
import com.kvtube.android.data.repository.HistoryRepository
import com.kvtube.android.data.repository.VideoRepository
import com.kvtube.android.data.repository.SubscriptionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import android.util.Log
import javax.inject.Inject

data class WatchUiState(
    val video: VideoData? = null,
    val playbackInfo: PlaybackInfo? = null,
    val relatedVideos: List<VideoData> = emptyList(),
    val comments: List<Comment> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val selectedUrl: String? = null,
    val audioUrl: String? = null,
    val showComments: Boolean = false,
    val isSubscribed: Boolean = false
)

@HiltViewModel
class WatchViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val videoRepository: VideoRepository,
    private val historyRepository: HistoryRepository,
    private val downloadRepository: DownloadRepository,
    private val subscriptionRepository: SubscriptionRepository
) : ViewModel() {

    companion object {
        private const val TAG = "WatchViewModel"
    }

    private val videoId: String = savedStateHandle.get<String>("videoId") ?: ""

    private val _uiState = MutableStateFlow(WatchUiState())
    val uiState: StateFlow<WatchUiState> = _uiState.asStateFlow()

    val activeDownloads: Flow<Map<String, DownloadProgress>> = downloadRepository.activeDownloads

    init {
        if (videoId.isNotBlank()) {
            loadVideo()
        }
    }

    fun toggleComments() {
        _uiState.value = _uiState.value.copy(
            showComments = !_uiState.value.showComments
        )
    }

    fun selectQuality(format: PlaybackFormat) {
        val audioUrl = if (format.hasAudio) null else _uiState.value.playbackInfo?.audioFormat?.url
        _uiState.value = _uiState.value.copy(
            selectedUrl = format.url,
            audioUrl = audioUrl
        )
    }

    fun startDownload(
        context: Context,
        videoId: String,
        title: String,
        thumbnail: String,
        channelTitle: String,
        duration: String,
        quality: Quality
    ) {
        downloadRepository.enqueueDownload(
            context = context,
            videoId = videoId,
            title = title,
            thumbnail = thumbnail,
            channelTitle = channelTitle,
            duration = duration,
            quality = quality
        )
    }

    fun cancelDownload(context: Context, videoId: String) {
        androidx.work.WorkManager.getInstance(context)
            .cancelUniqueWork("download_$videoId")
        downloadRepository.removeProgress(videoId)
    }

    fun toggleSubscription() {
        val video = _uiState.value.video ?: return
        viewModelScope.launch {
            try {
                if (_uiState.value.isSubscribed) {
                    subscriptionRepository.unsubscribe(video.displayChannelId)
                    _uiState.value = _uiState.value.copy(isSubscribed = false)
                } else {
                    subscriptionRepository.subscribe(
                        channelId = video.displayChannelId,
                        channelName = video.displayChannelTitle,
                        channelAvatar = ""
                    )
                    _uiState.value = _uiState.value.copy(isSubscribed = true)
                }
            } catch (_: Exception) {}
        }
    }

    private fun loadVideo() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true)

                // Load playback info first (fast) - this is what we need to start playing
                val playback = runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()

                if (playback == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Failed to load video info"
                    )
                    return@launch
                }

                // Pick best format: prefer progressive (has audio), then fall back to video-only + separate audio
                val bestFormat = playback.videoFormats.firstOrNull { it.hasAudio }
                    ?: playback.videoFormats.firstOrNull()

                val hasAudio = bestFormat?.hasAudio == true
                val audioUrl = if (hasAudio) null else playback.audioFormat?.url

                // Show video immediately with playback info
                _uiState.value = WatchUiState(
                    video = VideoData(id = videoId, title = playback.title),
                    playbackInfo = playback,
                    isLoading = false,
                    selectedUrl = bestFormat?.url,
                    audioUrl = audioUrl
                )

                // Load video info, related videos, comments in background (non-blocking)
                launch {
                    val video = runCatching { videoRepository.getVideoInfo(videoId) }.getOrNull()
                    if (video != null) {
                        _uiState.value = _uiState.value.copy(
                            video = video,
                            isSubscribed = subscriptionRepository.isSubscribed(video.displayChannelId)
                        )
                    }
                }
                launch {
                    val related = runCatching { videoRepository.getRelatedVideos(videoId) }
                        .onFailure { Log.e(TAG, "Related videos failed", it) }
                        .getOrNull() ?: emptyList()
                    _uiState.value = _uiState.value.copy(relatedVideos = related)
                }
                launch {
                    val comments = runCatching { videoRepository.getComments(videoId) }
                        .onFailure { Log.e(TAG, "Comments failed", it) }
                        .getOrNull() ?: emptyList()
                    _uiState.value = _uiState.value.copy(comments = comments)
                }
                launch {
                    historyRepository.addToHistory(
                        videoId = videoId,
                        title = playback.title,
                        thumbnail = "",
                        uploader = ""
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load video"
                )
            }
        }
    }
}
