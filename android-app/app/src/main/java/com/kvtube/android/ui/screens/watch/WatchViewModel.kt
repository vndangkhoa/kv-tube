package com.kvtube.android.ui.screens.watch

import android.content.Context
import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.DownloadProgress
import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.DownloadRepository
import com.kvtube.android.data.repository.HistoryRepository
import com.kvtube.android.data.repository.SubscriptionRepository
import com.kvtube.android.data.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
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
    private val subscriptionRepository: SubscriptionRepository,
    private val extractorHelper: ExtractorHelper
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

                // 1. Fast path: extract stream URL on-device using NewPipe (~300-600ms, completely immune to server delays)
                var videoUrl: String? = null
                var audioUrl: String? = null
                var playback: PlaybackInfo? = null

                try {
                    val extracted = extractorHelper.extractStreamUrl(videoId, Quality.RECOMMENDED)
                    if (extracted.videoUrl.isNotBlank()) {
                        videoUrl = extracted.videoUrl
                        audioUrl = extracted.audioUrl
                        Log.d(TAG, "Fast on-device stream extraction succeeded for $videoId")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "On-device stream extraction failed, falling back to server: ${e.message}")
                }

                // 2. Fallback path: server playback-info with bounded 2.5s timeout
                if (videoUrl.isNullOrBlank()) {
                    playback = kotlinx.coroutines.withTimeoutOrNull(2500L) {
                        runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()
                    }
                    if (playback != null && playback.videoFormats.isNotEmpty()) {
                        val bestFormat = playback.videoFormats.firstOrNull { it.hasAudio }
                            ?: playback.videoFormats.firstOrNull()
                        videoUrl = bestFormat?.url
                        audioUrl = if (bestFormat?.hasAudio == true) null else playback.audioFormat?.url
                    }
                }

                if (videoUrl.isNullOrBlank()) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Failed to load video stream"
                    )
                    return@launch
                }

                val initialTitle = playback?.title?.ifEmpty { null } ?: "Loading..."

                _uiState.value = WatchUiState(
                    video = VideoData(id = videoId, title = initialTitle),
                    playbackInfo = playback ?: PlaybackInfo(title = initialTitle),
                    isLoading = false,
                    selectedUrl = videoUrl,
                    audioUrl = audioUrl
                )

                // Background enrichment (info, related, comments, history)
                launch {
                    val video = runCatching { videoRepository.getVideoInfo(videoId) }.getOrNull()
                    if (video != null && video.title.isNotBlank()) {
                        _uiState.value = _uiState.value.copy(
                            video = video,
                            isSubscribed = subscriptionRepository.isSubscribed(video.displayChannelId)
                        )
                    }
                }
                launch {
                    val related = runCatching { videoRepository.getRelatedVideos(videoId) }
                        .getOrNull() ?: emptyList()
                    _uiState.value = _uiState.value.copy(relatedVideos = related)
                }
                launch {
                    val comments = runCatching { videoRepository.getComments(videoId) }
                        .getOrNull() ?: emptyList()
                    _uiState.value = _uiState.value.copy(comments = comments)
                }
                launch {
                    historyRepository.addToHistory(
                        videoId = videoId,
                        title = initialTitle,
                        thumbnail = "",
                        uploader = ""
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading watch video: ${e.message}", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load video"
                )
            }
        }
    }
}
