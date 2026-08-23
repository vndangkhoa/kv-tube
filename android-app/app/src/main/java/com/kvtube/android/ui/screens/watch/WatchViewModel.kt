package com.kvtube.android.ui.screens.watch

import android.content.Context
import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.DownloadProgress
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.QualityTier
import com.kvtube.android.data.model.QualityTiers
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.DownloadRepository
import com.kvtube.android.data.repository.HistoryRepository
import com.kvtube.android.data.repository.SubscriptionRepository
import com.kvtube.android.data.repository.VideoRepository
import com.kvtube.android.player.PlaybackManager
import com.kvtube.android.ui.FullscreenController
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/** YouTube-style quality tiers shown on the watch page. */
data class WatchUiState(
    val video: VideoData? = null,
    val playbackInfo: PlaybackInfo? = null,
    val relatedVideos: List<VideoData> = emptyList(),
    val comments: List<Comment> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val selectedUrl: String? = null,
    val audioUrl: String? = null,
    val selectedTier: QualityTier = QualityTiers.DEFAULT,
    /** Resolved resolution of the active stream, e.g. "1080p". */
    val selectedQualityLabel: String? = null,
    /** Resolved per-tier descriptions, e.g. "Auto • 720p". */
    val tierDescriptions: Map<QualityTier, String> = emptyMap(),
    val showComments: Boolean = false,
    val isSubscribed: Boolean = false,
    /** Self-hosted base URL used for share links. */
    val serverBaseUrl: String = "",
    /** True when stream extraction failed and the UI should render the
     *  YouTube embed iframe instead of ExoPlayer. */
    val useIframeFallback: Boolean = false
)

