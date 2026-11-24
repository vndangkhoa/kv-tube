package com.kvtube.android.ui.screens.shorts

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.extractor.ExtractorHelper
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.ExtractedStream
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import com.kvtube.android.player.PlaybackManager
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
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false
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
    private val extractorHelper: ExtractorHelper,
    private val playbackManager: PlaybackManager
) : ViewModel() {

    companion object {
        private const val TAG = "ShortsViewModel"
        private val WIDESCREEN_REGEX = Regex(
            "(trailer|teaser|official\\s+mv|official\\s+music\\s+video|music\\s+video|compilation|full\\s+movie|short\\s+film|phim\\s+ngắn)",
            RegexOption.IGNORE_CASE
        )
    }

    private val _uiState = MutableStateFlow(ShortsUiState())
    val uiState: StateFlow<ShortsUiState> = _uiState.asStateFlow()

    private val _commentsState = MutableStateFlow(ShortsCommentsState())
    val commentsState: StateFlow<ShortsCommentsState> = _commentsState.asStateFlow()

    private var currentRegion: String = "GLOBAL"
    private var shortsContinuation: String? = null
    private var fallbackSearchPage: Int = 1
    private var commentsJob: Job? = null

    init {
        viewModelScope.launch {
            currentRegion = settingsDataStore.region.first()
            loadShorts()
        }
    }

    fun onShortsVisible() {
        if (playbackManager.player.isPlaying) {
            playbackManager.player.pause()
        }
    }

    private val streamCache = java.util.concurrent.ConcurrentHashMap<String, ExtractedStream>()

    fun refresh() {
        streamCache.clear()
        loadShorts()
    }

    fun prefetchStream(videoId: String) {
        if (videoId.isBlank() || streamCache.containsKey(videoId)) return
        viewModelScope.launch {
            getStream(videoId)
        }
    }

    suspend fun getStream(videoId: String): ExtractedStream {
        if (videoId.isBlank()) return ExtractedStream(videoUrl = "")
        streamCache[videoId]?.let { cached ->
            if (cached.videoUrl.isNotBlank()) return cached
        }

        return try {
            // 1. Primary: Server playback info (Invidious proxied stream, bypasses YouTube IP/cipher blocks)
            val playback = kotlinx.coroutines.withTimeoutOrNull(10_000L) {
                runCatching { videoRepository.getPlaybackInfo(videoId) }.getOrNull()
            }
            if (playback != null && playback.videoFormats.isNotEmpty()) {
                val resolved = com.kvtube.android.data.model.QualityTiers.resolve(
                    com.kvtube.android.data.model.QualityTier.MID,
                    playback
                )
                if (resolved != null && resolved.first.url.isNotBlank()) {
                    val stream = ExtractedStream(
                        videoUrl = resolved.first.url,
                        audioUrl = resolved.second,
                        height = resolved.first.height,
                        isDash = !resolved.second.isNullOrBlank()
                    )
                    streamCache[videoId] = stream
                    return stream
                }

                // Direct progressive or adaptive fallback from server
                val progressive = playback.videoFormats.firstOrNull { it.hasAudio && it.url.isNotEmpty() }
                if (progressive != null) {
                    val stream = ExtractedStream(
                        videoUrl = progressive.url,
                        height = progressive.height,
                        isDash = false
                    )
                    streamCache[videoId] = stream
                    return stream
                }

                val videoFormat = playback.videoFormats.firstOrNull { it.url.isNotEmpty() }
                if (videoFormat != null) {
                    val stream = ExtractedStream(
                        videoUrl = videoFormat.url,
                        audioUrl = playback.audioFormat?.url,
                        height = videoFormat.height,
                        isDash = !playback.audioFormat?.url.isNullOrBlank()
                    )
                    streamCache[videoId] = stream
                    return stream
                }
            }

            // 2. Fallback: On-device extractor if server is down or returns empty
            val extracted = kotlinx.coroutines.withTimeoutOrNull(6_000L) {
                runCatching { extractorHelper.extractStreamUrl(videoId, Quality.RECOMMENDED) }.getOrNull()
            }
            if (extracted != null && extracted.videoUrl.isNotBlank()) {
                streamCache[videoId] = extracted
                return extracted
            }

            ExtractedStream(videoUrl = "")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to resolve stream for short $videoId: ${e.message}")
            ExtractedStream(videoUrl = "")
        }
    }

    suspend fun getStreamUrl(videoId: String): String = getStream(videoId).videoUrl

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

    private fun isLikelyShort(v: VideoData): Boolean {
        if (v.id.isBlank() || v.isLive) return false
        if (v.isShort) return true
        if (v.durationSeconds !in 4L..65L) return false
        return !WIDESCREEN_REGEX.containsMatchIn(v.title) || v.title.contains("#short", ignoreCase = true)
    }

    private fun loadShorts() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true)
                shortsContinuation = null
                fallbackSearchPage = 1

                val feedPage = videoRepository.getShortsFeed(currentRegion)
                var videos = feedPage?.videos.orEmpty()
                if (videos.isNotEmpty()) {
                    shortsContinuation = feedPage?.continuation
                } else {
                    val query = if (currentRegion == "VN") "#shorts việt nam" else "#shorts viral"
                    videos = videoRepository.search(
                        query = query,
                        limit = 30,
                        region = currentRegion,
                        page = 1,
                        duration = "short"
                    ).filter(::isLikelyShort)

                    if (videos.isEmpty()) {
                        val altQuery = if (currentRegion == "VN") "shorts viral" else "#shorts"
                        videos = videoRepository.search(
                            query = altQuery,
                            limit = 30,
                            region = currentRegion,
                            page = 1,
                            duration = "short"
                        ).filter(::isLikelyShort)
                    }
                    if (videos.isEmpty()) {
                        videos = extractorHelper.searchVideos(query).filter(::isLikelyShort)
                    }
                }
                videoRepository.seedCache(videos)
                _uiState.value = ShortsUiState(
                    videos = videos,
                    isLoading = false
                )
                videos.firstOrNull()?.let { prefetchStream(it.id) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Error loading shorts: ${e.message}")
                _uiState.value = ShortsUiState(isLoading = false)
            }
        }
    }

    fun loadMoreShorts() {
        if (_uiState.value.isLoadingMore || _uiState.value.isLoading) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoadingMore = true)
            try {
                val token = shortsContinuation
                val moreVideos = if (!token.isNullOrBlank()) {
                    val page = videoRepository.getShortsFeed(currentRegion, token)
                    shortsContinuation = page?.continuation
                    page?.videos.orEmpty()
                } else {
                    fallbackSearchPage += 1
                    val query = if (currentRegion == "VN") "#shorts việt nam" else "#shorts viral"
                    val searched = videoRepository.search(
                        query = query,
                        limit = 30,
                        region = currentRegion,
                        page = fallbackSearchPage,
                        duration = "short"
                    ).filter(::isLikelyShort)
                    searched.ifEmpty {
                        extractorHelper.searchVideos(query).filter(::isLikelyShort)
                    }
                }

                val existingIds = _uiState.value.videos.map { it.id }.toSet()
                val distinctMore = moreVideos.filter { it.id !in existingIds }
                if (distinctMore.isNotEmpty()) {
                    videoRepository.seedCache(distinctMore)
                    _uiState.value = _uiState.value.copy(
                        videos = _uiState.value.videos + distinctMore,
                        isLoadingMore = false
                    )
                } else {
                    _uiState.value = _uiState.value.copy(isLoadingMore = false)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load more shorts: ${e.message}")
                _uiState.value = _uiState.value.copy(isLoadingMore = false)
            }
        }
    }
}
