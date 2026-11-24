package com.kvtube.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil3.compose.AsyncImage
import com.kvtube.android.player.NowPlaying
import com.kvtube.android.ui.adaptive.LocalWindowState
import com.kvtube.android.ui.adaptive.WidthClass
import com.kvtube.android.ui.theme.LocalIsDarkGlassTheme
import com.kvtube.android.ui.theme.YTBrandRed
import com.kvtube.android.ui.theme.liquidGlassFloating
import kotlinx.coroutines.delay

/**
 * Compact bar shown above the bottom navigation while a video keeps playing
 * in the background (after navigating back from the watch page).
 */
@Composable
fun MiniPlayer(
    nowPlaying: NowPlaying,
    player: Player,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isPlaying by remember(player) { mutableStateOf(player.isPlaying) }
    var progress by remember(player) {
        val dur = player.duration.coerceAtLeast(1L)
        mutableFloatStateOf((player.currentPosition.toFloat() / dur).coerceIn(0f, 1f))
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    LaunchedEffect(player, isPlaying) {
        val dur = player.duration.coerceAtLeast(1L)
        progress = (player.currentPosition.toFloat() / dur).coerceIn(0f, 1f)
        while (isPlaying) {
            delay(500)
            val d = player.duration.coerceAtLeast(1L)
            progress = (player.currentPosition.toFloat() / d).coerceIn(0f, 1f)
        }
    }

    val cardShape = RoundedCornerShape(20.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(cardShape)
            .liquidGlassFloating(shape = cardShape)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp)
                .clickable { onOpen() }
                .padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .width(84.dp)
                    .fillMaxHeight()
                    .padding(vertical = 8.dp)
            ) {
                AsyncImage(
                    model = nowPlaying.thumbnail.ifBlank {
                        com.kvtube.android.data.local.ThumbnailRouter.video(nowPlaying.videoId)
                    },
                    contentDescription = nowPlaying.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.Black)
                        .border(
                            0.5.dp,
                            MaterialTheme.colorScheme.outlineVariant,
                            RoundedCornerShape(10.dp)
                        )
                )
            }

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = nowPlaying.title.ifBlank { "Now playing" },
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp, fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (nowPlaying.channelTitle.isNotBlank()) {
                    Text(
                        text = nowPlaying.channelTitle,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            IconButton(onClick = { if (isPlaying) player.pause() else player.play() }) {
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(26.dp)
                )
            }

            IconButton(onClick = onClose) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Close player",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(22.dp)
                )
            }
        }

        // Progress track sits cleanly inside the bottom edge so the top specular rim is unbroken
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.dp)
                .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress.coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .background(YTBrandRed)
            )
        }
    }
}

/**
 * Floating 16:9 YouTube-style Liquid Glass video mini-player card used on wide windows
 * (unfolded foldables and tablets), anchored at bottom-right.
 */
@Composable
fun FloatingMiniPlayer(
    nowPlaying: NowPlaying,
    player: Player,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isPlaying by remember(player) { mutableStateOf(player.isPlaying) }
    var progress by remember(player) {
        val dur = player.duration.coerceAtLeast(1L)
        mutableFloatStateOf((player.currentPosition.toFloat() / dur).coerceIn(0f, 1f))
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    LaunchedEffect(player, isPlaying) {
        val dur = player.duration.coerceAtLeast(1L)
        progress = (player.currentPosition.toFloat() / dur).coerceIn(0f, 1f)
        while (isPlaying) {
            delay(500)
            val d = player.duration.coerceAtLeast(1L)
            progress = (player.currentPosition.toFloat() / d).coerceIn(0f, 1f)
        }
    }

    val windowState = LocalWindowState.current
    val cardWidth = if (windowState.widthClass == WidthClass.Expanded) 356.dp else 312.dp
    val cardShape = RoundedCornerShape(16.dp)
    val isDarkGlass = LocalIsDarkGlassTheme.current

    Column(
        modifier = modifier
            .width(cardWidth)
            .clip(cardShape)
            .liquidGlassFloating(shape = cardShape)
    ) {
        // 16:9 live video canvas with top overlay Expand & Close actions
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black)
                .clickable { onOpen() }
        ) {
            AsyncImage(
                model = nowPlaying.thumbnail.ifBlank {
                    com.kvtube.android.data.local.ThumbnailRouter.video(nowPlaying.videoId)
                },
                contentDescription = nowPlaying.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        this.player = player
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                        setKeepContentOnPlayerReset(true)
                        setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                        setShowNextButton(false)
                        setShowPreviousButton(false)
                    }
                },
                update = { view ->
                    if (view.player !== player) {
                        view.player = player
                    }
                },
                onRelease = { view -> view.player = null },
                modifier = Modifier.fillMaxSize()
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .align(Alignment.TopCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Black.copy(alpha = 0.58f),
                                Color.Transparent
                            )
                        )
                    )
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .padding(horizontal = 6.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onOpen,
                    modifier = Modifier
                        .size(32.dp)
                        .background(Color.Black.copy(alpha = 0.45f), CircleShape)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Fullscreen,
                        contentDescription = "Expand player",
                        tint = Color.White,
                        modifier = Modifier.size(19.dp)
                    )
                }

                IconButton(
                    onClick = onClose,
                    modifier = Modifier
                        .size(32.dp)
                        .background(Color.Black.copy(alpha = 0.45f), CircleShape)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Close player",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }

        // Flush red playback progress bar beneath the 16:9 video frame
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.5.dp)
                .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(progress.coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .background(YTBrandRed)
            )
        }

        // Bottom info row: 1-line title + channel on left, Play/Pause circle button on right
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onOpen() }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = nowPlaying.title,
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (nowPlaying.channelTitle.isNotBlank()) {
                    Text(
                        text = nowPlaying.channelTitle,
                        fontSize = 11.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            IconButton(
                onClick = { if (isPlaying) player.pause() else player.play() },
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        if (isDarkGlass) Color.White.copy(alpha = 0.14f)
                        else Color.Black.copy(alpha = 0.08f),
                        CircleShape
                    )
            ) {
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}