@HiltViewModel
class WatchViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val videoRepository: VideoRepository,
    private val historyRepository: HistoryRepository,
    private val downloadRepository: DownloadRepository,
    private val subscriptionRepository: SubscriptionRepository,
    private val settingsDataStore: SettingsDataStore,
    private val playbackManager: PlaybackManager,
    private val fullscreenController: FullscreenController,
    private val extractorHelper: ExtractorHelper
) : ViewModel() {

    companion object {
        private const val TAG = "WatchViewModel"
    }

    private val videoId: String = savedStateHandle.get<String>("videoId") ?: ""

    private val _uiState = MutableStateFlow(WatchUiState())
    val uiState: StateFlow<WatchUiState> = _uiState.asStateFlow()

    /** Shared app-wide player so the watch page and mini player stay in sync. */
    val playbackManagerRef: PlaybackManager get() = playbackManager

    /**
     * Tells MainScreen to hide its chrome (top bar / bottom bar / padding)
     * while the player is fullscreen so the video fills the whole display.
     */
    fun setPlayerFullscreen(active: Boolean) {
        fullscreenController.setFullscreen(active)
    }

    val activeDownloads: Flow<Map<String, DownloadProgress>> = downloadRepository.activeDownloads

    init {
        if (videoId.isNotBlank()) {
            loadVideo()
        }
        viewModelScope.launch {
            val base = settingsDataStore.serverUrl.first().trim().removeSuffix("/")
            _uiState.value = _uiState.value.copy(serverBaseUrl = base)
        }
    }

    fun toggleComments() {
        _uiState.value = _uiState.value.copy(
            showComments = !_uiState.value.showComments
        )
    }

    /**
     * Applies a quality tier (Low 360p / Mid 720p / High 1080p / Maximum).
     * [QualityTiers.resolve] picks the stream and guarantees an audio track
     * is merged in, so switching tiers never drops the sound. Switching
     * quality of the same video keeps the playback position.
     */
    fun selectQualityTier(tier: QualityTier) {
        val resolved = QualityTiers.resolve(tier, _uiState.value.playbackInfo) ?: return
        val (format, audioUrl) = resolved

        playbackManager.play(videoId, format.url, audioUrl)

        _uiState.value = _uiState.value.copy(
            selectedUrl = format.url,
            audioUrl = audioUrl,
            selectedTier = tier,
            selectedQualityLabel = format.qualityLabel
        )
    }

    /** Called when ExoPlayer fails mid-playback: switch to the YouTube embed. */
    fun fallbackToIframe() {
        if (!_uiState.value.useIframeFallback) {
            playbackManager.stopAndClear()
            _uiState.value = _uiState.value.copy(
                useIframeFallback = true,
                error = "Playback error — switched to embedded player"
            )
        }
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

    // --- internal ------------------------------------------------------------

    private fun refreshTierDescriptions(info: PlaybackInfo?): Map<QualityTier, String> {
        info ?: return emptyMap()
        return QualityTier.entries.associateWith { tier ->
            val format = QualityTiers.resolve(tier, info)?.first
            when {
                format == null -> tier.label
                format.height > 0 -> "${tier.label} • ${format.qualityLabel}"
                else -> tier.label
            }
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
                var extractedHeight = 0

                try {
                    // Bounded: a blocked YouTube/server must not stall the
                    // iframe fallback for long. RECOMMENDED caps at 1080p,
                    // matching the default High tier.
                    val extracted = kotlinx.coroutines.withTimeoutOrNull(10_000L) {
                        extractorHelper.extractStreamUrl(videoId, Quality.RECOMMENDED)
                    }
                    if (extracted != null && extracted.videoUrl.isNotBlank()) {
                        videoUrl = extracted.videoUrl
                        audioUrl = extracted.audioUrl
                        extractedHeight = extracted.height
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
                        val resolved = QualityTiers.resolve(QualityTiers.DEFAULT, playback)
                        if (resolved != null && resolved.first.url.isNotBlank()) {
                            videoUrl = resolved.first.url
                            audioUrl = resolved.second
                            extractedHeight = resolved.first.height
                        }
                    }
                }

                if (videoUrl.isNullOrBlank()) {
                    // No stream could be extracted (NewPipe + server both
                    // failed/blocked) -> fall back to the YouTube embed iframe
                    // so the video still plays.
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        useIframeFallback = true,
                        error = "Direct playback unavailable — using embedded player"
                    )
                    return@launch
                }

                val initialTitle = playback?.title?.ifEmpty { null } ?: "Loading..."

                // Hand playback over to the app-wide manager so it survives
                // back navigation as a mini player.
                playbackManager.setMetadata(videoId, initialTitle, "", "")
                playbackManager.play(videoId, videoUrl, audioUrl)

                _uiState.value = WatchUiState(
                    video = VideoData(id = videoId, title = initialTitle),
                    playbackInfo = playback ?: PlaybackInfo(title = initialTitle),
                    isLoading = false,
                    selectedUrl = videoUrl,
                    audioUrl = audioUrl,
                    selectedTier = QualityTiers.DEFAULT,
                    selectedQualityLabel = extractedHeight.takeIf { it > 0 }?.let { "${it}p" },
                    tierDescriptions = refreshTierDescriptions(playback),
                    serverBaseUrl = _uiState.value.serverBaseUrl
                )

                // Background enrichment (info, related, comments, history, quality list)
                launch {
                    val video = runCatching { videoRepository.getVideoInfo(videoId) }.getOrNull()
                    if (video != null && video.title.isNotBlank()) {
                        _uiState.value = _uiState.value.copy(
                            video = video,
                            isSubscribed = subscriptionRepository.isSubscribed(video.displayChannelId)
                        )
                        playbackManager.setMetadata(
                            videoId = videoId,
                            title = video.title,
                            channelTitle = video.displayChannelTitle,
                            thumbnail = video.displayThumbnail
                        )
                        // refresh the history entry with real metadata
                        historyRepository.record(
                            videoId = videoId,
                            title = video.title,
                            thumbnail = video.thumbnail,
                            uploader = video.displayChannelTitle,
                            channelId = video.displayChannelId,
                            duration = video.duration
                        )
                    }
                }
                // Populate the quality menu even when the fast NewPipe path
                // produced the stream (server formats are richer). If the
                // currently playing stream doesn't match the selected tier,
                // seamlessly switch (position is preserved) so the displayed
                // quality is the one actually playing.
                launch {
                    val info = kotlinx.coroutines.withTimeoutOrNull(4_000L) {
                        runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()
                    }
                    if (info != null && info.videoFormats.isNotEmpty()) {
                        val current = _uiState.value
                        val updatedInfo = if (current.playbackInfo == null || current.playbackInfo.videoFormats.isEmpty()) {
                            info
                        } else current.playbackInfo
                        _uiState.value = current.copy(
                            playbackInfo = updatedInfo,
                            tierDescriptions = refreshTierDescriptions(updatedInfo),
                            selectedQualityLabel = current.selectedQualityLabel
                                ?: QualityTiers.resolve(current.selectedTier, updatedInfo)?.first?.qualityLabel
                        )

                        if (!current.useIframeFallback) {
                            QualityTiers.resolve(current.selectedTier, updatedInfo)?.let { (format, audioUrl) ->
                                if (format.url.isNotBlank() && format.url != current.selectedUrl) {
                                    playbackManager.play(videoId, format.url, audioUrl)
                                    _uiState.value = _uiState.value.copy(
                                        selectedUrl = format.url,
                                        audioUrl = audioUrl,
                                        selectedQualityLabel = format.qualityLabel
                                    )
                                }
                            }
                        }
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
                    historyRepository.record(videoId = videoId)
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
