package com.kvtube.tv.ui.screens

import android.view.KeyEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlaybackException
import androidx.media3.ui.PlayerView
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.itemsIndexed
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Glow
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.kvtube.tv.data.local.TvPrefs
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.player.AudioLanguagePreference
import com.kvtube.tv.player.TvAudioTrackOption
import com.kvtube.tv.player.TvPlaybackManager
import com.kvtube.tv.ui.components.YtChannelAvatar
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBorder
import com.kvtube.tv.ui.theme.YTBorderSubtle
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusGlow
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTSurfaceElevated
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.ui.theme.ytExponentialScrimStops
import com.kvtube.tv.ui.theme.ytProgressBrush
import com.kvtube.tv.viewmodel.PlayerViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(UnstableApi::class)
@ExperimentalTvMaterial3Api
@Composable
fun PlayerScreen(
    videoId: String,
    onBack: () -> Unit = {},
    onChannelClick: (String) -> Unit = {},
    vm: PlayerViewModel = viewModel(),
) {
    val ctx = LocalContext.current
    val state by vm.state.collectAsState()

    val playbackManager = remember { TvPlaybackManager.getInstance(ctx) }
    val exo = playbackManager.player
    val tvPrefs = remember { TvPrefs(ctx) }
    val audioTracks by playbackManager.audioTracks.collectAsState()
    val activeAudioTrack by playbackManager.activeAudioTrack.collectAsState()
    val audioPreference by playbackManager.audioPreference.collectAsState()

    var activeVideoId by remember(videoId) { mutableStateOf(videoId.trim()) }
    var isPlaying by remember { mutableStateOf(false) }
    var currentPosition by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var showControls by remember { mutableStateOf(false) }
    var showRecommendations by remember { mutableStateOf(false) }
    var showAudioPicker by remember { mutableStateOf(false) }
    var countdownSeconds by remember { mutableIntStateOf(0) }
    var lastInteraction by remember { mutableLongStateOf(System.currentTimeMillis()) }

    val playButtonFocusRequester = remember { FocusRequester() }
    val backButtonFocusRequester = remember { FocusRequester() }
    val seekBarFocusRequester = remember { FocusRequester() }
    val upNextFocusRequester = remember { FocusRequester() }
    val audioPickerFocusRequester = remember { FocusRequester() }
    val errorRetryFocusRequester = remember { FocusRequester() }
    val rootFocusRequester = remember { FocusRequester() }

    var playerError by remember { mutableStateOf<String?>(null) }
    var errorListenerRef by remember { mutableStateOf<Player.Listener?>(null) }
    var qualityBadge by remember { mutableStateOf<String?>(null) }
    var currentCfg by remember { mutableStateOf<PlayerViewModel.PlaybackConfig?>(null) }
    var fallbackIndex by remember { mutableStateOf(0) }
    var fallbackList by remember { mutableStateOf<List<PlayerViewModel.PlaybackConfig>>(emptyList()) }
    var fastDashVideoId by remember { mutableStateOf<String?>(null) }
    var qualityCap by remember { mutableIntStateOf(playbackManager.maxHeightCap) }
    var triedInnerTubeFallback by remember { mutableStateOf(false) }

    fun startFastDash(id: String) {
        val manifest = vm.dashManifestUrl(id)
        if (playbackManager.playDashFast(manifest)) {
            fastDashVideoId = id.trim()
            playerError = null
            qualityBadge = null
        } else {
            fastDashVideoId = null
        }
    }

    fun loadAndPlay(id: String) {
        val clean = id.trim()
        activeVideoId = clean
        triedInnerTubeFallback = false
        fallbackIndex = 0
        fallbackList = emptyList()
        showAudioPicker = false
        vm.load(clean)
        startFastDash(clean)
    }

    fun retryPlayback() {
        playerError = null
        triedInnerTubeFallback = false
        fallbackIndex = 0
        fallbackList = emptyList()
        showAudioPicker = false
        vm.load(activeVideoId, forceRefresh = true)
        startFastDash(activeVideoId)
    }

    BackHandler(enabled = true) {
        when {
            countdownSeconds > 0 -> countdownSeconds = 0
            showAudioPicker -> {
                showAudioPicker = false
                showControls = true
                lastInteraction = System.currentTimeMillis()
                try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
            }
            showRecommendations -> {
                showRecommendations = false
                showControls = true
                try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
            }
            showControls -> showControls = false
            else -> onBack()
        }
    }

    LaunchedEffect(countdownSeconds) {
        if (countdownSeconds > 0) {
            delay(1000)
            if (countdownSeconds == 1) {
                val next = state.recommended.firstOrNull()
                countdownSeconds = 0
                if (next != null) loadAndPlay(next.id)
            } else {
                countdownSeconds--
            }
        }
    }

    LaunchedEffect(videoId) { loadAndPlay(videoId) }

    fun playWithConfig(v: InvidiousVideo, cfg: PlayerViewModel.PlaybackConfig) {
        currentCfg = cfg
        playerError = null
        playbackManager.markFastDashEnded()
        fastDashVideoId = null
        qualityBadge = null
        try {
            exo.stop()
            exo.clearMediaItems()
            playbackManager.prepareForNewVideo()
            val bestV = vm.bestAdaptiveVideo(v)
            val bestA = vm.bestAdaptiveAudio(v, playbackManager.audioPreference.value)
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

    LaunchedEffect(state.video) {
        val v = state.video ?: return@LaunchedEffect
        val cfg = vm.getPlaybackConfig(v)
        if (fastDashVideoId != null && fastDashVideoId == v.videoId.trim() && playbackManager.isFastDashActive) {
            if (cfg !is PlayerViewModel.PlaybackConfig.Unavailable) {
                fallbackList = vm.getFallbackConfigs(v, cfg)
                fallbackIndex = 0
            }
            return@LaunchedEffect
        }
        if (cfg is PlayerViewModel.PlaybackConfig.Unavailable) {
            if (!triedInnerTubeFallback) {
                triedInnerTubeFallback = true
                val fallbackVideo = vm.fallbackToInnerTube(activeVideoId)
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
            override fun onVideoSizeChanged(videoSize: VideoSize) {
                val h = videoSize.height
                if (h > 0) {
                    qualityBadge = if (qualityCap == 0) "Auto • ${h}p" else "${h}p"
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED && state.recommended.isNotEmpty()) {
                    countdownSeconds = 5
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                android.util.Log.e("PlayerScreen", "ExoPlayer error: ${error.message} code=${error.errorCodeName}", error)
                if (playbackManager.isFastDashActive) {
                    playbackManager.markFastDashEnded()
                    fastDashVideoId = null
                    val loaded = state.video
                    if (loaded != null) {
                        val cfg = vm.getPlaybackConfig(loaded)
                        if (cfg is PlayerViewModel.PlaybackConfig.Dash) {
                            val fallbacks = vm.getFallbackConfigs(loaded, cfg)
                            fallbackList = fallbacks
                            val next = fallbacks.firstOrNull()
                            if (next != null) {
                                fallbackIndex = 1
                                playWithConfig(loaded, next)
                                return
                            }
                        } else if (cfg !is PlayerViewModel.PlaybackConfig.Unavailable) {
                            fallbackList = vm.getFallbackConfigs(loaded, cfg)
                            fallbackIndex = 0
                            playWithConfig(loaded, cfg)
                            return
                        }
                    } else if (state.isLoading) {
                        // In-flight repo.video() will populate state.video and trigger LaunchedEffect
                        return
                    } else if (!triedInnerTubeFallback && activeVideoId.isNotBlank()) {
                        triedInnerTubeFallback = true
                        vm.load(activeVideoId, forceRefresh = true)
                        return
                    }
                }
                val v = state.video
                if (v != null && fallbackIndex < fallbackList.size) {
                    val next = fallbackList[fallbackIndex]
                    fallbackIndex++
                    try {
                        playWithConfig(v, next)
                        return
                    } catch (_: Exception) {}
                }

                if (!triedInnerTubeFallback && activeVideoId.isNotBlank()) {
                    triedInnerTubeFallback = true
                    coroutineScope.launch {
                        val fallbackVideo = vm.fallbackToInnerTube(activeVideoId)
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
        errorListenerRef = listener
        onDispose { exo.removeListener(listener); errorListenerRef = null }
    }

    LaunchedEffect(exo) {
        var bufferingSince = 0L
        while (true) {
            delay(1_000)
            if (exo.playbackState == Player.STATE_BUFFERING && exo.playWhenReady) {
                val now = android.os.SystemClock.elapsedRealtime()
                if (bufferingSince == 0L) bufferingSince = now
                if (now - bufferingSince >= 20_000L) {
                    bufferingSince = 0L
                    errorListenerRef?.onPlayerError(
                        ExoPlaybackException.createForSource(
                            java.io.IOException("stalled buffering"),
                            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                        )
                    )
                }
            } else {
                bufferingSince = 0L
            }
        }
    }

    LaunchedEffect(exo) {
        var lastSaved = 0L
        while (true) {
            currentPosition = exo.currentPosition.coerceAtLeast(0L)
            duration = exo.duration.coerceAtLeast(0L)
            isPlaying = exo.isPlaying
            val now = System.currentTimeMillis()
            if (now - lastSaved >= 2000L && currentPosition > 0L) {
                vm.updateProgress(currentPosition, duration)
                lastSaved = now
            }
            delay(500)
        }
    }

    LaunchedEffect(showControls, showAudioPicker, lastInteraction) {
        if (showControls && !showAudioPicker) {
            delay(4500)
            showControls = false
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            try {
                val pos = exo.currentPosition.coerceAtLeast(0L)
                val dur = exo.duration.coerceAtLeast(0L)
                if (pos > 0L) vm.updateProgress(pos, dur)
            } catch (_: Exception) {}
            playbackManager.reset()
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(rootFocusRequester)
            .focusable(enabled = !showControls && !showRecommendations && !showAudioPicker)
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    lastInteraction = System.currentTimeMillis()
                    val keyCode = keyEvent.nativeKeyEvent.keyCode
                    if (showRecommendations && keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        lastInteraction = System.currentTimeMillis()
                        showRecommendations = false
                        showControls = true
                        try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                        return@onKeyEvent true
                    }
                    if (!showControls && !showRecommendations && !showAudioPicker) {
                        val isNav = when (keyCode) {
                            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
                            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
                            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
                            KeyEvent.KEYCODE_SPACE -> true
                            else -> false
                        }
                        if (isNav) {
                            showControls = true
                            return@onKeyEvent true
                        }
                    }
                }
                false
            }
    ) {
        when {
            state.isLoading && fastDashVideoId == null -> {
                Box(Modifier.fillMaxSize().background(YTBackground), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = YTBrandRed, strokeWidth = 3.dp)
                }
            }
            state.error != null && fastDashVideoId == null -> {
                LaunchedEffect(state.error) {
                    try { errorRetryFocusRequester.requestFocus() } catch (_: Exception) {}
                }
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(YTBackground)
                        .padding(36.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = state.error ?: "Error",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = "Invidious backend may be temporarily unavailable. Try another video or retry.",
                            color = YTTextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Button(
                            onClick = ::retryPlayback,
                            modifier = Modifier.focusRequester(errorRetryFocusRequester),
                            shape = ButtonDefaults.shape(CircleShape),
                            colors = ButtonDefaults.colors(
                                containerColor = YTChip,
                                contentColor = YTTextPrimary,
                                focusedContainerColor = YTFocus,
                                focusedContentColor = YTFocusInk,
                            ),
                        ) {
                            Text("Retry", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            playerError != null -> {
                LaunchedEffect(playerError) {
                    try { errorRetryFocusRequester.requestFocus() } catch (_: Exception) {}
                }
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(YTBackground)
                        .padding(36.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = playerError ?: "Playback error",
                            color = Color(0xFFFF8A80),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = "Fallback tried ${fallbackIndex}/${fallbackList.size}. Try another video or retry.",
                            color = YTTextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Button(
                            onClick = ::retryPlayback,
                            modifier = Modifier.focusRequester(errorRetryFocusRequester),
                            shape = ButtonDefaults.shape(CircleShape),
                            colors = ButtonDefaults.colors(
                                containerColor = YTChip,
                                contentColor = YTTextPrimary,
                                focusedContainerColor = YTFocus,
                                focusedContentColor = YTFocusInk,
                            ),
                        ) {
                            Text("Retry", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            state.video != null || fastDashVideoId != null -> {
                AndroidView(
                    factory = { c ->
                        PlayerView(c).apply {
                            player = exo
                            useController = false
                            setKeepContentOnPlayerReset(true)
                            setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                            isFocusable = false
                            isFocusableInTouchMode = false
                            layoutParams = FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT,
                            )
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )

                // Thumbnail backdrop during initial buffering
                AnimatedVisibility(
                    visible = !isPlaying && playerError == null && !showControls && !showAudioPicker,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                        val thumb = state.video?.videoThumbnails?.firstOrNull()?.url
                            ?: "https://i.ytimg.com/vi/$activeVideoId/hqdefault.jpg"
                        AsyncImage(
                            model = thumb,
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                        )
                        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)))
                        CircularProgressIndicator(
                            color = YTBrandRed,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(44.dp),
                        )
                    }
                }

                // Google YouTube TV 8.03.300 Bottom-Anchored Watch Overlay
                AnimatedVisibility(
                    visible = showControls && !showRecommendations && !showAudioPicker,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LaunchedEffect(Unit) {
                        try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                    }
                    PlayerControlsOverlay(
                        video = state.video,
                        preview = state.preview,
                        qualityBadge = qualityBadge,
                        qualityCapLabel = if (qualityCap == 0) "Auto" else "${qualityCap}p",
                        onCycleQuality = {
                            val next = when (qualityCap) { 0 -> 1080; 1080 -> 720; 720 -> 480; else -> 0 }
                            qualityCap = next
                            playbackManager.setMaxHeight(next)
                            qualityBadge = if (next == 0) "Auto" else "${next}p max"
                        },
                        audioLabel = activeAudioTrack?.shortBadge ?: audioPreference.shortLabel,
                        onOpenAudioPicker = {
                            lastInteraction = System.currentTimeMillis()
                            showAudioPicker = true
                            showControls = false
                        },
                        isPlaying = isPlaying,
                        currentPosition = currentPosition,
                        duration = duration,
                        onPlayPause = {
                            lastInteraction = System.currentTimeMillis()
                            if (exo.isPlaying) exo.pause() else exo.play()
                        },
                        onSeek = {
                            lastInteraction = System.currentTimeMillis()
                            exo.seekTo(it)
                        },
                        onRewind = {
                            lastInteraction = System.currentTimeMillis()
                            exo.seekBack()
                        },
                        onForward = {
                            lastInteraction = System.currentTimeMillis()
                            exo.seekForward()
                        },
                        onBack = onBack,
                        onChannel = {
                            val cid = state.video?.authorId?.takeIf { it.isNotBlank() }
                                ?: state.preview?.channelId?.takeIf { it.isNotBlank() }
                            cid?.let(onChannelClick)
                        },
                        onShowRecommendations = {
                            showRecommendations = true
                            showControls = false
                        },
                        playButtonFocusRequester = playButtonFocusRequester,
                        backButtonFocusRequester = backButtonFocusRequester,
                        seekBarFocusRequester = seekBarFocusRequester,
                    )
                }

                // Bottom "More videos" (Up Next) Drawer
                AnimatedVisibility(
                    visible = showRecommendations,
                    enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                    exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth(),
                ) {
                    fun closeRecommendationsToControls() {
                        lastInteraction = System.currentTimeMillis()
                        showRecommendations = false
                        showControls = true
                        try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                    }
                    fun handleUpReturn(keyEvent: androidx.compose.ui.input.key.KeyEvent): Boolean =
                        if (keyEvent.type == KeyEventType.KeyDown &&
                            keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_UP
                        ) {
                            closeRecommendationsToControls()
                            true
                        } else false

                    LaunchedEffect(showRecommendations, state.recommended.isNotEmpty()) {
                        if (showRecommendations) {
                            delay(160)
                            try { upNextFocusRequester.requestFocus() } catch (_: Exception) {}
                        }
                    }
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .onKeyEvent(::handleUpReturn)
                            .background(
                                Brush.verticalGradient(
                                    *ytExponentialScrimStops(
                                        baseColor = YTBackground,
                                        startFraction = 0.0f,
                                        endFraction = 0.72f,
                                        maxAlpha = 0.96f,
                                    )
                                )
                            )
                            .padding(top = 24.dp, bottom = 24.dp)
                    ) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 36.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Text(
                                    text = "More videos",
                                    style = MaterialTheme.typography.titleLarge.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 18.sp,
                                    ),
                                    color = YTTextPrimary,
                                )
                                Box(
                                    Modifier
                                        .clip(CircleShape)
                                        .background(Color.White.copy(alpha = 0.12f))
                                        .padding(horizontal = 10.dp, vertical = 3.dp)
                                ) {
                                    Text(
                                        "Press UP to return",
                                        color = Color(0xFFD0D0D0),
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                    )
                                }
                            }
                            if (state.recommended.isNotEmpty()) {
                                Text(
                                    text = "${state.recommended.size} videos",
                                    color = YTTextSecondary,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }

                        if (state.recommended.isEmpty()) {
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(32.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Text(
                                    text = if (state.recommendedLoading) "Loading recommendations…" else "No related videos available right now.",
                                    color = YTTextSecondary,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Button(
                                    onClick = ::closeRecommendationsToControls,
                                    modifier = Modifier
                                        .focusRequester(upNextFocusRequester)
                                        .onKeyEvent(::handleUpReturn),
                                    shape = ButtonDefaults.shape(CircleShape),
                                    colors = ButtonDefaults.colors(
                                        containerColor = YTChip,
                                        contentColor = YTTextPrimary,
                                        focusedContainerColor = YTFocus,
                                        focusedContentColor = YTFocusInk,
                                    ),
                                ) {
                                    Text("Back to player", fontWeight = FontWeight.SemiBold)
                                }
                            }
                        } else {
                            TvLazyRow(
                                contentPadding = PaddingValues(horizontal = 36.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                                modifier = Modifier.onKeyEvent(::handleUpReturn),
                            ) {
                                itemsIndexed(state.recommended, key = { _, it -> it.id }) { idx, rv ->
                                    YtTvVideoCard(
                                        video = rv,
                                        onClick = {
                                            showRecommendations = false
                                            triedInnerTubeFallback = false
                                            fallbackIndex = 0
                                            loadAndPlay(rv.id)
                                        },
                                        modifier = Modifier
                                            .let { if (idx == 0) it.focusRequester(upNextFocusRequester) else it }
                                            .onKeyEvent(::handleUpReturn),
                                    )
                                }
                            }
                        }
                    }
                }

                // Right-Docked Audio Track & Default Language Picker
                AnimatedVisibility(
                    visible = showAudioPicker,
                    enter = slideInHorizontally(initialOffsetX = { it }) + fadeIn(),
                    exit = slideOutHorizontally(targetOffsetX = { it }) + fadeOut(),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    AudioPickerOverlay(
                        tracks = audioTracks,
                        activePreference = audioPreference,
                        firstFocusRequester = audioPickerFocusRequester,
                        onSelectTrack = { track ->
                            playbackManager.selectAudioTrack(track)
                            lastInteraction = System.currentTimeMillis()
                            showAudioPicker = false
                        },
                        onSelectPreference = { pref ->
                            playbackManager.setAudioPreference(pref)
                            coroutineScope.launch { tvPrefs.setAudioPref(pref.key) }
                            lastInteraction = System.currentTimeMillis()
                        },
                        onClose = {
                            showAudioPicker = false
                            showControls = true
                            lastInteraction = System.currentTimeMillis()
                            try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                        },
                    )
                }

                // Autoplay Next Video Card
                AnimatedVisibility(
                    visible = countdownSeconds > 0,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.Center),
                ) {
                    val nextVid = state.recommended.firstOrNull()
                    Column(
                        modifier = Modifier
                            .width(380.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(YTSurfaceElevated.copy(alpha = 0.96f))
                            .border(1.dp, YTBorder, RoundedCornerShape(18.dp))
                            .padding(22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = "Up next in ${countdownSeconds}s",
                            color = YTTextPrimary,
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        )
                        if (nextVid != null) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(16f / 9f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(YTBackground)
                            ) {
                                AsyncImage(
                                    model = nextVid.thumbnail,
                                    contentDescription = nextVid.title,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop,
                                )
                            }
                            Text(
                                text = nextVid.title,
                                color = Color(0xFFE0E0E0),
                                style = MaterialTheme.typography.titleSmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(
                                onClick = {
                                    val n = state.recommended.firstOrNull()
                                    countdownSeconds = 0
                                    if (n != null) loadAndPlay(n.id)
                                },
                                shape = ButtonDefaults.shape(CircleShape),
                                colors = ButtonDefaults.colors(
                                    containerColor = YTFocus,
                                    contentColor = YTFocusInk,
                                    focusedContainerColor = Color.White,
                                    focusedContentColor = Color.Black,
                                ),
                            ) {
                                Text("Play now", fontWeight = FontWeight.Bold)
                            }
                            Button(
                                onClick = { countdownSeconds = 0 },
                                shape = ButtonDefaults.shape(CircleShape),
                                colors = ButtonDefaults.colors(
                                    containerColor = YTChip,
                                    contentColor = YTTextPrimary,
                                    focusedContainerColor = YTFocus,
                                    focusedContentColor = YTFocusInk,
                                ),
                            ) {
                                Text("Cancel", fontWeight = FontWeight.Medium)
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
    video: InvidiousVideo?,
    preview: TvVideo? = null,
    qualityBadge: String? = null,
    qualityCapLabel: String = "Auto",
    onCycleQuality: () -> Unit = {},
    audioLabel: String = "Audio",
    onOpenAudioPicker: () -> Unit = {},
    isPlaying: Boolean,
    currentPosition: Long,
    duration: Long,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onRewind: () -> Unit,
    onForward: () -> Unit,
    onBack: () -> Unit,
    onChannel: () -> Unit,
    onShowRecommendations: () -> Unit,
    playButtonFocusRequester: FocusRequester,
    backButtonFocusRequester: FocusRequester,
    seekBarFocusRequester: FocusRequester,
) {
    val displayTitle = video?.title?.takeIf { it.isNotBlank() } ?: preview?.title.orEmpty()
    val displayAuthor = video?.author?.takeIf { it.isNotBlank() } ?: preview?.channelTitle.orEmpty()
    val displayAuthorId = video?.authorId?.takeIf { it.isNotBlank() } ?: preview?.channelId?.takeIf { it.isNotBlank() }
    val hasChannel = !displayAuthorId.isNullOrBlank()
    val avatarUrl = video?.authorThumbnails?.firstOrNull()?.url?.takeIf { it.isNotBlank() } ?: preview?.avatarUrl
    val viewCountText = video?.viewCount?.takeIf { it > 0 }?.let {
        when {
            it >= 1_000_000_000 -> "%.1fB views".format(it / 1_000_000_000.0)
            it >= 1_000_000 -> "%.1fM views".format(it / 1_000_000.0)
            it >= 1_000 -> "%.1fK views".format(it / 1_000.0)
            else -> "$it views"
        }
    } ?: preview?.viewsText?.takeIf { it.isNotBlank() }
    val publishedText = video?.publishedText?.takeIf { it.isNotBlank() } ?: preview?.publishedText?.takeIf { it.isNotBlank() }
    val metaLine = listOfNotNull(
        displayAuthor.takeIf { it.isNotBlank() },
        viewCountText,
        publishedText,
    ).joinToString(" • ")

    Box(Modifier.fillMaxSize()) {
        // Subtle Top Vignette + Back + Resolution Badge
        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        *ytExponentialScrimStops(
                            baseColor = YTBackground,
                            startFraction = 0.0f,
                            endFraction = 1.0f,
                            maxAlpha = 0.72f,
                            reverse = true,
                        )
                    )
                )
                .padding(horizontal = 36.dp, vertical = 24.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PlayerCircleButton(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                onClick = onBack,
                size = 44.dp,
                iconSize = 22.dp,
                focusRequester = backButtonFocusRequester,
                modifier = Modifier.focusProperties { down = seekBarFocusRequester },
            )

            if (qualityBadge != null) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xB80F0F0F))
                        .border(0.75.dp, YTBorderSubtle, RoundedCornerShape(6.dp))
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = qualityBadge,
                        color = YTTextPrimary,
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 11.5.sp,
                        ),
                    )
                }
            }
        }

        // Bottom-Anchored YouTube TV Player HUD (Title + Meta + Scrubber + Transport/Action Row)
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        *ytExponentialScrimStops(
                            baseColor = YTBackground,
                            startFraction = 0.0f,
                            endFraction = 0.92f,
                            maxAlpha = 0.96f,
                        )
                    )
                )
                .padding(horizontal = 36.dp, vertical = 24.dp),
        ) {
            // Video Title + Channel Meta Row
            Text(
                text = displayTitle,
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 21.sp,
                    lineHeight = 27.sp,
                ),
                color = YTTextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(Modifier.height(8.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                YtChannelAvatar(url = avatarUrl, name = displayAuthor.ifBlank { "K" }, size = 28.dp)
                Text(
                    text = metaLine,
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.sp),
                    color = Color(0xFFD0D0D0),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(14.dp))

            // Scrubber Row
            PlayerSeekBar(
                currentPosition = currentPosition,
                duration = duration,
                onSeek = onSeek,
                onDown = {
                    try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                },
                focusRequester = seekBarFocusRequester,
                modifier = Modifier.focusProperties {
                    up = backButtonFocusRequester
                    down = playButtonFocusRequester
                },
            )

            Spacer(Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = formatTimeMs(currentPosition),
                        color = YTTextPrimary,
                        style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.sp),
                    )
                    Text("/", color = YTTextSecondary, style = MaterialTheme.typography.labelMedium)
                    Text(
                        text = formatTimeMs(duration),
                        color = YTTextSecondary,
                        style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.sp),
                    )
                }

                Text(
                    text = if (qualityBadge != null) qualityBadge else "HD",
                    color = YTTextSecondary,
                    style = MaterialTheme.typography.labelMedium,
                )
            }

            Spacer(Modifier.height(12.dp))

            // Transport Left + Action Pills Right
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PlayerCircleButton(
                        icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        onClick = onPlayPause,
                        isPrimary = true,
                        size = 48.dp,
                        iconSize = 26.dp,
                        focusRequester = playButtonFocusRequester,
                        modifier = Modifier
                            .focusProperties { up = seekBarFocusRequester }
                            .onKeyEvent { e ->
                                if (e.type == KeyEventType.KeyDown &&
                                    e.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_DOWN
                                ) {
                                    onShowRecommendations()
                                    true
                                } else false
                            },
                    )
                    PlayerCircleButton(
                        icon = Icons.Default.Replay10,
                        contentDescription = "Rewind 10s",
                        onClick = onRewind,
                        size = 44.dp,
                        iconSize = 22.dp,
                        modifier = Modifier
                            .focusProperties { up = seekBarFocusRequester }
                            .onKeyEvent { e ->
                                if (e.type == KeyEventType.KeyDown &&
                                    e.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_DOWN
                                ) {
                                    onShowRecommendations()
                                    true
                                } else false
                            },
                    )
                    PlayerCircleButton(
                        icon = Icons.Default.Forward10,
                        contentDescription = "Forward 10s",
                        onClick = onForward,
                        size = 44.dp,
                        iconSize = 22.dp,
                        modifier = Modifier
                            .focusProperties { up = seekBarFocusRequester }
                            .onKeyEvent { e ->
                                if (e.type == KeyEventType.KeyDown &&
                                    e.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_DOWN
                                ) {
                                    onShowRecommendations()
                                    true
                                } else false
                            },
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (hasChannel) {
                        PlayerPillAction(
                            icon = Icons.Default.Person,
                            label = "Channel",
                            onClick = onChannel,
                            modifier = Modifier.focusProperties { up = seekBarFocusRequester },
                        )
                    }
                    PlayerPillAction(
                        icon = Icons.Default.Language,
                        label = audioLabel,
                        onClick = onOpenAudioPicker,
                        modifier = Modifier.focusProperties { up = seekBarFocusRequester },
                    )
                    PlayerPillAction(
                        icon = Icons.Default.HighQuality,
                        label = qualityCapLabel,
                        onClick = onCycleQuality,
                        modifier = Modifier.focusProperties { up = seekBarFocusRequester },
                    )
                    PlayerPillAction(
                        icon = Icons.Default.KeyboardArrowDown,
                        label = "More videos",
                        onClick = onShowRecommendations,
                        modifier = Modifier.focusProperties { up = seekBarFocusRequester },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PlayerCircleButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isPrimary: Boolean = false,
    size: Dp = 44.dp,
    iconSize: Dp = 22.dp,
    focusRequester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.08f else 1f, label = "CtrlBtnScale")

    Surface(
        onClick = onClick,
        modifier = modifier
            .size(size)
            .onFocusChanged { focused = it.isFocused }
            .let { if (focusRequester != null) it.focusRequester(focusRequester) else it },
        shape = ClickableSurfaceDefaults.shape(CircleShape),
        scale = ClickableSurfaceDefaults.scale(focusedScale = scale),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (isPrimary) Color.White.copy(alpha = 0.20f) else Color.White.copy(alpha = 0.12f),
            focusedContainerColor = YTFocus,
            contentColor = YTTextPrimary,
            focusedContentColor = YTFocusInk,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, Color.White.copy(alpha = 0.14f))),
            focusedBorder = Border(BorderStroke(2.dp, YTFocus)),
        ),
        glow = ClickableSurfaceDefaults.glow(
            focusedGlow = Glow(elevationColor = YTFocusGlow, elevation = 12.dp),
        ),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                modifier = Modifier.size(iconSize),
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PlayerPillAction(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.height(40.dp),
        shape = ClickableSurfaceDefaults.shape(CircleShape),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.04f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.White.copy(alpha = 0.12f),
            focusedContainerColor = YTFocus,
            contentColor = YTTextPrimary,
            focusedContentColor = YTFocusInk,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, Color.White.copy(alpha = 0.12f))),
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxHeight()
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge.copy(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                ),
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
    focusRequester: FocusRequester,
) {
    var focused by remember { mutableStateOf(false) }
    val progress = if (duration > 0L) (currentPosition.toFloat() / duration.toFloat()).coerceIn(0f, 1f) else 0f
    val trackHeight by animateDpAsState(if (focused) 8.dp else 5.dp, label = "SeekTrackHeight")
    val thumbSize by animateDpAsState(if (focused) 18.dp else 12.dp, label = "SeekThumbSize")

    Surface(
        onClick = {},
        modifier = modifier
            .fillMaxWidth()
            .height(26.dp)
            .onFocusChanged { focused = it.isFocused }
            .focusRequester(focusRequester)
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            onSeek((currentPosition - 10_000L).coerceAtLeast(0L))
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            onSeek((currentPosition + 10_000L).coerceAtMost(duration))
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
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color.White.copy(alpha = 0.08f),
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border.None,
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus.copy(alpha = 0.7f))),
        ),
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 8.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            val usableWidth = maxWidth - thumbSize
            // Track
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(trackHeight)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.28f))
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(progress)
                        .fillMaxHeight()
                        .clip(CircleShape)
                        .background(ytProgressBrush)
                )
            }
            // Playhead Dot
            Box(
                Modifier
                    .offset(x = usableWidth * progress)
                    .size(thumbSize)
                    .clip(CircleShape)
                    .background(if (focused) YTFocus else YTBrandRed)
                    .then(
                        if (focused) Modifier.border(2.5.dp, YTBrandRed, CircleShape) else Modifier
                    )
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun AudioPickerOverlay(
    tracks: List<TvAudioTrackOption>,
    activePreference: AudioLanguagePreference,
    firstFocusRequester: FocusRequester,
    onSelectTrack: (TvAudioTrackOption) -> Unit,
    onSelectPreference: (AudioLanguagePreference) -> Unit,
    onClose: () -> Unit,
) {
    LaunchedEffect(Unit) {
        delay(80)
        try { firstFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.55f))
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown &&
                    keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_LEFT
                ) {
                    onClose()
                    true
                } else false
            },
        contentAlignment = Alignment.CenterEnd,
    ) {
        Column(
            modifier = Modifier
                .padding(end = 36.dp, top = 28.dp, bottom = 28.dp)
                .width(400.dp)
                .fillMaxHeight()
                .clip(RoundedCornerShape(20.dp))
                .background(YTSurfaceElevated.copy(alpha = 0.98f))
                .border(1.dp, YTBorder, RoundedCornerShape(20.dp))
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Audio track",
                        color = YTTextPrimary,
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                    )
                    Text(
                        text = when {
                            tracks.isEmpty() -> "Track selection will appear when playback starts"
                            tracks.size == 1 -> "1 audio track available"
                            else -> "${tracks.size} tracks available"
                        },
                        color = YTTextSecondary,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val activeIdx = tracks.indexOfFirst { it.isSelected }.let { if (it >= 0) it else 0 }
                tracks.forEachIndexed { idx, track ->
                    val subtitle = buildList {
                        track.language?.uppercase()?.let { add(it) }
                        if (track.bitrate > 0) add("${track.bitrate / 1000} kbps")
                    }.joinToString(" • ").takeIf { it.isNotBlank() }

                    AudioPickerRow(
                        title = track.displayName,
                        subtitle = subtitle,
                        selected = track.isSelected,
                        onClick = { onSelectTrack(track) },
                        modifier = if (idx == activeIdx) Modifier.focusRequester(firstFocusRequester) else Modifier,
                    )
                }

                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(YTBorderSubtle)
                )
                Spacer(Modifier.height(4.dp))

                Text(
                    text = "Default for all videos",
                    color = YTTextSecondary,
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                )

                AudioLanguagePreference.entries.forEachIndexed { idx, pref ->
                    val needsFocus = tracks.isEmpty() && idx == 0
                    AudioPickerRow(
                        title = pref.label,
                        subtitle = null,
                        selected = pref == activePreference,
                        onClick = { onSelectPreference(pref) },
                        modifier = if (needsFocus) Modifier.focusRequester(firstFocusRequester) else Modifier,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun AudioPickerRow(
    title: String,
    subtitle: String?,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    Surface(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { focused = it.isFocused },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(12.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.02f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (selected) Color.White.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.05f),
            focusedContainerColor = YTFocus,
            contentColor = YTTextPrimary,
            focusedContentColor = YTFocusInk,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(0.75.dp, if (selected) YTBorder else YTBorderSubtle)),
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
        ),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontSize = 14.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (focused) Color(0xFF333333) else YTTextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (selected) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    modifier = Modifier.size(18.dp),
                    tint = if (focused) YTFocusInk else YTBrandRed,
                )
            }
        }
    }
}

private fun formatTimeMs(ms: Long): String {
    val totalSeconds = (ms / 1000).coerceAtLeast(0L)
    val seconds = totalSeconds % 60
    val minutes = (totalSeconds / 60) % 60
    val hours = totalSeconds / 3600
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds)
    else "%02d:%02d".format(minutes, seconds)
}
