package com.kvtube.tv.player

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.api.MpdGenerator
import com.kvtube.tv.data.model.InvidiousAdaptiveFormat
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.viewmodel.PlayerViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.util.Locale

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

    val okHttpFactory: OkHttpDataSource.Factory = OkHttpDataSource.Factory(ApiClient.okHttp)
        .setUserAgent("com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip")
        .setDefaultRequestProperties(
            mapOf(
                "Referer" to "https://www.youtube.com/",
                "Origin" to "https://www.youtube.com"
            )
        )

    /**
     * Resolves gateway-relative segment URLs (`/companion/...`) onto `/api/invidious`
     * directly over OkHttp (bypassing disk CacheDataSource so ephemeral YouTube
     * chunk retries never collide on subrange offsets).
     */
    private val gatewayAwareUpstream = ResolvingDataSource.Factory(okHttpFactory) { dataSpec ->
        val host = if (ApiClient.isGatewayMode) {
            runCatching { java.net.URI(ApiClient.baseUrl).host }.getOrNull()
        } else null
        val original = dataSpec.uri.toString()
        val rewritten = TvStreamUrls.rewriteGatewayUrl(original, host)
        if (rewritten == original) dataSpec else dataSpec.withUri(Uri.parse(rewritten))
    }

    val dataSourceFactory: DefaultDataSource.Factory =
        DefaultDataSource.Factory(context.applicationContext, gatewayAwareUpstream)

    // ---- adaptive bitrate (ABR) ---------------------------------------------

    private val prefs = context.applicationContext.getSharedPreferences("kv_tv_playback", Context.MODE_PRIVATE)
    private var lastBandwidthPersistAt = 0L

    /** Meter seeded with the last measured throughput so the first segments
     *  already fit the connection instead of crawling up from the lowest rung. */
    private val bandwidthMeter: DefaultBandwidthMeter = DefaultBandwidthMeter.Builder(context.applicationContext)
        .apply {
            val saved = prefs.getLong("bw_bps", 0L)
            // No history: start on a modest 4 Mbps rung (fast first frame), ramp from there.
            setInitialBitrateEstimate(if (saved >= 500_000L) saved.coerceAtMost(120_000_000L) else 4_000_000L)
        }
        .build()

    private val hardwareAv1: Boolean = runCatching {
        MediaCodecUtil.getDecoderInfos(MimeTypes.VIDEO_AV1, false, false).any { it.hardwareAccelerated }
    }.getOrDefault(false)

    private val _bandwidthMbps = MutableStateFlow(0f)
    val bandwidthMbps: StateFlow<Float> = _bandwidthMbps.asStateFlow()

    private val _activeHeight = MutableStateFlow(0)
    val activeHeight: StateFlow<Int> = _activeHeight.asStateFlow()

    private val _audioPreference = MutableStateFlow(
        AudioLanguagePreference.fromKey(prefs.getString("audio_pref", AudioLanguagePreference.ORIGINAL.key))
    )
    val audioPreference: StateFlow<AudioLanguagePreference> = _audioPreference.asStateFlow()

    private val _audioTracks = MutableStateFlow<List<TvAudioTrackOption>>(emptyList())
    val audioTracks: StateFlow<List<TvAudioTrackOption>> = _audioTracks.asStateFlow()

    private val _activeAudioTrack = MutableStateFlow<TvAudioTrackOption?>(null)
    val activeAudioTrack: StateFlow<TvAudioTrackOption?> = _activeAudioTrack.asStateFlow()

    @Volatile private var manualAudioOverrideId: String? = null
    @Volatile private var autoAppliedTrackSignature: String? = null

    @Volatile var isFastDashActive: Boolean = false
        private set

    /** 0 = Auto (ABR over the whole ladder); otherwise the max height to allow. */
    @Volatile var maxHeightCap: Int = 0
        private set

    /**
     * Applies a resolution cap by changing track-selection constraints only —
     * the source, decoder and surface stay alive, so quality changes are
     * seamless (no re-buffer, no black frame).
     */
    fun setMaxHeight(cap: Int) {
        maxHeightCap = cap
        trackSelector.setParameters(
            trackSelector.buildUponParameters()
                .clearVideoSizeConstraints()
                .setExceedVideoConstraintsIfNecessary(true)
                .apply { if (cap > 0) setMaxVideoSize(Int.MAX_VALUE, cap) }
        )
    }

    private fun applyAudioTrackSelectorDefaults(pref: AudioLanguagePreference) {
        val builder = trackSelector.buildUponParameters()
            .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
        when (pref) {
            AudioLanguagePreference.ORIGINAL -> {
                builder.setPreferredAudioLanguages()
                builder.setPreferredAudioRoleFlags(C.ROLE_FLAG_MAIN)
            }
            AudioLanguagePreference.VIETNAMESE -> {
                builder.setPreferredAudioLanguages("vi")
                builder.setPreferredAudioRoleFlags(C.ROLE_FLAG_MAIN)
            }
            AudioLanguagePreference.ENGLISH -> {
                builder.setPreferredAudioLanguages("en")
                builder.setPreferredAudioRoleFlags(0)
            }
            AudioLanguagePreference.DEVICE -> {
                builder.setPreferredAudioLanguages()
                builder.setPreferredAudioRoleFlags(0)
            }
        }
        trackSelector.setParameters(builder)
    }

    private fun clearAudioTrackStateForNewMedia() {
        manualAudioOverrideId = null
        autoAppliedTrackSignature = null
        _audioTracks.value = emptyList()
        _activeAudioTrack.value = null
        applyAudioTrackSelectorDefaults(_audioPreference.value)
    }

    fun prepareForNewVideo() {
        clearAudioTrackStateForNewMedia()
    }

    fun selectAudioTrack(option: TvAudioTrackOption) {
        val currentTracks = runCatching { player.currentTracks }.getOrNull() ?: return
        val group = currentTracks.groups.getOrNull(option.groupIndex) ?: return
        if (group.type != C.TRACK_TYPE_AUDIO || option.trackIndex !in 0 until group.length) return

        manualAudioOverrideId = option.id
        trackSelector.setParameters(
            trackSelector.buildUponParameters()
                .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
                .setOverrideForType(
                    TrackSelectionOverride(group.mediaTrackGroup, listOf(option.trackIndex))
                )
        )
        val updated = _audioTracks.value.map { it.copy(isSelected = it.id == option.id) }
        _audioTracks.value = updated
        _activeAudioTrack.value = updated.firstOrNull { it.isSelected } ?: option.copy(isSelected = true)
    }

    fun setAudioPreference(pref: AudioLanguagePreference) {
        prefs.edit().putString("audio_pref", pref.key).apply()
        _audioPreference.value = pref
        manualAudioOverrideId = null
        autoAppliedTrackSignature = null
        applyAudioTrackSelectorDefaults(pref)
        runCatching { player.currentTracks }.getOrNull()?.let { handleTracksChanged(it) }
    }

    private fun handleTracksChanged(tracks: Tracks) {
        val rawOptions = mutableListOf<TvAudioTrackOption>()
        for (groupIdx in tracks.groups.indices) {
            val group = tracks.groups[groupIdx]
            if (group.type != C.TRACK_TYPE_AUDIO) continue
            for (trackIdx in 0 until group.length) {
                if (!group.isTrackSupported(trackIdx)) continue
                val fmt = group.getTrackFormat(trackIdx)
                rawOptions.add(
                    TvAudioTracks.classifyTrack(
                        groupIndex = groupIdx,
                        trackIndex = trackIdx,
                        formatId = fmt.id,
                        language = fmt.language,
                        rawLabel = fmt.label,
                        roleFlags = fmt.roleFlags,
                        bitrate = fmt.bitrate,
                        isSelected = group.isTrackSelected(trackIdx),
                    )
                )
            }
        }

        val sortedOptions = TvAudioTracks.sortForDisplay(rawOptions)
        _audioTracks.value = sortedOptions
        _activeAudioTrack.value = sortedOptions.firstOrNull { it.isSelected } ?: sortedOptions.firstOrNull()

        if (manualAudioOverrideId == null && sortedOptions.size > 1) {
            val signature = sortedOptions.joinToString("|") {
                "${it.groupIndex}:${it.trackIndex}:${it.language}:${it.roleFlags}:${it.formatId}"
            }
            if (signature != autoAppliedTrackSignature) {
                autoAppliedTrackSignature = signature
                val desiredIdx = TvAudioTracks.pickPreferredIndex(
                    tracks = sortedOptions,
                    pref = _audioPreference.value,
                    deviceLanguage = Locale.getDefault().language,
                )
                val desired = sortedOptions.getOrNull(desiredIdx)
                if (desired != null && !desired.isSelected) {
                    val targetGroup = tracks.groups.getOrNull(desired.groupIndex)
                    if (targetGroup != null && targetGroup.type == C.TRACK_TYPE_AUDIO && desired.trackIndex in 0 until targetGroup.length) {
                        trackSelector.setParameters(
                            trackSelector.buildUponParameters()
                                .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
                                .setOverrideForType(
                                    TrackSelectionOverride(targetGroup.mediaTrackGroup, listOf(desired.trackIndex))
                                )
                        )
                        Log.i(
                            "TvPlaybackManager",
                            "Auto-selected audio track: ${desired.displayName} (pref=${_audioPreference.value.key})"
                        )
                    }
                }
            }
        }
    }

    val trackSelector: DefaultTrackSelector = DefaultTrackSelector(
        context,
        AdaptiveTrackSelection.Factory(
            /* minDurationForQualityIncreaseMs = */ 3_000,
            /* maxDurationForQualityDecreaseMs = */ 12_000,
            /* minDurationToRetainAfterDiscardMs = */ 12_000,
            /* bandwidthFraction = */ 0.85f
        )
    ).apply {
        setParameters(
            buildUponParameters()
                // Adaptive (not "force highest"): resolution follows measured
                // bandwidth and never exceeds the TV's own panel size.
                .setForceHighestSupportedBitrate(false)
                .setAllowVideoMixedMimeTypeAdaptiveness(false)
                .setExceedVideoConstraintsIfNecessary(true)
                // AV1 only with a hardware decoder, otherwise universally supported H.264.
                .setPreferredVideoMimeTypes(
                    *(if (hardwareAv1) arrayOf(MimeTypes.VIDEO_AV1, MimeTypes.VIDEO_H264)
                    else arrayOf(MimeTypes.VIDEO_H264))
                )
        )
    }

    init {
        applyAudioTrackSelectorDefaults(_audioPreference.value)
    }

    /**
     * Tuned buffer thresholds:
     * - bufferForPlaybackMs = 250: Starts rendering as soon as 0.25s of chunks are loaded (sub-second start).
     * - bufferForPlaybackAfterRebufferMs = 1000: Recovers quickly if network dips.
     * - minBufferMs = 10,000 / maxBufferMs = 40,000: Ample headroom without hogging TV RAM.
     */
    val loadControl: DefaultLoadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            /* minBufferMs = */ 10_000,
            /* maxBufferMs = */ 40_000,
            /* bufferForPlaybackMs = */ 250,
            /* bufferForPlaybackAfterRebufferMs = */ 1000
        )
        .setBackBuffer(20_000, true)
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()

    val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext)
        .setBandwidthMeter(bandwidthMeter)
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
        .also { exo ->
            exo.addListener(object : Player.Listener {
                override fun onVideoSizeChanged(videoSize: VideoSize) {
                    if (videoSize.height > 0) _activeHeight.value = videoSize.height
                }

                override fun onTracksChanged(tracks: Tracks) {
                    handleTracksChanged(tracks)
                }
            })
            exo.addAnalyticsListener(object : AnalyticsListener {
                override fun onBandwidthEstimate(
                    eventTime: AnalyticsListener.EventTime,
                    totalLoadTimeMs: Int,
                    totalBytesLoaded: Long,
                    bitrateEstimate: Long
                ) {
                    if (bitrateEstimate <= 0) return
                    _bandwidthMbps.value = bitrateEstimate / 1_000_000f
                    val now = android.os.SystemClock.elapsedRealtime()
                    if (now - lastBandwidthPersistAt >= 4_000L) {
                        lastBandwidthPersistAt = now
                        prefs.edit().putLong("bw_bps", bitrateEstimate).apply()
                    }
                }
            })
        }

    /**
     * Starts adaptive DASH straight from the manifest at t=0 — no waiting for
     * the `/videos/{id}` metadata round-trip. Returns false if it can't start.
     */
    fun playDashFast(manifestUrl: String): Boolean {
        if (manifestUrl.isBlank()) return false
        return try {
            exoStopQuiet()
            clearAudioTrackStateForNewMedia()
            val item = MediaItem.Builder()
                .setUri(manifestUrl)
                .setMimeType(MimeTypes.APPLICATION_MPD)
                .build()
            val source = DashMediaSource.Factory(dataSourceFactory).createMediaSource(item)
            _activeHeight.value = 0
            isFastDashActive = true
            player.setMediaSource(source)
            player.prepare()
            player.playWhenReady = true
            true
        } catch (_: Exception) {
            isFastDashActive = false
            false
        }
    }

    fun markFastDashEnded() { isFastDashActive = false }

    private fun exoStopQuiet() {
        try { player.stop(); player.clearMediaItems() } catch (_: Exception) {}
    }

    /**
     * Resets playback state without releasing underlying codecs or audio pipelines.
     * Call this when navigating back from PlayerScreen.
     */
    fun reset() {
        isFastDashActive = false
        clearAudioTrackStateForNewMedia()
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
                    val distinctAudios = TvAudioTracks.distinctAdaptiveAudios(v.adaptiveFormats)
                    MpdGenerator.generate(
                        context = context,
                        videoId = v.videoId,
                        video = bestV,
                        audio = bestA,
                        durationSeconds = v.lengthSeconds,
                        extraAudioFormats = distinctAudios,
                    )
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
