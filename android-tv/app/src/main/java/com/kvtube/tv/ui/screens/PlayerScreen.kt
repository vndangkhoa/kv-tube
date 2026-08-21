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
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
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
    
    val exo = remember { 
        ExoPlayer.Builder(ctx)
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

    LaunchedEffect(state.video) {
        val v = state.video ?: return@LaunchedEffect
        val url = vm.bestStreamUrl(v) ?: return@LaunchedEffect
        val mime = vm.bestMime(url)
        
        val item = MediaItem.Builder().setUri(url).setMimeType(mime).build()
        exo.setMediaItem(item)
        exo.prepare()
        exo.playWhenReady = true
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
            state.error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(state.error ?: "Error", color = MaterialTheme.colorScheme.error) }
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
                
                // Controls Overlay
                AnimatedVisibility(
                    visible = showControls,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Re-request focus when visibility changes to TRUE
                    LaunchedEffect(Unit) {
                        try { playButtonFocusRequester.requestFocus() } catch (_: Exception) {}
                    }

                    PlayerControlsOverlay(
                        videoTitle = state.video?.title ?: "",
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
        // Top Bar: Back button and Title
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
                modifier = Modifier.focusProperties { 
                    down = playButtonFocusRequester
                }
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
        }

        // Center Controls
        Row(
            modifier = Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(56.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ControlIconButton(
                icon = Icons.Default.Replay10,
                onClick = onRewind,
                size = 64.dp,
                modifier = Modifier.focusProperties { 
                    up = backButtonFocusRequester
                    down = seekBarFocusRequester
                }
            )
            
            ControlIconButton(
                icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                onClick = onPlayPause,
                isPrimary = true,
                focusRequester = playButtonFocusRequester,
                modifier = Modifier.focusProperties { 
                    up = backButtonFocusRequester
                    down = seekBarFocusRequester
                }
            )

            ControlIconButton(
                icon = Icons.Default.Forward10,
                onClick = onForward,
                size = 64.dp,
                modifier = Modifier.focusProperties { 
                    up = backButtonFocusRequester
                    down = seekBarFocusRequester
                }
            )
        }

        // Bottom Seek Bar
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
                modifier = Modifier.focusProperties { 
                    up = playButtonFocusRequester
                }.padding(vertical = 4.dp)
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
