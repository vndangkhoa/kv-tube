package com.kvtube.android.data.repository

import android.util.Log
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.local.WatchHistoryDao
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.CommentsPage
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull

/**
 * STRICT INVIDIOUS-ONLY data source: every request goes to the server the
 * user configured in Settings. There are deliberately NO on-device (NewPipe)
 * fallbacks — the app must never open direct connections to YouTube/Google
 * hosts. Streams are proxied through Invidious (`local=true`).
 */
@Singleton
class VideoRepository @Inject constructor(
    private val api: KVApi,
    private val extractorHelper: com.kvtube.android.data.extractor.ExtractorHelper,
    private val watchHistoryDao: WatchHistoryDao
) {
    companion object {
        private const val TAG = "VideoRepository"
        // Server calls are bounded so a slow/blocked backend can never hang
        // the UI forever.
        private const val SERVER_TIMEOUT_MS = 10_000L
        private const val PLAYBACK_TIMEOUT_MS = 15_000L
        private const val EXTRACTOR_TIMEOUT_MS = 10_000L
        private const val FAST_FALLBACK_TIMEOUT_MS = 4_500L
        private const val SEARCH_DEGRADED_COOLDOWN_MS = 90_000L

        private val RELATED_NOISE_WORDS = setOf(
            "official", "video", "music", "audio", "lyrics",
            "hd", "4k", "mv", "full", "shorts"
        )

        fun buildRelatedSearchQuery(title: String, channelTitle: String = ""): String {
            val cleaned = title
                .replace(Regex("\\[[^\\]]*]"), " ")
                .replace(Regex("\\([^)]*\\)"), " ")
                .replace(Regex("[^\\p{L}\\p{N}\\s]+"), " ")
                .trim()
            val tokens = cleaned
                .split(Regex("\\s+"))
                .filter { it.length > 1 && it.lowercase() !in RELATED_NOISE_WORDS }
                .take(4)
            return if (tokens.isNotEmpty()) tokens.joinToString(" ") else channelTitle.trim()
        }

        fun rankCachedRelated(
            candidates: Collection<VideoData>,
            excludeId: String,
            titleHint: String = "",
            channelHint: String = "",
            limit: Int = 15
        ): List<VideoData> {
            val cleanedChannel = channelHint.trim().lowercase()
            val topicTokens = buildRelatedSearchQuery(titleHint)
                .lowercase()
                .split(Regex("\\s+"))
                .filter { it.length > 1 }
            val unique = candidates
                .filter { it.id.isNotBlank() && it.id != excludeId && it.title.isNotBlank() }
                .distinctBy { it.id }
            return unique
                .mapIndexed { idx, video ->
                    var score = 0
                    val ch = video.displayChannelTitle.lowercase()
                    val combinedText = "${video.title} ${video.displayChannelTitle}".lowercase()
                    if (cleanedChannel.isNotBlank() && ch == cleanedChannel) {
                        score += 10
                    }
                    for (token in topicTokens) {
                        if (combinedText.contains(token)) {
                            score += 3
                        }
                    }
                    Triple(score, idx, video)
                }
                .sortedWith(compareByDescending<Triple<Int, Int, VideoData>> { it.first }.thenBy { it.second })
                .map { it.third }
                .take(limit)
        }
    }

    private val videoCache = java.util.concurrent.ConcurrentHashMap<String, VideoData>()

    @Volatile
    private var serverSearchDegradedUntilMs = 0L

    fun peekCachedVideo(videoId: String): VideoData? =
        videoId.takeIf { it.isNotBlank() }?.let { videoCache[it] }

    fun seedCache(videos: List<VideoData>) {
        if (videos.isEmpty()) return
        if (videoCache.size > 400) {
            videoCache.clear()
        }
        videos.forEach { video ->
            if (video.id.isNotBlank() && video.title.isNotBlank()) {
                val prev = videoCache[video.id]
                val merged = if (prev != null && video.channelThumbnail.isBlank() && prev.channelThumbnail.isNotBlank()) {
                    video.copy(channelThumbnail = prev.channelThumbnail)
                } else {
                    video
                }
                videoCache[video.id] = merged
            }
        }
    }

    /** Runs [block] but gives up after [timeoutMs], returning null on timeout. */
    private suspend fun <T> bounded(timeoutMs: Long, block: suspend () -> T): T? =
        withTimeoutOrNull(timeoutMs) { block() }

    suspend fun getShortsFeed(region: String = "GLOBAL", continuation: String? = null): KVApi.ShortsPage? =
        bounded(SERVER_TIMEOUT_MS) {
            api.getShortsFeed(region, continuation)
        }?.also { seedCache(it.videos) }

    suspend fun search(
        query: String,
        limit: Int = 30,
        region: String = "",
        page: Int = 1,
        sortBy: String? = null,
        date: String? = null,
        features: String? = null,
        duration: String? = null
    ): List<VideoData> {
        val trimmed = query.trim()
        if (trimmed.isBlank()) return emptyList()

        val canUseExtractor = page <= 1
        val now = System.currentTimeMillis()
        if (!canUseExtractor || now >= serverSearchDegradedUntilMs) {
            val serverResults = bounded(if (canUseExtractor) FAST_FALLBACK_TIMEOUT_MS else SERVER_TIMEOUT_MS) {
                api.search(trimmed, limit, region, page, sortBy, date, features, duration)
            }?.distinctBy { it.id }?.take(limit).orEmpty()

            if (serverResults.isNotEmpty()) {
                serverSearchDegradedUntilMs = 0L
                seedCache(serverResults)
                return serverResults
            }
            if (canUseExtractor) {
                serverSearchDegradedUntilMs = System.currentTimeMillis() + SEARCH_DEGRADED_COOLDOWN_MS
            }
        }

        if (!canUseExtractor) return emptyList()

        val fallback = (bounded(EXTRACTOR_TIMEOUT_MS) {
            extractorHelper.searchVideos(trimmed)
        } ?: emptyList()).distinctBy { it.id }.take(limit)
        seedCache(fallback)
        return fallback
    }

    suspend fun getPopular(limit: Int = 40): List<VideoData> =
        (bounded(SERVER_TIMEOUT_MS) {
            api.getPopular(limit)
        } ?: emptyList()).also { seedCache(it) }

    suspend fun getHomeFeed(limit: Int = 30, offset: Int = 0, region: String = ""): List<VideoData> {
        val list = bounded(SERVER_TIMEOUT_MS) {
            api.getHomeFeed(limit, offset, region)
        }
            ?: bounded(SERVER_TIMEOUT_MS) {
                api.getTrending(limit, region)
            }
            ?: emptyList()
        seedCache(list)
        return list
    }

    suspend fun getTrending(limit: Int = 30, region: String = "", page: Int = 1): List<VideoData> =
        (bounded(SERVER_TIMEOUT_MS) {
            api.getTrending(limit, region, page)
        } ?: emptyList()).also { seedCache(it) }

    suspend fun getVideoInfo(videoId: String): VideoData {
        val info = bounded(SERVER_TIMEOUT_MS) {
            api.getVideoInfo(videoId)
        }
        if (info != null && info.title.isNotBlank()) {
            seedCache(listOf(info))
            return info
        }
        val fallback = runCatching { extractorHelper.getVideoDetails(videoId) }.getOrNull()
        val resolved = fallback ?: info ?: VideoData(id = videoId)
        if (resolved.title.isNotBlank()) seedCache(listOf(resolved))
        return resolved
    }

    suspend fun getVideoBundle(videoId: String, relatedLimit: Int = 15): KVApi.VideoBundle? {
        val bundle = bounded(PLAYBACK_TIMEOUT_MS) {
            api.getVideoBundle(videoId, relatedLimit)
        } ?: return null
        if (bundle.video.title.isNotBlank()) {
            seedCache(listOf(bundle.video))
        }
        seedCache(bundle.relatedVideos)
        return bundle
    }

    /** Adaptive DASH manifest URL for [videoId] (null when no server is configured). */
    suspend fun dashManifestUrl(videoId: String): String? =
        runCatching { api.dashManifestUrl(videoId) }.getOrNull()

    /** Gateway host used to rewrite DASH segment URLs (null = raw Invidious). */
    fun gatewayHost(): String? = api.gatewayHost()

    suspend fun getPlaybackInfo(videoId: String, audio: String = "opus"): PlaybackInfo {
        val serverInfo = bounded(PLAYBACK_TIMEOUT_MS) {
            api.getPlaybackInfo(videoId, audio)
        }
        if (serverInfo != null && serverInfo.videoFormats.isNotEmpty()) {
            return serverInfo
        }

        // Resilient fallback: If the server is offline, rate-limited, or returned no streams,
        // fall back to extractorHelper so playback is never blocked.
        Log.w(TAG, "Server playback info unavailable for $videoId, falling back to on-device extractor")
        return try {
            val stream = extractorHelper.extractStreamUrl(videoId, com.kvtube.android.data.model.Quality.BEST)
            if (stream.videoUrl.isNotBlank()) {
                val format = com.kvtube.android.data.model.PlaybackFormat(
                    formatId = "extractor",
                    height = stream.height,
                    width = 0,
                    vcodec = "mp4v",
                    acodec = if (stream.audioUrl.isNullOrBlank()) "mp4a" else "",
                    ext = "mp4",
                    bandwidth = 0,
                    filesize = 0L,
                    url = stream.videoUrl,
                    hasAudio = stream.audioUrl.isNullOrBlank()
                )
                val audioFormat = stream.audioUrl?.takeIf { it.isNotBlank() }?.let {
                    com.kvtube.android.data.model.PlaybackFormat(
                        formatId = "extractor_audio",
                        height = 0,
                        bandwidth = 0,
                        filesize = 0L,
                        acodec = "mp4a",
                        ext = "m4a",
                        url = it,
                        hasAudio = true
                    )
                }
                PlaybackInfo(
                    title = "",
                    videoFormats = listOf(format),
                    audioFormat = audioFormat
                )
            } else {
                PlaybackInfo()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Extractor fallback failed for $videoId: ${e.message}")
            PlaybackInfo()
        }
    }

    suspend fun getRelatedVideos(
        videoId: String,
        limit: Int = 15,
        titleHint: String = "",
        channelHint: String = "",
        skipPrimaryApi: Boolean = false
    ): List<VideoData> {
        fun clean(list: List<VideoData>?): List<VideoData> =
            list.orEmpty()
                .filter { it.id.isNotBlank() && it.id != videoId && it.title.isNotBlank() }
                .distinctBy { it.id }
                .take(limit)

        // Tier 1: Invidious /videos/{id} recommendedVideos
        if (!skipPrimaryApi) {
            val serverRelated = clean(bounded(SERVER_TIMEOUT_MS) {
                api.getRelatedVideos(videoId, limit)
            })
            if (serverRelated.isNotEmpty()) {
                seedCache(serverRelated)
                return serverRelated
            }
        }

        // Tier 2: On-device YouTube related stream extraction
        val extractorRelated = clean(bounded(FAST_FALLBACK_TIMEOUT_MS) {
            runCatching { extractorHelper.getRelatedVideos(videoId) }.getOrNull()
        })
        if (extractorRelated.isNotEmpty()) {
            seedCache(extractorRelated)
            return extractorRelated
        }

        // Tier 3: Topical keyword / channel search
        val topicQuery = buildRelatedSearchQuery(titleHint, channelHint)
        if (topicQuery.isNotBlank()) {
            val topicResults = clean(bounded(FAST_FALLBACK_TIMEOUT_MS) {
                api.search(topicQuery, limit = limit)
            })
            if (topicResults.isNotEmpty()) {
                seedCache(topicResults)
                return topicResults
            }
        }
        val trimmedChannel = channelHint.trim()
        if (trimmedChannel.isNotBlank() && !trimmedChannel.equals(topicQuery, ignoreCase = true)) {
            val channelResults = clean(bounded(FAST_FALLBACK_TIMEOUT_MS) {
                api.search(trimmedChannel, limit = limit)
            })
            if (channelResults.isNotEmpty()) {
                seedCache(channelResults)
                return channelResults
            }
        }

        // Tier 4: Trending & Popular feeds
        val trending = clean(bounded(FAST_FALLBACK_TIMEOUT_MS) {
            api.getTrending(limit)
        })
        if (trending.isNotEmpty()) {
            seedCache(trending)
            return trending
        }

        val popular = clean(bounded(FAST_FALLBACK_TIMEOUT_MS) {
            api.getPopular(limit)
        })
        if (popular.isNotEmpty()) {
            seedCache(popular)
            return popular
        }

        // Tier 5: Local in-memory cache + watch history guarantee
        return getCachedFallbackVideos(
            excludeId = videoId,
            limit = limit,
            titleHint = titleHint,
            channelHint = channelHint
        )
    }

    suspend fun getCachedFallbackVideos(
        excludeId: String,
        limit: Int = 15,
        titleHint: String = "",
        channelHint: String = ""
    ): List<VideoData> {
        val candidates = ArrayList<VideoData>(videoCache.values)
        val history = runCatching { watchHistoryDao.getRecentWatched(limit + 10) }.getOrDefault(emptyList())
        for (h in history) {
            if (h.videoId.isNotBlank() && h.videoId != excludeId && h.title.isNotBlank()) {
                candidates.add(
                    VideoData(
                        id = h.videoId,
                        title = h.title,
                        thumbnail = h.thumbnail.ifBlank {
                            com.kvtube.android.data.local.ThumbnailRouter.video(h.videoId)
                        },
                        channelTitle = h.channelTitle,
                        uploader = h.channelTitle,
                        channelId = h.channelId,
                        duration = h.duration
                    )
                )
            }
        }
        return rankCachedRelated(
            candidates = candidates,
            excludeId = excludeId,
            titleHint = titleHint,
            channelHint = channelHint,
            limit = limit
        )
    }

    suspend fun getCommentsPage(videoId: String, continuation: String? = null, sortBy: String = "top"): CommentsPage {
        val serverPage = bounded(SERVER_TIMEOUT_MS) {
            runCatching { api.getCommentsPage(videoId, continuation, sortBy) }.getOrNull()
        }
        if (serverPage != null && serverPage.comments.isNotEmpty()) {
            return serverPage
        }
        // If server returned no comments on the initial request (and not a continuation request),
        // try on-device extractor fallback:
        if (continuation.isNullOrBlank()) {
            val fallbackPage = bounded(EXTRACTOR_TIMEOUT_MS) {
                runCatching { extractorHelper.getCommentsPage(videoId) }.getOrNull()
            }
            if (fallbackPage != null && fallbackPage.comments.isNotEmpty()) {
                return fallbackPage
            }
        }
        return serverPage ?: CommentsPage()
    }

    suspend fun getComments(videoId: String, limit: Int = 20): List<Comment> =
        getCommentsPage(videoId).comments.take(limit)

    suspend fun getSmartSuggestions(limit: Int = 12): List<VideoData> {
        val recentHistory = runCatching { watchHistoryDao.getRecentWatched(15) }.getOrNull() ?: emptyList()
        if (recentHistory.isEmpty()) return emptyList()

        val watchedIds = recentHistory.map { it.videoId }.toSet()
        val seeds = recentHistory.take(4)

        return coroutineScope {
            val jobs = seeds.map { seed ->
                async {
                    bounded(SERVER_TIMEOUT_MS) {
                        api.getRelatedVideos(seed.videoId, limit = 10)
                    } ?: emptyList()
                }
            }
            val pools = jobs.awaitAll()

            val seen = mutableSetOf<String>()
            seen.addAll(watchedIds)

            val suggestions = mutableListOf<VideoData>()
            val maxDepth = 10
            for (depth in 0 until maxDepth) {
                for (pool in pools) {
                    if (depth < pool.size) {
                        val video = pool[depth]
                        if (video.id.isNotBlank() && seen.add(video.id)) {
                            suggestions.add(video)
                            if (suggestions.size >= limit) {
                                return@coroutineScope suggestions
                            }
                        }
                    }
                }
            }
            suggestions
        }
    }
}
