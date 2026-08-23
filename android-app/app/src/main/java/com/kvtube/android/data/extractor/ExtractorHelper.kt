package com.kvtube.android.data.extractor

import android.content.Context
import android.util.Log
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.ExtractedStream
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.VideoData
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.comments.CommentsInfoItem
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.services.youtube.extractors.YoutubeStreamExtractor
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import okhttp3.OkHttpClient

@Singleton
class ExtractorHelper @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: KVApi,
    private val okHttpClient: OkHttpClient
) {
    companion object {
        private const val TAG = "ExtractorHelper"
        @Volatile
        private var isInitialized = false
    }

    init {
        initNewPipe()
    }

    @Synchronized
    private fun initNewPipe() {
        if (!isInitialized) {
            try {
                NewPipe.init(object : Downloader() {
                    private val client = okHttpClient.newBuilder()
                        .connectTimeout(8, TimeUnit.SECONDS)
                        .readTimeout(12, TimeUnit.SECONDS)
                        .build()

                    @Throws(IOException::class)
                    override fun execute(request: Request): Response {
                        val httpReq = okhttp3.Request.Builder()
                            .url(request.url())
                            .apply {
                                header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
                                request.headers().forEach { (k, v) ->
                                    if (v.isNotEmpty()) header(k, v[0])
                                }
                            }
                            .build()

                        val response = client.newCall(httpReq).execute()
                        val body = response.body?.string() ?: ""
                        return Response(
                            response.code,
                            response.message,
                            response.headers.toMultimap(),
                            body,
                            request.url()
                        )
                    }
                })
                isInitialized = true
            } catch (e: Exception) {
                Log.w(TAG, "NewPipe initialization error: ${e.message}")
            }
        }
    }

    suspend fun extractStreamUrl(
        videoId: String,
        quality: Quality,
        /** When set, hard-caps the stream height regardless of [quality]. */
        maxHeightOverride: Int? = null
    ): ExtractedStream = withContext(Dispatchers.IO) {
        initNewPipe()
        // Try on-device NewPipeExtractor first (Direct client-side, immune to server IP ban)
        try {
            val url = "https://www.youtube.com/watch?v=$videoId"
            val extractor = ServiceList.YouTube.getStreamExtractor(url) as? YoutubeStreamExtractor
            if (extractor != null) {
                extractor.fetchPage()

                val maxHeight = maxHeightOverride ?: when (quality) {
                    Quality.LOW -> 360
                    Quality.RECOMMENDED -> 1080
                    Quality.BEST -> Int.MAX_VALUE
                }

                // 1. Prefer combined progressive streams (Video + Audio in single MP4 container)
                val combinedStreams = extractor.videoStreams
                    .filter { !it.isVideoOnly && it.height <= maxHeight }
                    .sortedByDescending { it.height }

                if (combinedStreams.isNotEmpty()) {
                    val stream = combinedStreams.first()
                    return@withContext ExtractedStream(
                        videoUrl = stream.content,
                        height = stream.height,
                        isDash = false
                    )
                }

                // 2. Separate Video + Audio streams
                val videoStreams = extractor.videoStreams
                    .filter { it.height <= maxHeight }
                    .sortedByDescending { it.height }

                val audioStreams = extractor.audioStreams
                    .sortedByDescending { it.averageBitrate }

                if (videoStreams.isNotEmpty()) {
                    val vStream = videoStreams.first()
                    val aStream = audioStreams.firstOrNull()
                    return@withContext ExtractedStream(
                        videoUrl = vStream.content,
                        audioUrl = aStream?.content,
                        height = vStream.height,
                        isDash = true
                    )
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "NewPipe on-device stream extraction error for $videoId: ${e.message}, trying server fallback")
        }

        // Fallback to server's playback-info if available (bounded - a hung
        // backend must never delay the iframe fallback for long)
        try {
            val playback = kotlinx.coroutines.withTimeoutOrNull(5_000L) {
                api.getPlaybackInfo(videoId)
            }
            if (playback != null) {
                val maxHeight = maxHeightOverride ?: when (quality) {
                    Quality.LOW -> 360
                    Quality.RECOMMENDED -> 1080
                    Quality.BEST -> Int.MAX_VALUE
                }

                val progressive = playback.videoFormats.filter { it.hasAudio && it.url.isNotEmpty() }
                val bestProgressive = progressive.filter { it.height <= maxHeight }
                    .maxByOrNull { it.height } ?: progressive.minByOrNull { it.height }

                if (bestProgressive != null) {
                    return@withContext ExtractedStream(
                        videoUrl = bestProgressive.url,
                        height = bestProgressive.height,
                        isDash = false
                    )
                }

                val videoOnly = playback.videoFormats.filter { !it.hasAudio && it.url.isNotEmpty() }
                val bestVideoOnly = videoOnly.filter { it.height <= maxHeight }
                    .maxByOrNull { it.height } ?: videoOnly.minByOrNull { it.height }

                if (bestVideoOnly != null) {
                    return@withContext ExtractedStream(
                        videoUrl = bestVideoOnly.url,
                        audioUrl = playback.audioFormat?.url,
                        height = bestVideoOnly.height,
                        isDash = true
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Server playback-info fallback also failed for $videoId: ${e.message}")
        }

        ExtractedStream(videoUrl = "")
    }

    suspend fun getVideoDetails(videoId: String): VideoData? = withContext(Dispatchers.IO) {
        initNewPipe()
        try {
            val url = "https://www.youtube.com/watch?v=$videoId"
            val extractor = ServiceList.YouTube.getStreamExtractor(url) as? YoutubeStreamExtractor
            if (extractor != null) {
                extractor.fetchPage()
                val avatar = extractor.uploaderAvatars.maxByOrNull { it.height }?.url ?: ""
                return@withContext VideoData(
                    id = videoId,
                    title = extractor.name ?: "",
                    description = extractor.description?.content ?: "",
                    uploader = extractor.uploaderName ?: "",
                    channelTitle = extractor.uploaderName ?: "",
                    channelId = extractor.uploaderUrl?.substringAfterLast("/") ?: "",
                    channelThumbnail = avatar,
                    thumbnail = extractor.thumbnails.maxByOrNull { it.height }?.url
                        ?: com.kvtube.android.data.local.ThumbnailRouter.video(videoId),
                    duration = formatSeconds(extractor.length),
                    viewCount = extractor.viewCount,
                    views = if (extractor.viewCount >= 0) formatViewCount(extractor.viewCount) else "",
                    published = extractor.textualUploadDate ?: ""
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "On-device video details extraction failed for $videoId: ${e.message}")
        }
        null
    }

    suspend fun getRelatedVideos(videoId: String): List<VideoData> = withContext(Dispatchers.IO) {
        initNewPipe()
        try {
            val url = "https://www.youtube.com/watch?v=$videoId"
            val extractor = ServiceList.YouTube.getStreamExtractor(url) as? YoutubeStreamExtractor
            if (extractor != null) {
                extractor.fetchPage()
                val relatedItems = extractor.relatedItems?.items ?: emptyList()
                return@withContext relatedItems.mapNotNull { item ->
                    if (item is StreamInfoItem) {
                        val vid = extractVideoId(item.url)
                        if (vid.isNotBlank()) {
                            VideoData(
                                id = vid,
                                title = item.name ?: "",
                                uploader = item.uploaderName ?: "",
                                channelTitle = item.uploaderName ?: "",
                                channelId = item.uploaderUrl?.substringAfterLast("/") ?: "",
                                channelThumbnail = item.uploaderAvatars.maxByOrNull { it.height }?.url ?: "",
                                thumbnail = item.thumbnails.maxByOrNull { it.height }?.url
                                    ?: com.kvtube.android.data.local.ThumbnailRouter.video(vid),
                                duration = formatSeconds(item.duration),
                                viewCount = item.viewCount,
                                views = if (item.viewCount >= 0) formatViewCount(item.viewCount) else "",
                                published = item.textualUploadDate ?: ""
                            )
                        } else null
                    } else null
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "On-device related videos failed for $videoId: ${e.message}")
        }
        emptyList()
    }

    suspend fun getComments(videoId: String): List<Comment> = withContext(Dispatchers.IO) {
        initNewPipe()
        try {
            val url = "https://www.youtube.com/watch?v=$videoId"
            val commentsExtractor = ServiceList.YouTube.getCommentsExtractor(url)
            commentsExtractor.fetchPage()
            val initial = commentsExtractor.initialPage
            return@withContext initial.items.mapIndexed { idx, item ->
                if (item is CommentsInfoItem) {
                    val avatar = item.uploaderAvatars.maxByOrNull { it.height }?.url ?: ""
                    Comment(
                        id = item.commentId ?: "c_$idx",
                        author = item.uploaderName ?: "User",
                        authorThumbnail = avatar,
                        text = item.commentText?.content ?: "",
                        likes = if (item.likeCount >= 0) item.likeCount else 0,
                        published = item.textualUploadDate ?: ""
                    )
                } else {
                    Comment(id = "c_$idx", author = "User", text = "")
                }
            }.filter { it.text.isNotBlank() }
        } catch (e: Exception) {
            Log.w(TAG, "On-device comments extraction failed for $videoId: ${e.message}")
        }
        emptyList()
    }

    suspend fun getTrendingVideos(): List<VideoData> = withContext(Dispatchers.IO) {
        initNewPipe()
        try {
            val kiosk = ServiceList.YouTube.getKioskList().getExtractorById("Trending", null)
            kiosk.fetchPage()
            val page = kiosk.initialPage
            return@withContext page.items.mapNotNull { item ->
                if (item is StreamInfoItem) {
                    val vid = extractVideoId(item.url)
                    if (vid.isNotBlank()) {
                        VideoData(
                            id = vid,
                            title = item.name ?: "",
                            uploader = item.uploaderName ?: "",
                            channelTitle = item.uploaderName ?: "",
                            channelId = item.uploaderUrl?.substringAfterLast("/") ?: "",
                            thumbnail = item.thumbnails.maxByOrNull { it.height }?.url
                                ?: com.kvtube.android.data.local.ThumbnailRouter.video(vid),
                            duration = formatSeconds(item.duration),
                            viewCount = item.viewCount,
                            views = if (item.viewCount >= 0) formatViewCount(item.viewCount) else "",
                            published = item.textualUploadDate ?: ""
                        )
                    } else null
                } else null
            }
        } catch (e: Exception) {
            Log.w(TAG, "NewPipe trending extraction error: ${e.message}")
            emptyList()
        }
    }

    suspend fun searchVideos(query: String): List<VideoData> = withContext(Dispatchers.IO) {
        initNewPipe()
        try {
            val searchExtractor = ServiceList.YouTube.getSearchExtractor(query)
            searchExtractor.fetchPage()
            val page = searchExtractor.initialPage
            return@withContext page.items.mapNotNull { item ->
                if (item is StreamInfoItem) {
                    val vid = extractVideoId(item.url)
                    if (vid.isNotBlank()) {
                        VideoData(
                            id = vid,
                            title = item.name ?: "",
                            uploader = item.uploaderName ?: "",
                            channelTitle = item.uploaderName ?: "",
                            channelId = item.uploaderUrl?.substringAfterLast("/") ?: "",
                            thumbnail = item.thumbnails.maxByOrNull { it.height }?.url
                                ?: com.kvtube.android.data.local.ThumbnailRouter.video(vid),
                            duration = formatSeconds(item.duration),
                            viewCount = item.viewCount,
                            views = if (item.viewCount >= 0) formatViewCount(item.viewCount) else "",
                            published = item.textualUploadDate ?: ""
                        )
                    } else null
                } else null
            }
        } catch (e: Exception) {
            Log.w(TAG, "NewPipe search extraction error for $query: ${e.message}")
            emptyList()
        }
    }

    private fun extractVideoId(url: String): String {
        return when {
            url.contains("watch?v=") -> url.substringAfter("watch?v=").substringBefore("&")
            url.contains("youtu.be/") -> url.substringAfter("youtu.be/").substringBefore("?")
            url.contains("/shorts/") -> url.substringAfter("/shorts/").substringBefore("?")
            else -> url.substringAfterLast("/")
        }
    }

    private fun formatSeconds(seconds: Long): String {
        if (seconds <= 0) return ""
        val mins = seconds / 60
        val secs = seconds % 60
        val hours = mins / 60
        return if (hours > 0) {
            "%d:%02d:%02d".format(hours, mins % 60, secs)
        } else {
            "%d:%02d".format(mins, secs)
        }
    }

    private fun formatViewCount(count: Long): String {
        return when {
            count >= 1_000_000_000 -> String.format("%.1fB views", count / 1_000_000_000.0)
            count >= 1_000_000 -> String.format("%.1fM views", count / 1_000_000.0)
            count >= 1_000 -> String.format("%.1fK views", count / 1_000.0)
            else -> "$count views"
        }
    }
}
