package com.kvtube.android.player

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.kvtube.android.MainActivity
import com.kvtube.android.R
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.size.Size
import kotlinx.coroutines.runBlocking
import dagger.hilt.android.AndroidEntryPoint
import java.util.concurrent.Executors
import javax.inject.Inject

/**
 * Hosts the app-wide ExoPlayer (owned by [PlaybackManager]) inside a
 * MediaSession so Android renders the standard media card — artwork, title,
 * play/pause, seek bar — in the notification shade and on the lock screen
 * while KV-Tube plays, exactly like a native player app.
 *
 * The card is rendered HERE, driven by our own player listeners, instead of
 * relying on media3's DefaultMediaNotificationProvider: that machinery only
 * starts painting after the first MediaController connects to the service.
 * On some devices/ROMs (verified: nubia NX769J / Android 16) no controller
 * ever connects, so media3 would never post its card. Our listeners are
 * registered in onCreate before any playback event can fire, so this path
 * is deterministic.
 *
 * The service never releases the player itself: PlaybackManager owns it for
 * the lifetime of the process so watch page / mini player / PiP keep working.
 */
@OptIn(UnstableApi::class)
@AndroidEntryPoint
class PlaybackService : MediaSessionService() {

    companion object {
        private const val TAG = "PlaybackService"
        private const val CHANNEL_ID = "playback_channel"
        /** Deliberately different from media3's default media-card id (1000). */
        private const val PLACEHOLDER_NOTIFICATION_ID = 4711
        const val ACTION_TOGGLE = "com.kvtube.android.player.TOGGLE"
        const val ACTION_REWIND = "com.kvtube.android.player.REWIND"
        const val ACTION_FORWARD = "com.kvtube.android.player.FORWARD"
        private const val CARD_ACCENT_COLOR = 0xFFD32F2F.toInt()
    }

    @Inject
    lateinit var playbackManager: PlaybackManager

    private var mediaSession: MediaSession? = null
    private var largeIconBitmap: Bitmap? = null
    private var loadedThumbnailUrl: String? = null
    private var lastCardKey: String? = null

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

        try {
            val sessionActivity = PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            mediaSession = MediaSession.Builder(this, playbackManager.player)
                .setSessionActivity(sessionActivity)
                .build()
        } catch (t: Throwable) {
            Log.w(TAG, "Session with activity intent failed: ${t.message}")
            mediaSession = MediaSession.Builder(this, playbackManager.player).build()
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
            val session = mediaSession ?: return
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

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaSession?.player
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
        artworkExecutor.shutdownNow()
        runCatching {
            getSystemService(NotificationManager::class.java)
                .cancel(PLACEHOLDER_NOTIFICATION_ID)
        }
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }
}
