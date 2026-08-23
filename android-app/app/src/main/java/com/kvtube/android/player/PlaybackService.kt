package com.kvtube.android.player

import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.kvtube.android.MainActivity
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Hosts the app-wide ExoPlayer (owned by [PlaybackManager]) inside a
 * MediaSession so Android renders the standard media card — artwork, title,
 * play/pause, seek bar — in the notification shade and on the lock screen
 * while KV-Tube plays, exactly like a native player app.
 *
 * The service never releases the player itself: PlaybackManager owns it for
 * the lifetime of the process so watch page / mini player / PiP keep working.
 */
@AndroidEntryPoint
class PlaybackService : MediaSessionService() {

    @Inject
    lateinit var playbackManager: PlaybackManager

    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
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
            Log.w("PlaybackService", "Session with activity intent failed: ${t.message}")
            mediaSession = MediaSession.Builder(this, playbackManager.player).build()
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
        // Release only the session; the player belongs to PlaybackManager.
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }
}
