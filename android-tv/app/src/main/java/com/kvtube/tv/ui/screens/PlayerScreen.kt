package com.kvtube.tv.ui.screens

import android.view.KeyEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import android.net.Uri
import androidx.media3.common.Tracks
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.PlayerView
import com.kvtube.tv.data.api.MpdGenerator
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Glow
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.kvtube.tv.viewmodel.PlayerViewModel
import kotlinx.coroutines.delay

@OptIn(UnstableApi::class)
@ExperimentalTvMaterial3Api
@Composable
fun PlayerScreen(
    videoId: String,
    onBack: () -> Unit = {},
    vm: PlayerViewModel = viewModel(),
) {
    val ctx = LocalContext.current
    val state by vm.state.collectAsState()

    // Force DASH 4K selection even on 1080p display (emulator) — user wants 4K for all
    val trackSelector = remember {
        DefaultTrackSelector(ctx).apply {
            setParameters(
                buildUponParameters()
                    .setMaxVideoSize(3840, 2160)
                    .setMaxVideoBitrate(Int.MAX_VALUE)
                    .setForceHighestSupportedBitrate(true)
            )
        }
    }
    val exo = remember {
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(60_000, 120_000, 2500, 5000)
            .setBackBuffer(30_000, true)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()
        ExoPlayer.Builder(ctx)
            .setTrackSelector(trackSelector)
            .setLoadControl(loadControl)
            .setSeekForwardIncrementMs(10000)
            .setSeekBackIncrementMs(10000)
            .build()
    }

    var isPlaying by remember { mutableStateOf(false) }
    var currentPosition by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var showControls by remember { mutableStateOf(true) }
    var lastInteraction by remember { mutableLongStateOf(System.currentTimeMillis()) }

    val playButtonFocusRequester = remember { FocusRequester() }
    val backButtonFocusRequester = remember { FocusRequester() }
    val seekBarFocusRequester = remember { FocusRequester() }
    val rootFocusRequester = remember { FocusRequester() }

    BackHandler(enabled = true) {
        if (showControls) {
            showControls = false
        } else {
            onBack()
        }
    }

    LaunchedEffect(videoId) { vm.load(videoId) }

    var playerError by remember { mutableStateOf<String?>(null) }
    var qualityBadge by remember { mutableStateOf<String?>(null) }
    var currentCfg by remember { mutableStateOf<PlayerViewModel.PlaybackConfig?>(null) }
    var fallbackIndex by remember { mutableStateOf(0) }
    var fallbackList by remember { mutableStateOf<List<PlayerViewModel.PlaybackConfig>>(emptyList()) }

    fun playWithConfig(v: com.kvtube.tv.data.model.InvidiousVideo, cfg: PlayerViewModel.PlaybackConfig) {
        currentCfg = cfg
        playerError = null
        qualityBadge = vm.qualityLabel(v)
        try {
            exo.stop()
            exo.clearMediaItems()
            // Use YouTube UA for Invidious DASH/HLS as well (fixes 403 where googlevideo expects ANDROID/VISIONOS UA)
            val httpFactory = DefaultHttpDataSource.Factory()
                .setUserAgent("com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip")
                .setConnectTimeoutMs(30_000)
                .setReadTimeoutMs(60_000)
                .setAllowCrossProtocolRedirects(true)
                .setDefaultRequestProperties(mapOf("Referer" to "https://www.youtube.com/", "Origin" to "https://www.youtube.com"))
            val dataSourceFactory = DefaultDataSource.Factory(ctx, httpFactory)
            when (cfg) {
                is PlayerViewModel.PlaybackConfig.Dash -> {
                    val item = MediaItem.fromUri(cfg.url)
                    val dashSource = DashMediaSource.Factory(dataSourceFactory).createMediaSource(item)
                    exo.setMediaSource(dashSource)
                }
                is PlayerViewModel.PlaybackConfig.Hls -> {
                    val item = MediaItem.fromUri(cfg.url)
                    val hlsSource = HlsMediaSource.Factory(dataSourceFactory).createMediaSource(item)
                    exo.setMediaSource(hlsSource)
                }
                is PlayerViewModel.PlaybackConfig.Progressive -> {
                    val mime = vm.bestMime(cfg.url)
                    val item = MediaItem.Builder().setUri(cfg.url).setMimeType(mime).build()
                    exo.setMediaItem(item)
                }
                is PlayerViewModel.PlaybackConfig.Merged -> {
                    // High-res DASH 4K via MpdGenerator — add Referer/Origin to fix 403 on googlevideo segments
                    val bestV = vm.bestAdaptiveVideo(v)
                    val bestA = vm.bestAdaptiveAudio(v)
                    val httpFactory = DefaultHttpDataSource.Factory()
                        .setUserAgent("com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip")
                        .setAllowCrossProtocolRedirects(true)
                        .setConnectTimeoutMs(30_000)
                        .setReadTimeoutMs(60_000)
                        .setDefaultRequestProperties(mapOf("Referer" to "https://www.youtube.com/", "Origin" to "https://www.youtube.com"))
                    val dataSourceFactory = DefaultDataSource.Factory(ctx, httpFactory)
                    val mpdFile = if (bestV != null && bestA != null) {
                        MpdGenerator.generate(ctx, v.videoId, bestV, bestA, v.lengthSeconds)
                    } else null
                    if (mpdFile != null && mpdFile.exists() && mpdFile.length() > 100) {
                        val dashSource = DashMediaSource.Factory(dataSourceFactory)
                            .createMediaSource(MediaItem.fromUri(Uri.fromFile(mpdFile)))
                        exo.setMediaSource(dashSource)
                    } else {
                        val videoMime = bestV?.type?.substringBefore(";") ?: "video/mp4"
                        val audioMime = bestA?.type?.substringBefore(";") ?: "audio/mp4"
                        val videoItem = MediaItem.Builder().setUri(cfg.videoUrl).setMimeType(videoMime).build()
                        val audioItem = MediaItem.Builder().setUri(cfg.audioUrl).setMimeType(audioMime).build()
                        val ytDataSource = DefaultDataSource.Factory(ctx, httpFactory)
                        val videoSource = ProgressiveMediaSource.Factory(ytDataSource).createMediaSource(videoItem)
                        val audioSource = ProgressiveMediaSource.Factory(ytDataSource).createMediaSource(audioItem)
                        exo.setMediaSource(MergingMediaSource(videoSource, audioSource))
                    }
                }
                is PlayerViewModel.PlaybackConfig.Unavailable -> {
                    playerError = "No playable stream (Invidious only). Try another video."
                    return
                }
            }
            exo.prepare()
            exo.playWhenReady = true
        } catch (e: Exception) {
            playerError = "Failed to start playback: ${e.message}"
        }
    }

    LaunchedEffect(state.video) {
        val v = state.video ?: return@LaunchedEffect
        val cfg = vm.getPlaybackConfig(v)
        if (cfg is PlayerViewModel.PlaybackConfig.Unavailable) {
            playerError = "No playable high-res stream found (Invidious only). Try another video."
            return@LaunchedEffect
        }
        fallbackList = vm.getFallbackConfigs(v, cfg)
        fallbackIndex = 0
        playWithConfig(v, cfg)
    }

    DisposableEffect(exo) {
        val listener = object : Player.Listener {
            override fun onTracksChanged(tracks: Tracks) {
                // Update badge to actual selected video height (ensures DASH 4K is truly playing, not just labeled)
                try {
                    for (group in tracks.groups) {
                        if (group.type == androidx.media3.common.C.TRACK_TYPE_VIDEO) {
                            for (i in 0 until group.length) {
                                if (group.isTrackSelected(i)) {
                                    val fmt = group.getTrackFormat(i)
                                    val h = fmt.height
                                    if (h >= 2160) qualityBadge = "DASH 4K"
                                    else if (h >= 1440) qualityBadge = "DASH 1440p"
                                    else if (h >= 1080) qualityBadge = "DASH 1080p"
                                    else if (h > 0) qualityBadge = "DASH ${h}p"
                                    android.util.Log.d("PlayerScreen", "Selected video track: ${fmt.width}x${h} ${fmt.codecs} ${fmt.bitrate}")
                                }
                            }
                        }
                    }
                } catch (_: Exception) {}
            }
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                android.util.Log.e("PlayerScreen", "ExoPlayer error: ${error.message} code=${error.errorCodeName} cause=${error.cause?.message}", error)
                val v = state.video
                // Try next fallback config (lower resolution, Invidious only, no WebView)
                if (v != null && fallbackIndex < fallbackList.size) {
                    val next = fallbackList[fallbackIndex]
                    fallbackIndex++
                    android.util.Log.w("PlayerScreen", "Trying fallback $fallbackIndex/${fallbackList.size}: $next")
                    try {
                        playWithConfig(v, next)
                        return
                    } catch (_: Exception) {}
                }
                playerError = error.message ?: "Playback failed (${error.errorCodeName})"
            }
        }
        exo.addListener(listener)
        onDispose { exo.removeListener(listener) }
    }

    LaunchedEffect(exo) {
        var lastSaved = 0L
        while (true) {
            currentPosition = exo.currentPosition.coerceAtLeast(0L)
            duration = exo.duration.coerceAtLeast(0L)
            isPlaying = exo.isPlaying
            val now = System.currentTimeMillis()
            if (now - lastSaved >= 5000L && currentPosition > 0L) {
                vm.updateProgress(currentPosition, duration)
                lastSaved = now
            }
            delay(500)
        }
    }

    LaunchedEffect(showControls, lastInteraction) {
        if (showControls) {
            delay(5000)
            showControls = false
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            try {
                val pos = exo.currentPosition.coerceAtLeast(0L)
                val dur = exo.duration.coerceAtLeast(0L)
                if (pos > 0L) {
                    vm.updateProgress(pos, dur)
                }
            } catch (_: Exception) {}
            exo.release()
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(rootFocusRequester)
            .focusable(enabled = !showControls)
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    lastInteraction = System.currentTimeMillis()
                    val keyCode = keyEvent.nativeKeyEvent.keyCode
                    if (!showControls) {
                        val isNavigationKey = when (keyCode) {
                            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
                            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
                            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
                            KeyEvent.KEYCODE_SPACE -> true
                            else -> false
                        }
                        if (isNavigationKey) {
                            showControls = true
                            return@onKeyEvent true
                        }
                    }
                }
                false
            }
    ) {
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Loading player…", color = Color.White) }
            state.error != null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(state.error ?: "Error", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleSmall)
                    Text("Invidious backend may be temporarily unavailable. Try another video or retry.", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                    androidx.tv.material3.Button(onClick = { vm.load(videoId) }) { Text("Retry") }
                }
            }
            playerError != null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(playerError ?: "Playback error", color = Color(0xFFFF8A80), style = MaterialTheme.typography.titleSmall)
                    Text("Invidious failed (no WebView). Fallback tried ${fallbackIndex}/${fallbackList.size}. Try another video.", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                    androidx.tv.material3.Button(onClick = { state.video?.let { playWithConfig(it, vm.getPlaybackConfig(it)) } ?: vm.load(videoId) }) { Text("Retry") }
                }
            }
            state.video != null -> {
                AndroidView(
                    factory = { c ->
                        PlayerView(c).apply {
                            player = exo
                            useController = false
                            isFocusable = false
                            isFocusableInTouchMode = false
                            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )
                AnimatedVisibility(
                    visible = showControls,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.fillMaxSize()
                ) {
                    LaunchedEffect(Unit) {
                        try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                    }
                    PlayerControlsOverlay(
                        videoTitle = state.video?.title ?: "",
                        qualityBadge = qualityBadge,
                        isPlaying = isPlaying,
                        currentPosition = currentPosition,
                        duration = duration,
                        onPlayPause = { if (exo.isPlaying) exo.pause() else exo.play() },
                        onSeek = { exo.seekTo(it) },
                        onRewind = { exo.seekBack() },
                        onForward = { exo.seekForward() },
                        onBack = onBack,
                        playButtonFocusRequester = playButtonFocusRequester,
                        backButtonFocusRequester = backButtonFocusRequester,
                        seekBarFocusRequester = seekBarFocusRequester
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PlayerControlsOverlay(
    videoTitle: String,
    qualityBadge: String? = null,
    isPlaying: Boolean,
    currentPosition: Long,
    duration: Long,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onRewind: () -> Unit,
    onForward: () -> Unit,
    onBack: () -> Unit,
    playButtonFocusRequester: FocusRequester,
    backButtonFocusRequester: FocusRequester,
    seekBarFocusRequester: FocusRequester
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color.Black.copy(0.7f), Color.Transparent, Color.Black.copy(0.85f))
                )
            )
            .padding(32.dp)
    ) {
        Row(
            modifier = Modifier.align(Alignment.TopStart).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ControlIconButton(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                onClick = onBack,
                size = 56.dp,
                iconSize = 24.dp,
                focusRequester = backButtonFocusRequester,
                modifier = Modifier.focusProperties { down = playButtonFocusRequester }
            )
            Spacer(Modifier.width(20.dp))
            Text(
                text = videoTitle,
                style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                color = Color.White,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            if (qualityBadge != null) {
                Spacer(Modifier.width(12.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color.White.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = qualityBadge,
                        color = Color.White,
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    )
                }
            }
        }
        Row(
            modifier = Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(56.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ControlIconButton(
                icon = Icons.Default.Replay10,
                onClick = onRewind,
                size = 64.dp,
                modifier = Modifier.focusProperties { up = backButtonFocusRequester; down = seekBarFocusRequester }
            )
            ControlIconButton(
                icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                onClick = onPlayPause,
                isPrimary = true,
                focusRequester = playButtonFocusRequester,
                modifier = Modifier.focusProperties { up = backButtonFocusRequester; down = seekBarFocusRequester }
            )
            ControlIconButton(
                icon = Icons.Default.Forward10,
                onClick = onForward,
                size = 64.dp,
                modifier = Modifier.focusProperties { up = backButtonFocusRequester; down = seekBarFocusRequester }
            )
        }
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(formatTimeMs(currentPosition), color = Color.White, style = MaterialTheme.typography.labelLarge)
                Text(formatTimeMs(duration), color = Color.White.copy(0.7f), style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.height(12.dp))
            PlayerSeekBar(
                currentPosition = currentPosition,
                duration = duration,
                onSeek = onSeek,
                focusRequester = seekBarFocusRequester,
                modifier = Modifier.focusProperties { up = playButtonFocusRequester }.padding(vertical = 4.dp)
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ControlIconButton(
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isPrimary: Boolean = false,
    size: androidx.compose.ui.unit.Dp = 60.dp,
    iconSize: androidx.compose.ui.unit.Dp = 28.dp,
    focusRequester: FocusRequester? = null
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.25f else 1f)
    val finalSize = if (isPrimary) 92.dp else size
    val finalIconSize = if (isPrimary) 48.dp else iconSize
    Surface(
        onClick = onClick,
        modifier = modifier
            .size(finalSize)
            .scale(scale)
            .onFocusChanged { focused = it.isFocused }
            .let { if (focusRequester != null) it.focusRequester(focusRequester) else it },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(50)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (isPrimary) Color.White.copy(0.12f) else Color.Black.copy(0.3f),
            focusedContainerColor = Color.White,
            contentColor = Color.White,
            focusedContentColor = Color.Black
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(androidx.compose.foundation.BorderStroke(1.5.dp, Color.White.copy(0.15f))),
            focusedBorder = Border(androidx.compose.foundation.BorderStroke(3.dp, Color.White))
        ),
        glow = ClickableSurfaceDefaults.glow(
            focusedGlow = Glow(elevationColor = Color.White.copy(0.2f), elevation = 16.dp)
        )
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(finalIconSize),
                tint = if (focused) Color.Black else Color.White
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PlayerSeekBar(
    currentPosition: Long,
    duration: Long,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester
) {
    var focused by remember { mutableStateOf(false) }
    val progress = if (duration > 0) currentPosition.toFloat() / duration else 0f
    Surface(
        onClick = {},
        modifier = modifier
            .fillMaxWidth()
            .height(28.dp)
            .onFocusChanged { focused = it.isFocused }
            .focusRequester(focusRequester)
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            onSeek((currentPosition - 10000).coerceAtLeast(0))
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            onSeek((currentPosition + 10000).coerceAtMost(duration))
                            true
                        }
                        else -> false
                    }
                } else false
            },
        colors = ClickableSurfaceDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color.Transparent),
        border = ClickableSurfaceDefaults.border(focusedBorder = Border(androidx.compose.foundation.BorderStroke(2.dp, Color.White)))
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(if (focused) 10.dp else 6.dp),
                color = Color.Red,
                trackColor = Color.White.copy(0.25f)
            )
        }
    }
}

private fun formatTimeMs(ms: Long): String {
    val totalSeconds = ms / 1000
    val seconds = totalSeconds % 60
    val minutes = (totalSeconds / 60) % 60
    val hours = totalSeconds / 3600
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds)
    else "%02d:%02d".format(minutes, seconds)
}
