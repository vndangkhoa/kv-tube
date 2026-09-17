package com.kvtube.tv.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import com.kvtube.tv.data.api.MpdGenerator
import com.kvtube.tv.data.model.InvidiousAdaptiveFormat
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.viewmodel.PlayerViewModel

/**
 * Reusable, application-scoped ExoPlayer manager for Android TV.
 *
 * Keeps codecs and audio sinks warm across screen transitions, eliminating the
 * 300–600ms cold-init latency on low-spec TV SoCs.
 */
@OptIn(UnstableApi::class)
class TvPlaybackManager private constructor(context: Context) {

    companion object {
        @Volatile
        private var instance: TvPlaybackManager? = null

        fun getInstance(context: Context): TvPlaybackManager =
            instance ?: synchronized(this) {
                instance ?: TvPlaybackManager(context.applicationContext).also { instance = it }
            }
    }

    val httpFactory: DefaultHttpDataSource.Factory = DefaultHttpDataSource.Factory()
        .setUserAgent("com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip")
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(30_000)
        .setAllowCrossProtocolRedirects(true)
        .setDefaultRequestProperties(
            mapOf(
                "Referer" to "https://www.youtube.com/",
                "Origin" to "https://www.youtube.com"
            )
        )

    val dataSourceFactory: DefaultDataSource.Factory =
        DefaultDataSource.Factory(context.applicationContext, httpFactory)

    val trackSelector: DefaultTrackSelector = DefaultTrackSelector(context).apply {
        setParameters(
            buildUponParameters()
                .setMaxVideoSize(3840, 2160)
                .setMaxVideoBitrate(Int.MAX_VALUE)
                .setForceHighestSupportedBitrate(true)
        )
    }

    /**
     * Tuned buffer thresholds:
     * - bufferForPlaybackMs = 500: Starts rendering as soon as 0.5s of chunks are loaded (fast start).
     * - bufferForPlaybackAfterRebufferMs = 1500: Recovers quickly if network dips.
     * - minBufferMs = 15,000 / maxBufferMs = 50,000: Ample headroom without hogging TV RAM.
     */
    val loadControl: DefaultLoadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            /* minBufferMs = */ 15_000,
            /* maxBufferMs = */ 50_000,
            /* bufferForPlaybackMs = */ 500,
            /* bufferForPlaybackAfterRebufferMs = */ 1500
        )
        .setBackBuffer(30_000, true)
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()

    val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext)
        .setTrackSelector(trackSelector)
        .setLoadControl(loadControl)
        .setSeekForwardIncrementMs(10_000)
        .setSeekBackIncrementMs(10_000)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            /* handleAudioFocus = */ true
        )
        .build()

    /**
     * Resets playback state without releasing underlying codecs or audio pipelines.
     * Call this when navigating back from PlayerScreen.
     */
    fun reset() {
        try {
            player.stop()
            player.clearMediaItems()
        } catch (_: Exception) {}
    }

    /**
     * Build an optimized MediaSource based on playback configuration.
     */
    fun buildMediaSource(
        context: Context,
        v: InvidiousVideo,
        cfg: PlayerViewModel.PlaybackConfig,
        bestV: InvidiousAdaptiveFormat?,
        bestA: InvidiousAdaptiveFormat?,
        bestMime: (String) -> String
    ): MediaSource? {
        return when (cfg) {
            is PlayerViewModel.PlaybackConfig.Dash -> {
                val item = MediaItem.fromUri(cfg.url)
                DashMediaSource.Factory(dataSourceFactory).createMediaSource(item)
            }
            is PlayerViewModel.PlaybackConfig.Hls -> {
                val item = MediaItem.fromUri(cfg.url)
                HlsMediaSource.Factory(dataSourceFactory).createMediaSource(item)
            }
            is PlayerViewModel.PlaybackConfig.Progressive -> {
                val mime = bestMime(cfg.url)
                val item = MediaItem.Builder().setUri(cfg.url).setMimeType(mime).build()
                ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(item)
            }
            is PlayerViewModel.PlaybackConfig.Merged -> {
                val mpdFile = if (bestV != null && bestA != null) {
                    MpdGenerator.generate(context, v.videoId, bestV, bestA, v.lengthSeconds)
                } else null
                if (mpdFile != null && mpdFile.exists() && mpdFile.length() > 100) {
                    DashMediaSource.Factory(dataSourceFactory)
                        .createMediaSource(MediaItem.fromUri(Uri.fromFile(mpdFile)))
                } else {
                    val videoMime = bestV?.type?.substringBefore(";") ?: "video/mp4"
                    val audioMime = bestA?.type?.substringBefore(";") ?: "audio/mp4"
                    val videoItem = MediaItem.Builder().setUri(cfg.videoUrl).setMimeType(videoMime).build()
                    val audioItem = MediaItem.Builder().setUri(cfg.audioUrl).setMimeType(audioMime).build()
                    val videoSource = ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(videoItem)
                    val audioSource = ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(audioItem)
                    MergingMediaSource(videoSource, audioSource)
                }
            }
            is PlayerViewModel.PlaybackConfig.Unavailable -> null
        }
    }

    /**
     * Call only on application shutdown or fatal memory condition.
     */
    fun release() {
        try {
            player.release()
            instance = null
        } catch (_: Exception) {}
    }
}
