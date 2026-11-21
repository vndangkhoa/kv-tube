package com.kvtube.android.ui.screens.watch

import android.content.Context
import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.local.logToFile
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.roundToInt
import javax.inject.Inject

/** YouTube-style quality tiers shown on the watch page. */
data class WatchUiState(
    val video: VideoData? = null,
    val playbackInfo: PlaybackInfo? = null,
    val relatedVideos: List<VideoData> = emptyList(),
    val comments: List<Comment> = emptyList(),
    val commentsContinuation: String? = null,
    val commentsCount: Int? = null,
    val isLoadingComments: Boolean = false,
    val isLoadingMoreComments: Boolean = false,
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

    /** True while the adaptive DASH stream (ExoPlayer ABR) is the active source. */
    private var dashActive = false
    private var progressiveFallbackStarted = false
    private var cachedPlaybackInfo: PlaybackInfo? = null

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
        // Live resolution / bandwidth readout for the quality menu while ABR runs.
        viewModelScope.launch {
            combine(
                playbackManager.activeHeight,
                playbackManager.bandwidthMbps
                    .map { (it * 2).roundToInt() / 2f } // 0.5 Mbps steps: no recompose churn
                    .distinctUntilChanged()
            ) { height, mbps -> height to mbps }
                .collect { (height, mbps) ->
                    if (!dashActive) return@collect
                    val state = _uiState.value
                    _uiState.value = state.copy(
                        selectedQualityLabel = height.takeIf { it > 0 }?.let { "${it}p" }
                            ?: state.selectedQualityLabel,
                        tierDescriptions = dashTierDescriptions(state.selectedTier, height, mbps)
                    )
                }
        }
        viewModelScope.launch {
            settingsDataStore.serverUrl
                .distinctUntilChanged()
                .collect { url ->
                    val base = url.trim().removeSuffix("/")
                    val oldBase = _uiState.value.serverBaseUrl
                    _uiState.value = _uiState.value.copy(serverBaseUrl = base)
                    if (oldBase.isNotBlank() && oldBase != base && _uiState.value.error != null) {
                        loadVideo()
                    }
                }
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
        // Adaptive stream: only the track-selection constraints change — the
        // media source, decoder and surface stay up, so the resolution moves
        // smoothly with no rebuffer, seek or black frame.
        if (dashActive && playbackManager.isDashActive) {
            playbackManager.setQualityTier(tier)
            val height = playbackManager.activeHeight.value
            _uiState.value = _uiState.value.copy(
                selectedTier = tier,
                tierDescriptions = dashTierDescriptions(tier, height, playbackManager.bandwidthMbps.value)
            )
            return
        }
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

    /** Called when ExoPlayer fails mid-playback. Strict Invidious-only: no
     *  iframe fallback — surface the failure and let the user retry. */
    fun fallbackToIframe() {
        // DASH failed (bad manifest, unsupported codec, dead segment host…):
        // continue on the single progressive stream at the same position
        // before surfacing any error.
        if (dashActive && !progressiveFallbackStarted) {
            logToFile(TAG, "DASH playback failed for $videoId — falling back to progressive stream")
            startProgressiveFallback()
            return
        }
        logToFile(TAG, "player failed mid-playback for $videoId — surfacing error (strict server mode)")
        _uiState.value = _uiState.value.copy(
            error = "Playback failed. The stream from your Invidious server could not be played."
        )
    }

    /** Re-runs the whole load (used by the Retry button on the watch page). */
    fun retry() = loadVideo()

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

    /** Quality menu text while adaptive streaming: shows what ABR currently decodes. */
    private fun dashTierDescriptions(selected: QualityTier, height: Int, mbps: Float): Map<QualityTier, String> =
        QualityTier.entries.associateWith { tier ->
            when (tier) {
                QualityTier.AUTO -> buildString {
                    append("Auto")
                    if (selected == QualityTier.AUTO) {
                        if (height > 0) append(" • ${height}p")
                        if (mbps > 0f) append(" • ${if (mbps >= 10f) mbps.roundToInt().toString() else "%.1f".format(mbps)} Mbps")
                    } else {
                        append(" • by bandwidth")
                    }
                }
                QualityTier.LOW -> "Low • up to 360p"
                QualityTier.MID -> "Mid • up to 720p"
                QualityTier.HIGH -> "High • up to 1080p"
                QualityTier.MAXIMUM ->
                    if (selected == QualityTier.MAXIMUM && height > 0) "Maximum • ${height}p"
                    else "Maximum • highest available"
            }
        }

    private fun loadVideo() {
        viewModelScope.launch {
            // Related videos / comments / history load INDEPENDENTLY of the
            // playback path: they must appear even when the stream comes from
            // the server or a fallback.
            loadEnrichment()
            try {
                _uiState.value = _uiState.value.copy(isLoading = true)

                // 1. FAST PATH: adaptive DASH straight from the manifest. No
                // waiting for /videos/{id} (which previously gated playback by
                // up to 18s): the player starts loading init/index segments
                // immediately and ABR picks the resolution from bandwidth.
                if (tryStartDash()) {
                    launchMetadataEnrichment()
                    fetchPlaybackInfoInBackground()
                    return@launch
                }

                // 2. Fallback: single progressive stream resolved from /videos/{id}.
                loadProgressive()
            } catch (e: kotlinx.coroutines.CancellationException) {
                // Leaving the page / reloading cancels this job — normal flow,
                // not an error.
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Error loading watch video: ${e.message}", e)
                logToFile(TAG, "loadVideo($videoId) failed", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load video"
                )
            }
        }
    }

    private suspend fun tryStartDash(): Boolean {
        val manifest = withTimeoutOrNull(3_000L) { videoRepository.dashManifestUrl(videoId) }
            ?: return false

        val tier = _uiState.value.selectedTier
        playbackManager.setMetadata(videoId, "Loading...", "", "")
        playbackManager.setQualityTier(tier)
        playbackManager.playDash(videoId, manifest, videoRepository.gatewayHost())
        if (!playbackManager.isDashActive) return false

        dashActive = true
        progressiveFallbackStarted = false
        logToFile(TAG, "adaptive DASH started for $videoId")
        _uiState.value = _uiState.value.copy(
            video = _uiState.value.video ?: VideoData(id = videoId, title = "Loading..."),
            playbackInfo = _uiState.value.playbackInfo ?: PlaybackInfo(title = "Loading..."),
            isLoading = false,
            error = null,
            selectedUrl = manifest,
            audioUrl = null,
            selectedTier = tier,
            tierDescriptions = dashTierDescriptions(tier, 0, 0f)
        )
        return true
    }

    /** Fetches the progressive formats in the background (download sheet,
     *  and the fallback stream should DASH fail) without blocking playback. */
    private fun fetchPlaybackInfoInBackground() {
        viewModelScope.launch {
            val info = withTimeoutOrNull(18_000L) {
                runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()
            }
            if (info != null && info.videoFormats.isNotEmpty()) {
                cachedPlaybackInfo = info
                _uiState.value = _uiState.value.copy(playbackInfo = info)
            }
        }
    }

    /** Switches from a failed DASH stream to the progressive stream, keeping the position. */
    private fun startProgressiveFallback() {
        if (progressiveFallbackStarted) return
        progressiveFallbackStarted = true
        dashActive = false
        viewModelScope.launch {
            val info = cachedPlaybackInfo?.takeIf { it.videoFormats.isNotEmpty() }
                ?: withTimeoutOrNull(18_000L) {
                    runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()
                }
            val tier = _uiState.value.selectedTier
            val resolved = QualityTiers.resolve(tier, info)
            if (info == null || resolved == null || resolved.first.url.isBlank()) {
                _uiState.value = _uiState.value.copy(
                    error = "Playback failed. The stream from your Invidious server could not be played."
                )
                return@launch
            }
            val (format, audioUrl) = resolved
            // Same video → PlaybackManager.play() resumes at the current position.
            playbackManager.play(videoId, format.url, audioUrl)
            _uiState.value = _uiState.value.copy(
                playbackInfo = info,
                error = null,
                selectedUrl = format.url,
                audioUrl = audioUrl,
                selectedQualityLabel = format.qualityLabel,
                tierDescriptions = refreshTierDescriptions(info)
            )
        }
    }

    private fun launchMetadataEnrichment() {
        viewModelScope.launch {
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
    }

    /** Progressive (non-adaptive) loading — used only when DASH is unavailable. */
    private suspend fun loadProgressive() {
        dashActive = false
        var videoUrl: String? = null
        var audioUrl: String? = null
        var playback: PlaybackInfo? = null
        var extractedHeight = 0

        val serverStarted = android.os.SystemClock.elapsedRealtime()
        playback = withTimeoutOrNull(18_000L) {
            runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()
        }
        if (playback != null && playback.videoFormats.isNotEmpty()) {
            val resolved = QualityTiers.resolve(QualityTiers.DEFAULT, playback)
            if (resolved != null && resolved.first.url.isNotBlank()) {
                videoUrl = resolved.first.url
                audioUrl = resolved.second
                extractedHeight = resolved.first.height
                logToFile(
                    TAG,
                    "stream via server in ${android.os.SystemClock.elapsedRealtime() - serverStarted}ms for $videoId"
                )
            }
        }

        if (videoUrl.isNullOrBlank()) {
            // Fallback to on-device extractor if the server is down, rate-limited, or returned no streams
            logToFile(TAG, "server returned no playable stream for $videoId, trying extractorHelper")
            val fallbackStream = runCatching {
                extractorHelper.extractStreamUrl(videoId, Quality.RECOMMENDED)
            }.getOrNull()

            if (fallbackStream != null && fallbackStream.videoUrl.isNotBlank()) {
                videoUrl = fallbackStream.videoUrl
                audioUrl = fallbackStream.audioUrl
                extractedHeight = fallbackStream.height
                logToFile(TAG, "stream via extractorHelper for $videoId")
            }
        }

        if (videoUrl.isNullOrBlank()) {
            logToFile(TAG, "all stream sources failed for $videoId")
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = "Unable to load video stream. Check your server connection or try another instance in Settings."
            )
            return
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
            serverBaseUrl = _uiState.value.serverBaseUrl,
            // Preserve anything the independent enrichment coroutines
            // already delivered while streams were resolving.
            relatedVideos = _uiState.value.relatedVideos,
            comments = _uiState.value.comments,
            commentsContinuation = _uiState.value.commentsContinuation,
            commentsCount = _uiState.value.commentsCount,
            isLoadingComments = _uiState.value.isLoadingComments,
            isLoadingMoreComments = _uiState.value.isLoadingMoreComments
        )

        launchMetadataEnrichment()
        viewModelScope.launch {
            val info = withTimeoutOrNull(4_000L) {
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
    }

    /**
     * Loads everything that is NOT the video stream: related videos,
     * comments, history. Runs independently of playback resolution so the
     * related section is always populated — even when playback ends up on
     * the iframe fallback path (which returns early from loadVideo).
     */
    private fun loadEnrichment() {
        viewModelScope.launch {
            // Related videos must ALWAYS be present: if the per-video
            // recommendation sources fail or come up empty, fall back to
            // trending so the section is never blank. A busy link (the video
            // stream saturating the connection while playback starts) can make
            // these small API calls time out, so retry a couple of times
            // instead of leaving the section empty for the whole session.
            var filtered: List<VideoData> = emptyList()
            for (attempt in 0..2) {
                if (attempt > 0) kotlinx.coroutines.delay(2_500L * attempt)
                var related = runCatching { videoRepository.getRelatedVideos(videoId) }
                    .getOrNull().orEmpty()
                if (related.isEmpty()) {
                    related = runCatching { videoRepository.getTrending(15) }
                        .getOrNull().orEmpty()
                }
                filtered = related.filter { it.id != videoId && it.id.isNotBlank() }
                if (filtered.isNotEmpty()) break
            }
            if (filtered.isNotEmpty()) {
                _uiState.value = _uiState.value.copy(relatedVideos = filtered)
            }

            loadComments()

            runCatching { historyRepository.record(videoId = videoId) }
        }
    }

    private var commentsJob: Job? = null

    private fun loadComments() {
        commentsJob?.cancel()
        _uiState.value = _uiState.value.copy(
            comments = emptyList(),
            commentsContinuation = null,
            isLoadingComments = true
        )
        commentsJob = viewModelScope.launch {
            try {
                val page = videoRepository.getCommentsPage(videoId)
                _uiState.value = _uiState.value.copy(
                    comments = page.comments,
                    commentsContinuation = page.continuation,
                    commentsCount = page.commentCount,
                    isLoadingComments = false
                )
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load comments for $videoId: ${e.message}")
                _uiState.value = _uiState.value.copy(isLoadingComments = false)
            }
        }
    }

    fun loadMoreComments() {
        val continuation = _uiState.value.commentsContinuation
        if (continuation.isNullOrBlank() || _uiState.value.isLoadingMoreComments) return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoadingMoreComments = true)
            try {
                val nextPage = videoRepository.getCommentsPage(videoId, continuation = continuation)
                _uiState.value = _uiState.value.copy(
                    comments = _uiState.value.comments + nextPage.comments,
                    commentsContinuation = nextPage.continuation,
                    isLoadingMoreComments = false
                )
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load more comments for $videoId: ${e.message}")
                _uiState.value = _uiState.value.copy(isLoadingMoreComments = false)
            }
        }
    }
}
