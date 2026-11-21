package com.kvtube.android.player

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.VideoSize
import androidx.media3.datasource.okhttp.OkHttpDataSource
import com.kvtube.android.data.net.KvHttp
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.dash.DefaultDashChunkSource
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import android.net.Uri
import com.kvtube.android.data.model.QualityTier
import dagger.hilt.android.qualifiers.ApplicationContext
import com.kvtube.android.data.local.logToFile
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

        private const val PREFS = "kv_playback"
        private const val PREF_BANDWIDTH_BPS = "bw_bps"
        private const val BANDWIDTH_PERSIST_INTERVAL_MS = 4_000L

        /** Gateway path prefix the KV-Tube web app uses to proxy Invidious/Companion. */
        private const val GATEWAY_PREFIX = "/api/invidious"

        /**
         * Rewrites URLs the DASH manifest resolves against the gateway host
         * (`/companion/videoplayback?...`, `/videoplayback?...`) so they go
         * through the same-origin `/api/invidious` proxy — same logic as the
         * web player's Shaka request filter. Pure string function so it is
         * unit-testable without Android classes; the query is untouched.
         */
        fun rewriteGatewayUrl(url: String, gatewayHost: String?): String {
            if (gatewayHost.isNullOrBlank()) return url
            val schemeEnd = url.indexOf("://")
            if (schemeEnd < 0) return url
            val authorityStart = schemeEnd + 3
            val pathStart = url.indexOf('/', authorityStart)
            if (pathStart < 0) return url
            val authority = url.substring(authorityStart, pathStart)
            val host = authority.substringAfterLast('@').substringBefore(':')
            if (!host.equals(gatewayHost, ignoreCase = true)) return url
            val path = url.substring(pathStart)
            if (path.startsWith(GATEWAY_PREFIX)) return url
            val proxied = path.startsWith("/companion/") ||
                path.startsWith("/videoplayback") ||
                path.startsWith("/latest_version") ||
                path.startsWith("/api/")
            if (!proxied) return url
            return url.substring(0, pathStart) + GATEWAY_PREFIX + path
        }
    }

    // ---- adaptive streaming (ABR) --------------------------------------------

    private val prefs by lazy { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    private var lastBandwidthPersistAt = 0L

    /** Bandwidth meter seeded with the last measured throughput so the very
     *  first segments already pick a fitting resolution instead of starting
     *  at the bottom of the ladder and slowly climbing. */
    private val bandwidthMeter: DefaultBandwidthMeter by lazy {
        val builder = DefaultBandwidthMeter.Builder(context)
        val saved = prefs.getLong(PREF_BANDWIDTH_BPS, 0L)
        // No history yet: assume a modest 3 Mbps so the very first session starts
        // on a small rung (fast first frame) and ramps up as real throughput is
        // measured, instead of opening a 1080p/AV1 segment on an unknown link.
        builder.setInitialBitrateEstimate(
            if (saved >= 500_000L) saved.coerceAtMost(80_000_000L) else 3_000_000L
        )
        builder.build()
    }

    private val trackSelector: DefaultTrackSelector by lazy {
        DefaultTrackSelector(
            context,
            AdaptiveTrackSelection.Factory(
                /* minDurationForQualityIncreaseMs = */ 3_000,
                /* maxDurationForQualityDecreaseMs = */ 12_000,
                /* minDurationToRetainAfterDiscardMs = */ 12_000,
                /* bandwidthFraction = */ 0.85f
            )
        ).also { applyTier(it, QualityTier.AUTO) }
    }

    private val hardwareAv1: Boolean by lazy {
        runCatching {
            MediaCodecUtil.getDecoderInfos(MimeTypes.VIDEO_AV1, false, false)
                .any { it.hardwareAccelerated }
        }.getOrDefault(false)
    }

    private val _activeHeight = MutableStateFlow(0)
    /** Height (px) of the video resolution currently being decoded (0 = unknown). */
    val activeHeight: StateFlow<Int> = _activeHeight.asStateFlow()

    private val _bandwidthMbps = MutableStateFlow(0f)
    /** Latest measured throughput estimate in Mbps (0 = unknown). */
    val bandwidthMbps: StateFlow<Float> = _bandwidthMbps.asStateFlow()

    @Volatile var isDashActive: Boolean = false
        private set
    private var currentTier: QualityTier = QualityTier.AUTO

    /**
     * Applies [tier] by changing the track-selection constraints only — the
     * media source, codec and surface stay alive, so switching resolution
     * (manual or automatic) never tears down playback or blanks the video.
     */
    fun setQualityTier(tier: QualityTier) {
        currentTier = tier
        applyTier(trackSelector, tier)
    }

    private fun applyTier(selector: DefaultTrackSelector, tier: QualityTier) {
        val b = selector.buildUponParameters()
            .setAllowVideoMixedMimeTypeAdaptiveness(false)
            .setExceedVideoConstraintsIfNecessary(true)
            .clearVideoSizeConstraints()
            .setForceHighestSupportedBitrate(false)
        when (tier) {
            QualityTier.AUTO -> b.setPreferredVideoMimeTypes(*preferredMimes(allowAv1 = true))
            QualityTier.MAXIMUM -> b.setPreferredVideoMimeTypes(*preferredMimes(allowAv1 = true))
                .setForceHighestSupportedBitrate(true)
            QualityTier.HIGH -> b.setMaxVideoSize(Int.MAX_VALUE, 1080)
                .setPreferredVideoMimeTypes(MimeTypes.VIDEO_H264)
            QualityTier.MID -> b.setMaxVideoSize(Int.MAX_VALUE, 720)
                .setPreferredVideoMimeTypes(MimeTypes.VIDEO_H264)
            QualityTier.LOW -> b.setMaxVideoSize(Int.MAX_VALUE, 360)
                .setPreferredVideoMimeTypes(MimeTypes.VIDEO_H264)
        }
        selector.setParameters(b)
    }

    /** AV1 gives 1440p/4K but only decodes smoothly with a hardware decoder;
     *  everything else stays on universally supported H.264. */
    private fun preferredMimes(allowAv1: Boolean): Array<String> =
        if (allowAv1 && hardwareAv1) arrayOf(MimeTypes.VIDEO_AV1, MimeTypes.VIDEO_H264)
        else arrayOf(MimeTypes.VIDEO_H264)

    private val httpFactory = OkHttpDataSource.Factory(KvHttp.client)
        .setUserAgent(USER_AGENT)

    val player: ExoPlayer by lazy {
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(
                androidx.media3.exoplayer.source.DefaultMediaSourceFactory(httpFactory)
            )
            .setBandwidthMeter(bandwidthMeter)
            .setTrackSelector(trackSelector)
            .setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                        /* minBufferMs = */ 10_000,
                        /* maxBufferMs = */ 50_000,
                        // Start as soon as ~1.2s is buffered: with the
                        // prefetched init/index/first segment that is
                        // near-instant first frame.
                        /* bufferForPlaybackMs = */ 1_200,
                        /* bufferForPlaybackAfterRebufferMs = */ 3_000
                    )
                    .setPrioritizeTimeOverSizeThresholds(true)
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
                        logToFile(
                            TAG,
                            "player error ${error.errorCodeName} url=${currentMediaItem?.localConfiguration?.uri?.host}",
                            error
                        )
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        if (isPlaying) ensureMediaServiceStarted()
                    }

                    override fun onVideoSizeChanged(videoSize: VideoSize) {
                        if (videoSize.height > 0) _activeHeight.value = videoSize.height
                    }

                    override fun onRenderedFirstFrame() {
                        val ms = android.os.SystemClock.elapsedRealtime() - lastSwitchAt
                        Log.w(TAG, "first frame ${ms}ms after source set (h=${_activeHeight.value})")
                        logToFile(TAG, "first frame ${ms}ms after source set (h=${_activeHeight.value})")
                    }
                })
                addAnalyticsListener(object : AnalyticsListener {
                    override fun onBandwidthEstimate(
                        eventTime: AnalyticsListener.EventTime,
                        totalLoadTimeMs: Int,
                        totalBytesLoaded: Long,
                        bitrateEstimate: Long
                    ) {
                        if (bitrateEstimate <= 0) return
                        _bandwidthMbps.value = bitrateEstimate / 1_000_000f
                        val now = android.os.SystemClock.elapsedRealtime()
                        if (now - lastBandwidthPersistAt >= BANDWIDTH_PERSIST_INTERVAL_MS) {
                            lastBandwidthPersistAt = now
                            prefs.edit().putLong(PREF_BANDWIDTH_BPS, bitrateEstimate).apply()
                        }
                    }
                })
            }
    }

    private val _nowPlaying = MutableStateFlow<NowPlaying?>(null)
    val nowPlaying: StateFlow<NowPlaying?> = _nowPlaying.asStateFlow()

    private var loadedKey: String? = null
    private var lastSwitchAt: Long = 0L
    private var mediaServiceRequested = false

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
            // opens so the media card machinery is alive before playback
            // events fire. Safe because PlaybackService.onCreate() calls
            // startForeground() synchronously — it never depends on a later
            // player event, so Android's start-foreground deadline can no
            // longer expire (ForegroundServiceDidNotStartInTimeException).
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

    /**
     * Starts adaptive DASH playback from the server's manifest. One request
     * path, zero URL pre-resolution: the player begins loading init/index
     * segments the moment the manifest arrives, and ABR picks the resolution
     * from measured bandwidth (seeded from the last session).
     *
     * @param gatewayHost host of the KV-Tube gateway when the manifest is
     *        served through it (enables `/companion/...` → `/api/invidious/...`
     *        rewriting); null for a raw Invidious server.
     */
    fun playDash(videoId: String, manifestUrl: String, gatewayHost: String?) {
        if (manifestUrl.isBlank()) return
        try {
            val key = "$videoId|$manifestUrl"
            if (key == loadedKey && player.mediaItemCount > 0) {
                player.playWhenReady = true
                return
            }
            val resolvingFactory = ResolvingDataSource.Factory(httpFactory) { dataSpec ->
                val original = dataSpec.uri.toString()
                val rewritten = rewriteGatewayUrl(original, gatewayHost)
                if (rewritten == original) dataSpec else dataSpec.withUri(Uri.parse(rewritten))
            }
            val meta = _nowPlaying.value
            val item = MediaItem.Builder()
                .setUri(Uri.parse(manifestUrl))
                .setMimeType(MimeTypes.APPLICATION_MPD)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(meta?.title.orEmpty())
                        .setArtist(meta?.channelTitle.orEmpty())
                        .setArtworkUri(meta?.thumbnail?.takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
                        .build()
                )
                .build()
            val source = DashMediaSource.Factory(
                DefaultDashChunkSource.Factory(resolvingFactory),
                resolvingFactory
            ).createMediaSource(item)

            loadedKey = key
            isDashActive = true
            _activeHeight.value = 0
            lastSwitchAt = android.os.SystemClock.elapsedRealtime()
            logToFile(TAG, "playDash($videoId) manifest host=${Uri.parse(manifestUrl).host} tier=$currentTier")
            player.setMediaSource(source)
            player.prepare()
            player.playWhenReady = true
        } catch (t: Throwable) {
            Log.e(TAG, "playDash($videoId) failed", t)
            isDashActive = false
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
            isDashActive = false
            lastSwitchAt = now
            logToFile(TAG, "play($videoId) stream host=${Uri.parse(videoUrl).host} audio=${audioUrl?.let { Uri.parse(it).host }}")
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
            // No explicit service start here: setMetadata() already brought the
            // service up at page open, and onIsPlayingChanged covers recovery
            // if the system killed it in between.
        } catch (t: Throwable) {
            // A failed source switch must degrade gracefully (the player error
            // listener / UI retry path handles recovery), never crash.
            Log.e(TAG, "play($videoId) failed", t)
        }
    }

    private fun ensureMediaServiceStarted() {
        if (mediaServiceRequested) return
        mediaServiceRequested = true
        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, PlaybackService::class.java)
            )
        } catch (t: Throwable) {
            mediaServiceRequested = false
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
        isDashActive = false
        _activeHeight.value = 0
        lastSwitchAt = 0L
        mediaServiceRequested = false
        _nowPlaying.value = null
    }
}
