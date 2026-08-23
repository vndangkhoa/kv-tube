package com.kvtube.android.player

import android.content.Context
import android.content.Intent
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
        private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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
            .apply { playWhenReady = true }
    }

    private val _nowPlaying = MutableStateFlow<NowPlaying?>(null)
    val nowPlaying: StateFlow<NowPlaying?> = _nowPlaying.asStateFlow()

    private var loadedKey: String? = null

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

    /** Loads (or resumes) a stream. Switching quality of the same video keeps position. */
    fun play(videoId: String, videoUrl: String, audioUrl: String?) {
        if (videoUrl.isBlank()) return

        val key = "$videoId|$videoUrl"
        if (key == loadedKey && player.mediaItemCount > 0) {
            player.playWhenReady = true
            return
        }

        // Preserve position when only switching quality of the same video
        val isSameVideo = loadedKey?.startsWith("$videoId|") == true
        val isSameUrl = runCatching {
            player.currentMediaItem?.localConfiguration?.uri?.toString() == videoUrl
        }.getOrDefault(false)
        val resumePosition = if ((isSameVideo || isSameUrl) && player.currentPosition > 0) {
            player.currentPosition
        } else 0L

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
        player.setMediaSource(mediaSource)
        player.prepare()
        if (resumePosition > 0) player.seekTo(resumePosition)
        player.playWhenReady = true

        // Spin up the MediaSessionService so Android shows the media card
        // (notification + lock screen) with playback controls.
        ensureMediaServiceStarted()
    }

    private fun ensureMediaServiceStarted() {
        runCatching {
            ContextCompat.startForegroundService(
                context,
                Intent(context, PlaybackService::class.java)
            )
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
        player.stop()
        player.clearMediaItems()
        loadedKey = null
        _nowPlaying.value = null
    }
}
