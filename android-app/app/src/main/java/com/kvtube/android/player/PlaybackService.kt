package com.kvtube.android.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.concurrent.futures.ResolvableFuture
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.kvtube.android.MainActivity
import com.kvtube.android.R
import com.kvtube.android.data.local.DownloadedVideoEntity
import com.kvtube.android.data.model.QualityTier
import com.kvtube.android.data.model.QualityTiers
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.DownloadRepository
import com.kvtube.android.data.repository.HistoryRepository
import com.kvtube.android.data.repository.SubscriptionRepository
import com.kvtube.android.data.repository.VideoRepository
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.size.Size
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.io.File
import java.util.concurrent.Executors
import javax.inject.Inject

/**
 * Hosts the app-wide ExoPlayer (owned by [PlaybackManager]) inside a
 * MediaLibrarySession so Android renders the standard media card in notification/
 * lock screen and provides Android Auto in-car media browsing & playback.
 */
@OptIn(UnstableApi::class)
@AndroidEntryPoint
class PlaybackService : MediaLibraryService() {

    companion object {
        private const val TAG = "PlaybackService"
        private const val CHANNEL_ID = "playback_channel"
        /** Deliberately different from media3's default media-card id (1000). */
        private const val PLACEHOLDER_NOTIFICATION_ID = 4711
        const val ACTION_TOGGLE = "com.kvtube.android.player.TOGGLE"
        const val ACTION_REWIND = "com.kvtube.android.player.REWIND"
        const val ACTION_FORWARD = "com.kvtube.android.player.FORWARD"
        private const val CARD_ACCENT_COLOR = 0xFFD32F2F.toInt()

        // Android Auto category IDs
        private const val ROOT_ID = "ROOT"
        private const val CATEGORY_SUBSCRIPTIONS = "CATEGORY_SUBSCRIPTIONS"
        private const val CATEGORY_HISTORY = "CATEGORY_HISTORY"
        private const val CATEGORY_DOWNLOADS = "CATEGORY_DOWNLOADS"
        private const val CATEGORY_TRENDING = "CATEGORY_TRENDING"
    }

    @Inject
    lateinit var playbackManager: PlaybackManager
    @Inject
    lateinit var historyRepository: HistoryRepository
    @Inject
    lateinit var subscriptionRepository: SubscriptionRepository
    @Inject
    lateinit var videoRepository: VideoRepository
    @Inject
    lateinit var downloadRepository: DownloadRepository

    private var mediaLibrarySession: MediaLibrarySession? = null
    private var largeIconBitmap: Bitmap? = null
    private var loadedThumbnailUrl: String? = null
    private var lastCardKey: String? = null

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val artworkExecutor = Executors.newSingleThreadExecutor()

