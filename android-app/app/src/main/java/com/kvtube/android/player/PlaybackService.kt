package com.kvtube.android.player

import android.content.Intent
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
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
        mediaSession = MediaSession.Builder(this, playbackManager.player).build()
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
