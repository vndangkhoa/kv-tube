package com.kvtube.android.player

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

data class NowPlaying(
    val videoId: String = "",
    val title: String = "",
    val channelTitle: String = "",
    val thumbnail: String = ""
)

/**
 * App-wide playback holder. The ExoPlayer instance lives here (not inside the
 * watch screen) so that navigating back from the watch page keeps the audio/
 * video going while the UI shrinks into the mini player. Re-entering the
 * watch page re-attaches to the very same player, which makes the full <-> mini
 * transition seamless.
 */
@Singleton
class PlaybackManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "PlaybackManager"
        private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

        /** Minimum gap between quality switches of the same video. Rapid tier
         *  taps force MediaCodec teardown/rebuild cycles faster than some
         *  (especially older) devices survive — this debounce keeps the codec
         *  churn bounded. */
        private const val QUALITY_SWITCH_DEBOUNCE_MS = 350L
    }

    private val httpFactory = DefaultHttpDataSource.Factory()
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(30_000)
        .setDefaultRequestProperties(mapOf("User-Agent" to USER_AGENT))

    val player: ExoPlayer by lazy {
        ExoPlayer.Builder(context)
            .setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                        /* minBufferMs = */ 15_000,
                        /* maxBufferMs = */ 60_000,
                        /* bufferForPlaybackMs = */ 2_500,
                        /* bufferForPlaybackAfterRebufferMs = */ 5_000
                    )
                    .build()
            )
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(androidx.media3.common.C.USAGE_MEDIA)
                    .setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                /* handleAudioFocus = */ true
            )
            .build()
            .apply {
                playWhenReady = true
                addListener(object : androidx.media3.common.Player.Listener {
                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        // Central log point for playback failures (bad stream,
                        // expired URL, codec problems) so crashes-in-waiting
                        // are diagnosable from logcat.
                        Log.e(TAG, "Player error: ${error.errorCodeName}", error)
                    }
                })
            }
    }

    private val _nowPlaying = MutableStateFlow<NowPlaying?>(null)
    val nowPlaying: StateFlow<NowPlaying?> = _nowPlaying.asStateFlow()

    private var loadedKey: String? = null
    private var lastSwitchAt: Long = 0L

    fun setMetadata(videoId: String, title: String, channelTitle: String, thumbnail: String) {
        val current = _nowPlaying.value
        if (current == null || current.videoId != videoId) {
            _nowPlaying.value = NowPlaying(
                videoId = videoId,
                title = title,
                channelTitle = channelTitle,
                thumbnail = thumbnail
            )
            loadedKey = null
            // Bring the MediaSessionService up as soon as a new video page
            // opens (not just when the first frame plays) so the media card
            // appears reliably.
            ensureMediaServiceStarted()
        } else {
            _nowPlaying.value = current.copy(title = title, channelTitle = channelTitle, thumbnail = thumbnail)
        }

        // Reflect enriched metadata (title/artwork arrive async after the
        // first play()) straight into the active media item so the media
        // card in the notification / lock screen shows the real info.
        reflectMetadataIntoPlayer(videoId, title, channelTitle, thumbnail)
    }

    private fun reflectMetadataIntoPlayer(videoId: String, title: String, channelTitle: String, thumbnail: String) {
        val p = player
        if (loadedKey?.startsWith("$videoId|") != true || p.mediaItemCount == 0) return
        try {
            val item = p.getMediaItemAt(0)
            val old = item.mediaMetadata
            val updated = old.buildUpon()
                .setTitle(title.ifBlank { old.title })
                .setArtist(channelTitle.ifBlank { old.artist })
                .setArtworkUri(
                    thumbnail.takeIf { it.isNotBlank() }?.let { Uri.parse(it) } ?: old.artworkUri
                )
                .build()
            val newItem = item.buildUpon().setMediaMetadata(updated).build()
            p.replaceMediaItem(0, newItem)
        } catch (_: Exception) {
            // best-effort — never disturb playback for cosmetics
        }
    }

    /** Loads (or resumes) a stream. Switching quality of the same video keeps position.
     *
     *  Never throws: any player failure is logged and swallowed so a bad
     *  stream / codec problem can never take the whole app down. */
    fun play(videoId: String, videoUrl: String, audioUrl: String?) {
        if (videoUrl.isBlank()) return
        try {
            val key = "$videoId|$videoUrl"
            if (key == loadedKey && player.mediaItemCount > 0) {
                player.playWhenReady = true
                return
            }

            // Bounded codec churn: ignore tier re-taps fired within the
            // debounce window of the previous switch (same video only).
            val now = android.os.SystemClock.elapsedRealtime()
            val isSameVideo = loadedKey?.startsWith("$videoId|") == true
            if (isSameVideo && now - lastSwitchAt < QUALITY_SWITCH_DEBOUNCE_MS) {
                Log.d(TAG, "Quality switch debounced for $videoId")
                return
            }

            // Preserve position when only switching quality of the same video
            val isSameUrl = runCatching {
                player.currentMediaItem?.localConfiguration?.uri?.toString() == videoUrl
            }.getOrDefault(false)
            var resumePosition = if ((isSameVideo || isSameUrl) && player.currentPosition > 0) {
                player.currentPosition
            } else 0L

            // Clamping to just before the end avoids landing in STATE_ENDED
            // when switching quality near the last seconds of the video.
            val duration = runCatching { player.duration }.getOrDefault(0L)
            if (resumePosition > 0 && duration > 0) {
                resumePosition = resumePosition.coerceAtMost((duration - 5_000).coerceAtLeast(0L))
            }

            val keyOfLoaded = key
            val nowPlayingMeta = _nowPlaying.value
            val mediaMetadata = MediaMetadata.Builder()
                .setTitle(nowPlayingMeta?.title.orEmpty())
                .setArtist(nowPlayingMeta?.channelTitle.orEmpty())
                .setArtworkUri(
                    nowPlayingMeta?.thumbnail?.takeIf { it.isNotBlank() }?.let { Uri.parse(it) }
                )
                .build()
            val videoItem = MediaItem.Builder()
                .setUri(Uri.parse(videoUrl))
                .setMediaMetadata(mediaMetadata)
                .build()

            val videoSource = ProgressiveMediaSource.Factory(httpFactory)
                .createMediaSource(videoItem)
            val mediaSource = if (!audioUrl.isNullOrBlank()) {
                val audioSource = ProgressiveMediaSource.Factory(httpFactory)
                    .createMediaSource(MediaItem.fromUri(Uri.parse(audioUrl)))
                MergingMediaSource(videoSource, audioSource)
            } else {
                videoSource
            }

            loadedKey = keyOfLoaded
            lastSwitchAt = now
            // Positional overload: the resume seek is applied atomically with
            // the new source, avoiding a post-prepare seekTo racing an
            // in-flight quality switch.
            if (resumePosition > 0) {
                player.setMediaSource(mediaSource, resumePosition)
            } else {
                player.setMediaSource(mediaSource)
            }
            player.prepare()
            player.playWhenReady = true

            // Spin up the MediaSessionService so Android shows the media card
            // (notification + lock screen) with playback controls.
            ensureMediaServiceStarted()
        } catch (t: Throwable) {
            // A failed source switch must degrade gracefully (the player error
            // listener / UI retry path handles recovery), never crash.
            Log.e(TAG, "play($videoId) failed", t)
        }
    }

    private fun ensureMediaServiceStarted() {
        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, PlaybackService::class.java)
            )
        } catch (t: Throwable) {
            // Background-start restrictions etc. — the card simply stays
            // hidden; playback is unaffected.
            Log.w(TAG, "Could not start PlaybackService: ${t.message}")
        }
    }

    /** True when this exact stream URL is already prepared in the player. */
    fun isLoadedFor(videoUrl: String): Boolean =
        loadedKey?.endsWith("|$videoUrl") == true && player.mediaItemCount > 0

    fun togglePlayPause() {
        if (player.isPlaying) player.pause() else player.play()
    }

    fun pause() = player.pause()

    fun stopAndClear() {
        try {
            player.stop()
            player.clearMediaItems()
        } catch (t: Throwable) {
            Log.w(TAG, "stopAndClear: ${t.message}")
        }
        loadedKey = null
        lastSwitchAt = 0L
        _nowPlaying.value = null
    }
}