    override fun onCreate() {
        super.onCreate()

        // Discharge the startForegroundService() obligation synchronously, right
        // here. MediaSessionService only calls startForeground() itself when one
        // of its internally-registered listeners observes a playback transition
        // (buffering -> ready etc.). If this service is created after those
        // events already fired — or playback stalls before it starts — no such
        // event ever arrives, the ~10s Android deadline expires and the whole
        // process is killed with ForegroundServiceDidNotStartInTimeException.
        // Calling startForeground() here makes that impossible regardless of
        // player state or timing; the full media card replaces this minimal
        // notification as soon as our listeners paint it (see below).
        dischargeForegroundObligation()

        val callback = AutoLibrarySessionCallback()
        try {
            val sessionActivity = PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            mediaLibrarySession = MediaLibrarySession.Builder(this, playbackManager.player, callback)
                .setSessionActivity(sessionActivity)
                .build()
        } catch (t: Throwable) {
            Log.w(TAG, "Session with activity intent failed: ${t.message}")
            mediaLibrarySession = MediaLibrarySession.Builder(this, playbackManager.player, callback).build()
        }

        // Paint & keep updating the media card ourselves. onEvents fires for
        // every relevant change (state, playing, metadata, transitions) and was
        // registered before any of those events could happen.
        playbackManager.player.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                if (events.containsAny(
                        Player.EVENT_PLAYBACK_STATE_CHANGED,
                        Player.EVENT_IS_PLAYING_CHANGED,
                        Player.EVENT_PLAY_WHEN_READY_CHANGED,
                        Player.EVENT_MEDIA_ITEM_TRANSITION,
                        Player.EVENT_MEDIA_METADATA_CHANGED,
                        Player.EVENT_TIMELINE_CHANGED,
                        Player.EVENT_POSITION_DISCONTINUITY
                    )
                ) {
                    updateMediaCard()
                }
            }
        })

        // Safety net: if the service ever ends up started while there is nothing
        // to play at all, stop instead of lingering needlessly.
        playbackManager.player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                val player = playbackManager.player
                if (playbackState == Player.STATE_IDLE && player.mediaItemCount == 0) {
                    stopSelf()
                }
            }
        })

        updateMediaCard()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_TOGGLE -> playbackManager.togglePlayPause()
            ACTION_REWIND -> runCatching {
                val p = playbackManager.player
                p.seekTo((p.currentPosition - 10_000).coerceAtLeast(0L))
            }
            ACTION_FORWARD -> runCatching {
                val p = playbackManager.player
                val dur = p.duration.takeIf { it > 0 } ?: Long.MAX_VALUE
                p.seekTo((p.currentPosition + 10_000).coerceAtMost(dur))
            }
        }
        return START_STICKY
    }

    /** Posts a silent minimal notification and enters foreground state. */
    private fun dischargeForegroundObligation() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Playback",
                    NotificationManager.IMPORTANCE_LOW
                ).apply { description = "KV-Tube playback status" }
                getSystemService(NotificationManager::class.java)
                    .createNotificationChannel(channel)
            }
            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("KV-Tube")
                .setContentText("Preparing playback…")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
            ServiceCompat.startForeground(
                this,
                PLACEHOLDER_NOTIFICATION_ID,
                notification,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                } else {
                    0
                }
            )
        } catch (t: Throwable) {
            // Should not happen (manifest declares the type + permission); log
            // for diagnosis but never let cosmetics take the process down.
            Log.e(TAG, "startForeground failed", t)
        }
    }

    /** Rebuilds and re-posts the rich media card (same id → updates in place). */
    @Suppress("DEPRECATION", "RestrictedApi")
    private fun updateMediaCard() {
        try {
            val session = mediaLibrarySession ?: return
            val player = playbackManager.player
            if (player.mediaItemCount == 0) return

            val meta = playbackManager.nowPlaying.value
            val title = meta?.title?.takeIf { it.isNotBlank() }
                ?: player.currentMediaItem?.mediaMetadata?.title?.toString()
                ?: "KV-Tube"
            val subtitle = meta?.channelTitle.orEmpty()
            val isPlaying = player.isPlaying

            // Tapping the card (outside buttons) re-opens KV-Tube.
            val contentIntent = PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(
                    if (isPlaying) R.drawable.ic_notif_pause else R.drawable.ic_notif_play
                )
                .setContentTitle(title)
                .setContentText(subtitle)
                .setContentIntent(contentIntent)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setShowWhen(false)
                .setColor(CARD_ACCENT_COLOR)
                .addAction(
                    NotificationCompat.Action(
                        R.drawable.ic_notif_rewind,
                        "Rewind",
                        servicePendingIntent(ACTION_REWIND, 2)
                    )
                )
                .addAction(
                    NotificationCompat.Action(
                        if (isPlaying) R.drawable.ic_notif_pause else R.drawable.ic_notif_play,
                        if (isPlaying) "Pause" else "Play",
                        servicePendingIntent(ACTION_TOGGLE, 1)
                    )
                )
                .addAction(
                    NotificationCompat.Action(
                        R.drawable.ic_notif_forward,
                        "Forward",
                        servicePendingIntent(ACTION_FORWARD, 3)
                    )
                )

            largeIconBitmap?.let { builder.setLargeIcon(it) }

            // Linking the MediaStyle to the MediaSession's compat token gives
            // the native media-card treatment: seek bar + artwork template on
            // Android 11+, SystemUI-rendered rich card with progress & controls
            // on Android 13+, themed controls on the lock screen.
            builder.setStyle(
                MediaStyle()
                    .setMediaSession(session.getSessionCompatToken())
                    .setShowActionsInCompactView(0, 1, 2)
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Pre-13 devices: tinted gradient backdrop behind the card.
                builder.setColorized(true)
            }

            getSystemService(NotificationManager::class.java)
                .notify(PLACEHOLDER_NOTIFICATION_ID, builder.build())

            loadArtworkAsync(meta?.thumbnail)
        } catch (t: Throwable) {
            // Card cosmetics must never take the process down.
            Log.w(TAG, "updateMediaCard failed: ${t.message}")
        }
    }

    private fun servicePendingIntent(action: String, requestCode: Int): PendingIntent =
        PendingIntent.getService(
            this,
            requestCode,
            Intent(this, PlaybackService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    /** Fetches artwork off the main thread, then repaints the card with it.
     *  The repaint is marshalled back to the main thread because the card
     *  builder reads ExoPlayer state (ExoPlayer is main-thread only). */
    private fun loadArtworkAsync(thumbnailUrl: String?) {
        if (thumbnailUrl.isNullOrBlank() || thumbnailUrl == loadedThumbnailUrl) return
        loadedThumbnailUrl = thumbnailUrl
        artworkExecutor.execute {
            runCatching {
                val result = runBlocking {
                    SingletonImageLoader.get(this@PlaybackService).execute(
                        ImageRequest.Builder(this@PlaybackService)
                            .data(thumbnailUrl)
                            .size(Size(512, 512))
                            .allowHardware(false)
                            .build()
                    )
                }
                val image = (result as? coil3.request.SuccessResult)?.image
                val bitmap = (image as? coil3.BitmapImage)?.bitmap
                if (bitmap != null && thumbnailUrl == loadedThumbnailUrl) {
                    largeIconBitmap = bitmap
                    android.os.Handler(android.os.Looper.getMainLooper())
                        .post { updateMediaCard() }
                }
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        mediaLibrarySession

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaLibrarySession?.player
        if (player == null ||
            !player.playWhenReady ||
            player.mediaItemCount == 0 ||
            player.playbackState == Player.STATE_ENDED
        ) {
            stopSelf()
        }
        // Otherwise keep playing in the background with the media card alive.
    }

    override fun onDestroy() {
        serviceScope.cancel()
        artworkExecutor.shutdownNow()
        runCatching {
            getSystemService(NotificationManager::class.java)
                .cancel(PLACEHOLDER_NOTIFICATION_ID)
        }
        mediaLibrarySession?.release()
        mediaLibrarySession = null
        super.onDestroy()
    }

    /**
     * Handles browsing and playback requests from Android Auto and automotive head units.
     */
    private inner class AutoLibrarySessionCallback : MediaLibrarySession.Callback {

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val rootItem = MediaItem.Builder()
                .setMediaId(ROOT_ID)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle("KV-Tube")
                        .setIsBrowsable(true)
                        .setIsPlayable(false)
                        .build()
                )
                .build()
            return Futures.immediateFuture(LibraryResult.ofItem(rootItem, params))
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val future = ResolvableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
            serviceScope.launch(Dispatchers.IO) {
                try {
                    val items: List<MediaItem> = when (parentId) {
                        ROOT_ID -> listOf(
                            createCategoryItem(CATEGORY_SUBSCRIPTIONS, "Subscriptions"),
                            createCategoryItem(CATEGORY_HISTORY, "Watch History"),
                            createCategoryItem(CATEGORY_DOWNLOADS, "Downloads"),
                            createCategoryItem(CATEGORY_TRENDING, "Trending")
                        )
                        CATEGORY_SUBSCRIPTIONS -> {
                            val feed = subscriptionRepository.getFeed(
                                offset = page * pageSize,
                                pageSize = pageSize.coerceAtLeast(20)
                            )
                            feed.map { it.toCarMediaItem() }
                        }
                        CATEGORY_HISTORY -> {
                            val history = historyRepository.getHistory(limit = pageSize.coerceAtLeast(30))
                            history.map { it.toCarMediaItem() }
                        }
                        CATEGORY_DOWNLOADS -> {
                            val downloads = downloadRepository.getAllDownloads().first()
                            downloads.map { it.toCarMediaItem() }
                        }
                        CATEGORY_TRENDING -> {
                            val trending = videoRepository.getTrending(limit = pageSize.coerceAtLeast(20))
                            trending.map { it.toCarMediaItem() }
                        }
                        else -> emptyList()
                    }
                    future.set(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
                } catch (e: Exception) {
                    Log.e(TAG, "Error fetching children for $parentId: ${e.message}", e)
                    future.set(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE))
                }
            }
            return future
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val future = ResolvableFuture.create<LibraryResult<MediaItem>>()
            serviceScope.launch(Dispatchers.IO) {
                try {
                    val download = downloadRepository.getDownload(mediaId)
                    if (download != null) {
                        future.set(LibraryResult.ofItem(download.toCarMediaItem(), null))
                        return@launch
                    }
                    val video = videoRepository.getVideoInfo(mediaId)
                    future.set(LibraryResult.ofItem(video.toCarMediaItem(), null))
                } catch (e: Exception) {
                    Log.e(TAG, "Error fetching item for $mediaId: ${e.message}", e)
                    future.set(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE))
                }
            }
            return future
        }

        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<Void>> {
            session.notifySearchResultChanged(browser, query, 20, params)
            return Futures.immediateFuture(LibraryResult.ofVoid())
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val future = ResolvableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
            serviceScope.launch(Dispatchers.IO) {
                try {
                    val results = videoRepository.search(query, limit = pageSize.coerceAtLeast(20))
                    val items = results.map { it.toCarMediaItem() }
                    future.set(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
                } catch (e: Exception) {
                    Log.e(TAG, "Error fetching search results for '$query': ${e.message}", e)
                    future.set(LibraryResult.ofError(LibraryResult.RESULT_ERROR_UNKNOWN))
                }
            }
            return future
        }

        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>
        ): ListenableFuture<MutableList<MediaItem>> {
            val future = ResolvableFuture.create<MutableList<MediaItem>>()
            serviceScope.launch(Dispatchers.IO) {
                try {
                    val resolvedList = mutableListOf<MediaItem>()
                    for (item in mediaItems) {
                        val resolved = resolvePlayableItem(item)
                        if (resolved != null) {
                            resolvedList.add(resolved)
                        }
                    }
                    future.set(resolvedList)
                } catch (e: Exception) {
                    Log.e(TAG, "Error resolving media items for Auto: ${e.message}", e)
                    future.set(mediaItems)
                }
            }
            return future
        }

        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val future = ResolvableFuture.create<MediaSession.MediaItemsWithStartPosition>()
            serviceScope.launch(Dispatchers.IO) {
                try {
                    val history = historyRepository.getHistory(limit = 1)
                    val lastItem = history.firstOrNull()?.toCarMediaItem()
                    if (lastItem != null) {
                        val resolved = resolvePlayableItem(lastItem)
                        if (resolved != null) {
                            future.set(
                                MediaSession.MediaItemsWithStartPosition(
                                    listOf(resolved),
                                    /* startIndex = */ 0,
                                    /* startPositionMs = */ 0L
                                )
                            )
                            return@launch
                        }
                    }
                    future.setException(UnsupportedOperationException("No resumption item available"))
                } catch (e: Exception) {
                    future.setException(e)
                }
            }
            return future
        }
    }

    private suspend fun resolvePlayableItem(item: MediaItem): MediaItem? {
        val videoId = item.mediaId
        if (videoId.isBlank()) return item

        // 1. Check offline downloads first
        val download = downloadRepository.getDownload(videoId)
        if (download != null) {
            val localUri = download.contentUri?.takeIf { it.isNotBlank() }
                ?: download.filePath.takeIf { File(it).exists() }?.let { Uri.fromFile(File(it)).toString() }
            if (!localUri.isNullOrBlank()) {
                val metadata = item.mediaMetadata.buildUpon()
                    .setTitle(download.title.ifBlank { item.mediaMetadata.title })
                    .setArtist(download.channelTitle.ifBlank { item.mediaMetadata.artist })
                    .setArtworkUri(
                        download.thumbnail.takeIf { it.isNotBlank() }?.let { Uri.parse(it) }
                            ?: item.mediaMetadata.artworkUri
                    )
                    .setIsPlayable(true)
                    .setIsBrowsable(false)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_PODCAST_EPISODE)
                    .build()

                playbackManager.setMetadata(
                    videoId = videoId,
                    title = download.title,
                    channelTitle = download.channelTitle,
                    thumbnail = download.thumbnail
                )

                return item.buildUpon()
                    .setUri(Uri.parse(localUri))
                    .setMediaMetadata(metadata)
                    .build()
            }
        }

        // 2. Online stream resolution
        val playbackInfo = videoRepository.getPlaybackInfo(videoId)
        val audioUrl = playbackInfo.audioFormat?.url?.takeIf { it.isNotBlank() }
        val streamUrl = audioUrl
            ?: QualityTiers.resolve(QualityTier.LOW, playbackInfo)?.first?.url
            ?: return null

        val title = item.mediaMetadata.title?.toString()?.takeIf { it.isNotBlank() }
            ?: playbackInfo.title
        val author = item.mediaMetadata.artist?.toString()?.takeIf { it.isNotBlank() }
            ?: ""
        val artworkUri = item.mediaMetadata.artworkUri

        playbackManager.setMetadata(
            videoId = videoId,
            title = title,
            channelTitle = author,
            thumbnail = artworkUri?.toString().orEmpty()
        )

        // Record history so in-car playback appears in recent history
        runCatching {
            historyRepository.record(
                videoId = videoId,
                title = title,
                thumbnail = artworkUri?.toString().orEmpty(),
                uploader = author
            )
        }

        val updatedMetadata = item.mediaMetadata.buildUpon()
            .setTitle(title)
            .setArtist(author)
            .setArtworkUri(artworkUri)
            .setIsPlayable(true)
            .setIsBrowsable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_PODCAST_EPISODE)
            .build()

        return item.buildUpon()
            .setUri(Uri.parse(streamUrl))
            .setMediaMetadata(updatedMetadata)
            .build()
    }

    private fun VideoData.toCarMediaItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(displayChannelTitle)
                    .setArtworkUri(displayThumbnail.takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
                    .setIsPlayable(true)
                    .setIsBrowsable(false)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_PODCAST_EPISODE)
                    .build()
            )
            .build()
    }

    private fun DownloadedVideoEntity.toCarMediaItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(videoId)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(channelTitle)
                    .setArtworkUri(thumbnail.takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
                    .setIsPlayable(true)
                    .setIsBrowsable(false)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_PODCAST_EPISODE)
                    .build()
            )
            .build()
    }

    private fun createCategoryItem(id: String, title: String): MediaItem {
        return MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .build()
            )
            .build()
    }
}
