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
import kotlinx.coroutines.async
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
        _uiState.value = _uiState.value.copy(
            selectedUrl = format.url,
            audioUrl = _uiState.value.playbackInfo?.audioFormat?.url
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
                        channelAvatar = video.avatarUrl ?: ""
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

                val videoDeferred = async {
                    runCatching { videoRepository.getVideoInfo(videoId) }.getOrNull()
                }
                val playbackDeferred = async {
                    runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()
                }
                val relatedDeferred = async {
                    runCatching { videoRepository.getRelatedVideos(videoId) }
                        .onFailure { Log.e(TAG, "Related videos failed", it) }
                        .getOrNull() ?: emptyList()
                }
                val commentsDeferred = async {
                    runCatching { videoRepository.getComments(videoId) }
                        .onFailure { Log.e(TAG, "Comments failed", it) }
                        .getOrNull() ?: emptyList()
                }

                val video = videoDeferred.await()
                val playback = playbackDeferred.await()
                val related = relatedDeferred.await()
                val comments = commentsDeferred.await()

                if (video == null || playback == null) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "Failed to load video info"
                    )
                    return@launch
                }

                val isSubscribed = subscriptionRepository.isSubscribed(video.displayChannelId)

                // Pick best mp4 format with audio, or smallest mp4 video-only for merging
                val mp4Formats = playback.videoFormats
                    .filter { it.ext == "mp4" }
                    .sortedBy { it.height }

                val bestVideoFormat = mp4Formats.lastOrNull()
                    ?: playback.videoFormats.minByOrNull { it.filesize }

                val audioUrl = playback.audioFormat?.url

                val firstUrl = bestVideoFormat?.url

                _uiState.value = WatchUiState(
                    video = video,
                    playbackInfo = playback,
                    relatedVideos = related,
                    comments = comments,
                    isLoading = false,
                    selectedUrl = firstUrl,
                    audioUrl = audioUrl,
                    isSubscribed = isSubscribed
                )

                // Record watch history
                historyRepository.addToHistory(
                    videoId = videoId,
                    title = video.title,
                    thumbnail = video.thumbnail,
                    uploader = video.displayChannelTitle
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load video"
                )
            }
        }
    }
}
