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
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
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
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import com.kvtube.tv.ui.components.YtTvVideoCard
import coil.compose.AsyncImage
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
import kotlinx.coroutines.launch

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

    val playbackManager = remember { com.kvtube.tv.player.TvPlaybackManager.getInstance(ctx) }
    val exo = playbackManager.player

    var isPlaying by remember { mutableStateOf(false) }
    var currentPosition by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var showControls by remember { mutableStateOf(false) }
    var showRecommendations by remember { mutableStateOf(false) }
    var countdownSeconds by remember { mutableIntStateOf(0) }
    var lastInteraction by remember { mutableLongStateOf(System.currentTimeMillis()) }

    val playButtonFocusRequester = remember { FocusRequester() }
    val backButtonFocusRequester = remember { FocusRequester() }
    val seekBarFocusRequester = remember { FocusRequester() }
    val upNextFocusRequester = remember { FocusRequester() }
    val rootFocusRequester = remember { FocusRequester() }

    BackHandler(enabled = true) {
        when {
            countdownSeconds > 0 -> countdownSeconds = 0
            showRecommendations -> {
                showRecommendations = false
                showControls = true
                try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
            }
            showControls -> {
                showControls = false
            }
            else -> {
                onBack()
            }
        }
    }

    LaunchedEffect(countdownSeconds) {
        if (countdownSeconds > 0) {
            delay(1000)
            if (countdownSeconds == 1) {
                val next = state.recommended.firstOrNull()
                countdownSeconds = 0
                if (next != null) {
                    vm.load(next.id)
                }
            } else {
                countdownSeconds--
            }
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
            val bestV = vm.bestAdaptiveVideo(v)
            val bestA = vm.bestAdaptiveAudio(v)
            val mediaSource = playbackManager.buildMediaSource(ctx, v, cfg, bestV, bestA, vm::bestMime)
            if (mediaSource != null) {
                exo.setMediaSource(mediaSource)
                exo.prepare()
                exo.playWhenReady = true
            } else {
                playerError = "No playable stream found. Try another video."
            }
        } catch (e: Exception) {
            playerError = "Failed to start playback: ${e.message}"
        }
    }

    val coroutineScope = rememberCoroutineScope()
    var triedInnerTubeFallback by remember { mutableStateOf(false) }

    LaunchedEffect(state.video) {
        val v = state.video ?: return@LaunchedEffect
        val cfg = vm.getPlaybackConfig(v)
        if (cfg is PlayerViewModel.PlaybackConfig.Unavailable) {
            if (!triedInnerTubeFallback) {
                triedInnerTubeFallback = true
                val fallbackVideo = vm.fallbackToInnerTube(videoId)
                if (fallbackVideo != null) {
                    val fCfg = vm.getPlaybackConfig(fallbackVideo)
                    if (fCfg !is PlayerViewModel.PlaybackConfig.Unavailable) {
                        fallbackList = vm.getFallbackConfigs(fallbackVideo, fCfg)
                        fallbackIndex = 0
                        playWithConfig(fallbackVideo, fCfg)
                        return@LaunchedEffect
                    }
                }
            }
            playerError = "No playable stream found. Try another video."
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
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    if (state.recommended.isNotEmpty()) {
                        countdownSeconds = 5
                    }
                }
            }
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                android.util.Log.e("PlayerScreen", "ExoPlayer error: ${error.message} code=${error.errorCodeName} cause=${error.cause?.message}", error)
                val v = state.video
                // Try next fallback config (lower resolution)
                if (v != null && fallbackIndex < fallbackList.size) {
                    val next = fallbackList[fallbackIndex]
                    fallbackIndex++
                    android.util.Log.w("PlayerScreen", "Trying fallback $fallbackIndex/${fallbackList.size}: $next")
                    try {
                        playWithConfig(v, next)
                        return
                    } catch (_: Exception) {}
                }

                // If Invidious fallbacks exhausted, seamlessly fall back to InnerTube
                if (!triedInnerTubeFallback && videoId.isNotBlank()) {
                    triedInnerTubeFallback = true
                    android.util.Log.w("PlayerScreen", "Invidious stream playback failed. Falling back to direct InnerTube streams...")
                    coroutineScope.launch {
                        val fallbackVideo = vm.fallbackToInnerTube(videoId)
                        if (fallbackVideo != null) {
                            val fCfg = vm.getPlaybackConfig(fallbackVideo)
                            if (fCfg !is PlayerViewModel.PlaybackConfig.Unavailable) {
                                fallbackList = vm.getFallbackConfigs(fallbackVideo, fCfg)
                                fallbackIndex = 0
                                playWithConfig(fallbackVideo, fCfg)
                                return@launch
                            }
                        }
                        playerError = error.message ?: "Playback failed (${error.errorCodeName})"
                    }
                    return
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
            delay(4000)
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
            playbackManager.reset()
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
                // Smooth thumbnail backdrop during initial buffering — fades out once playback begins
                AnimatedVisibility(
                    visible = !isPlaying && playerError == null,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.fillMaxSize()
                ) {
                    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                        val thumb = state.video?.videoThumbnails?.firstOrNull()?.url
                            ?: "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
                        AsyncImage(
                            model = thumb,
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop
                        )
                        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)))
                        androidx.compose.material3.CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(48.dp)
                        )
                    }
                }
                AnimatedVisibility(
                    visible = showControls && !showRecommendations,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.fillMaxSize()
                ) {
                    LaunchedEffect(Unit) {
                        try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                    }
                    PlayerControlsOverlay(
                        video = state.video,
                        qualityBadge = qualityBadge,
                        isPlaying = isPlaying,
                        currentPosition = currentPosition,
                        duration = duration,
                        onPlayPause = { if (exo.isPlaying) exo.pause() else exo.play() },
                        onSeek = { exo.seekTo(it) },
                        onRewind = { exo.seekBack() },
                        onForward = { exo.seekForward() },
                        onBack = onBack,
                        onShowRecommendations = {
                            showRecommendations = true
                            showControls = false
                        },
                        playButtonFocusRequester = playButtonFocusRequester,
                        backButtonFocusRequester = backButtonFocusRequester,
                        seekBarFocusRequester = seekBarFocusRequester
                    )
                }

                // In-Player "Up Next" Shelf (D-pad DOWN Drawer)
                AnimatedVisibility(
                    visible = showRecommendations,
                    enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                    exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
                    modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                ) {
                    LaunchedEffect(Unit) {
                        try { upNextFocusRequester.requestFocus() } catch (_: Exception) {}
                    }
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(Color.Transparent, Color.Black.copy(0.85f), Color.Black)
                                )
                            )
                            .padding(top = 16.dp, bottom = 24.dp)
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(
                                    text = "Up Next",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, fontSize = 18.sp),
                                    color = Color.White
                                )
                                Box(
                                    Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(Color.White.copy(0.15f))
                                        .padding(horizontal = 8.dp, vertical = 2.dp)
                                ) {
                                    Text("Press UP to return to player", color = Color(0xFFCCCCCC), style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp))
                                }
                            }
                            if (state.recommended.isNotEmpty()) {
                                Text(
                                    "${state.recommended.size} videos",
                                    color = Color(0xFFAAAAAA),
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                        if (state.recommended.isEmpty()) {
                            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                                Text("Loading recommendations…", color = Color(0xFFAAAAAA))
                            }
                        } else {
                            TvLazyRow(
                                contentPadding = PaddingValues(horizontal = 32.dp),
                                horizontalArrangement = Arrangement.spacedBy(16.dp),
                                modifier = Modifier.focusRequester(upNextFocusRequester)
                            ) {
                                items(state.recommended, key = { it.id }) { rv ->
                                    YtTvVideoCard(
                                        video = rv,
                                        onClick = {
                                            showRecommendations = false
                                            triedInnerTubeFallback = false
                                            fallbackIndex = 0
                                            vm.load(rv.id)
                                        },
                                        modifier = Modifier.onKeyEvent { keyEvent ->
                                            if (keyEvent.type == KeyEventType.KeyDown && keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                                                showRecommendations = false
                                                showControls = true
                                                try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                                                true
                                            } else false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }

                // Autoplay Next Video Countdown
                AnimatedVisibility(
                    visible = countdownSeconds > 0,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.Center)
                ) {
                    val nextVid = state.recommended.firstOrNull()
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color(0xFF1E1E1E).copy(alpha = 0.95f))
                            .border(2.dp, Color.White.copy(0.3f), RoundedCornerShape(16.dp))
                            .padding(28.dp)
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Text(
                                "Up next in $countdownSeconds seconds",
                                color = Color.White,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, fontSize = 20.sp)
                            )
                            if (nextVid != null) {
                                Text(
                                    nextVid.title,
                                    color = Color(0xFFE0E0E0),
                                    style = MaterialTheme.typography.bodyMedium,
                                    maxLines = 2,
                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                androidx.tv.material3.Button(
                                    onClick = {
                                        val n = state.recommended.firstOrNull()
                                        countdownSeconds = 0
                                        if (n != null) vm.load(n.id)
                                    },
                                    colors = androidx.tv.material3.ButtonDefaults.colors(containerColor = Color.White, contentColor = Color.Black)
                                ) {
                                    Text("Play Now", fontWeight = FontWeight.Bold)
                                }
                                androidx.tv.material3.OutlinedButton(
                                    onClick = { countdownSeconds = 0 }
                                ) {
                                    Text("Cancel", color = Color.White)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PlayerControlsOverlay(
    video: com.kvtube.tv.data.model.InvidiousVideo?,
    qualityBadge: String? = null,
    isPlaying: Boolean,
    currentPosition: Long,
    duration: Long,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onRewind: () -> Unit,
    onForward: () -> Unit,
    onBack: () -> Unit,
    onShowRecommendations: () -> Unit,
    playButtonFocusRequester: FocusRequester,
    backButtonFocusRequester: FocusRequester,
    seekBarFocusRequester: FocusRequester
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color.Black.copy(0.75f), Color.Transparent, Color.Black.copy(0.90f))
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
                size = 52.dp,
                iconSize = 24.dp,
                focusRequester = backButtonFocusRequester,
                modifier = Modifier.focusProperties { down = playButtonFocusRequester }
            )
            Spacer(Modifier.width(16.dp))
            val avatarUrl = video?.authorThumbnails?.firstOrNull()?.url
            if (!avatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = avatarUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF2E2E2E)),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop
                )
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(
                    text = video?.title ?: "",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold, fontSize = 18.sp),
                    color = Color.White,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = buildString {
                        video?.author?.let { append(it) }
                        video?.viewCount?.takeIf { it > 0 }?.let {
                            if (isNotEmpty()) append(" • ")
                            append(when {
                                it >= 1_000_000_000 -> "%.1fB views".format(it / 1_000_000_000.0)
                                it >= 1_000_000 -> "%.1fM views".format(it / 1_000_000.0)
                                it >= 1_000 -> "%.1fK views".format(it / 1_000.0)
                                else -> "$it views"
                            })
                        }
                        video?.publishedText?.let { if (it.isNotBlank()) { if (isNotEmpty()) append(" • "); append(it) } }
                    },
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, color = Color(0xFFAAAAAA)),
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                )
            }
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
                .padding(bottom = 12.dp)
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(formatTimeMs(currentPosition), color = Color.White, style = MaterialTheme.typography.labelLarge)
                Text(formatTimeMs(duration), color = Color.White.copy(0.7f), style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.height(8.dp))
            PlayerSeekBar(
                currentPosition = currentPosition,
                duration = duration,
                onSeek = onSeek,
                onDown = onShowRecommendations,
                focusRequester = seekBarFocusRequester,
                modifier = Modifier.focusProperties { up = playButtonFocusRequester }.padding(vertical = 4.dp)
            )
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center
            ) {
                Surface(
                    onClick = onShowRecommendations,
                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(20.dp)),
                    colors = ClickableSurfaceDefaults.colors(
                        containerColor = Color.White.copy(alpha = 0.12f),
                        focusedContainerColor = Color.White,
                        contentColor = Color.White,
                        focusedContentColor = Color.Black
                    )
                ) {
                    Row(
                        Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("Up Next (Recommendations)", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontSize = 12.sp))
                    }
                }
            }
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
    onDown: () -> Unit = {},
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
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            onDown()
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
