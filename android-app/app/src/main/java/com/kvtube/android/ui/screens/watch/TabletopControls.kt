package com.kvtube.android.ui.screens.watch

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.kvtube.android.ui.theme.KVTubeTheme
import com.kvtube.android.ui.theme.YTBrandRed
import kotlinx.coroutines.delay

/**
 * YouTube-style Flex / Tabletop lower-half control sheet shown when a foldable
 * is half-opened horizontally, keeping the upper half unobstructed for video.
 */
@Composable
fun TabletopVideoControls(
    player: ExoPlayer,
    title: String,
    channelName: String,
    hasNext: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onFullscreen: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isPlaying by remember(player) { mutableStateOf(player.isPlaying) }
    var isEnded by remember(player) { mutableStateOf(player.playbackState == Player.STATE_ENDED) }
    var currentPosition by remember(player) { mutableLongStateOf(player.currentPosition.coerceAtLeast(0L)) }
    var duration by remember(player) { mutableLongStateOf(player.duration.coerceAtLeast(1L)) }
    var isMuted by remember(player) { mutableStateOf(player.volume == 0f) }
    var isScrubbing by remember { mutableStateOf(false) }
    var scrubFraction by remember { mutableFloatStateOf(0f) }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                isEnded = playbackState == Player.STATE_ENDED
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    LaunchedEffect(player, isPlaying) {
        currentPosition = player.currentPosition.coerceAtLeast(0L)
        duration = player.duration.coerceAtLeast(1L)
        while (isPlaying) {
            delay(250)
            if (!isScrubbing) {
                currentPosition = player.currentPosition.coerceAtLeast(0L)
                duration = player.duration.coerceAtLeast(1L)
            }
        }
    }

    val liveFraction = (currentPosition.toFloat() / duration.coerceAtLeast(1L).toFloat()).coerceIn(0f, 1f)
    val sliderFraction = if (isScrubbing) scrubFraction else liveFraction
    val displayPos = if (isScrubbing) (scrubFraction * duration).toLong() else currentPosition

    TabletopVideoControlsBody(
        title = title,
        channelName = channelName,
        isPlaying = isPlaying,
        isEnded = isEnded,
        isMuted = isMuted,
        hasNext = hasNext,
        sliderFraction = sliderFraction,
        positionLabel = "${formatTabletopDuration(displayPos)} / ${formatTabletopDuration(duration)}",
        onPrevious = {
            if (player.currentPosition > 3_000L) {
                player.seekTo(0L)
                currentPosition = 0L
            } else {
                onPrevious()
            }
        },
        onReplay10 = {
            val target = (player.currentPosition - 10_000L).coerceAtLeast(0L)
            player.seekTo(target)
            currentPosition = target
        },
        onPlayPause = {
            if (isEnded) {
                player.seekTo(0L)
                player.play()
                isEnded = false
            } else if (isPlaying) {
                player.pause()
            } else {
                player.play()
            }
        },
        onForward10 = {
            val maxDur = player.duration.coerceAtLeast(1L)
            val target = (player.currentPosition + 10_000L).coerceAtMost(maxDur)
            player.seekTo(target)
            currentPosition = target
        },
        onNext = onNext,
        onScrub = { fraction ->
            isScrubbing = true
            scrubFraction = fraction.coerceIn(0f, 1f)
        },
        onScrubFinished = {
            val target = (scrubFraction * duration).toLong().coerceIn(0L, duration)
            player.seekTo(target)
            currentPosition = target
            isScrubbing = false
        },
        onToggleMute = {
            isMuted = !isMuted
            player.volume = if (isMuted) 0f else 1f
        },
        onFullscreen = onFullscreen,
        onClose = onClose,
        modifier = modifier
    )
}

@Composable
private fun TabletopVideoControlsBody(
    title: String,
    channelName: String,
    isPlaying: Boolean,
    isEnded: Boolean,
    isMuted: Boolean,
    hasNext: Boolean,
    sliderFraction: Float,
    positionLabel: String,
    onPrevious: () -> Unit,
    onReplay10: () -> Unit,
    onPlayPause: () -> Unit,
    onForward10: () -> Unit,
    onNext: () -> Unit,
    onScrub: (Float) -> Unit,
    onScrubFinished: () -> Unit,
    onToggleMute: () -> Unit,
    onFullscreen: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 36.dp, height = 4.dp)
                        .background(
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            RoundedCornerShape(2.dp)
                        )
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Video controls",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                IconButton(onClick = onClose, modifier = Modifier.size(36.dp)) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Hide video controls",
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.SpaceEvenly,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = title.ifBlank { "Now playing" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (channelName.isNotBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = channelName,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onPrevious, modifier = Modifier.size(48.dp)) {
                        Icon(
                            imageVector = Icons.Filled.SkipPrevious,
                            contentDescription = "Previous",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(30.dp)
                        )
                    }
                    IconButton(onClick = onReplay10, modifier = Modifier.size(52.dp)) {
                        Icon(
                            imageVector = Icons.Filled.Replay10,
                            contentDescription = "Rewind 10 seconds",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(34.dp)
                        )
                    }
                    IconButton(onClick = onPlayPause, modifier = Modifier.size(72.dp)) {
                        Icon(
                            imageVector = when {
                                isEnded -> Icons.Filled.Replay
                                isPlaying -> Icons.Filled.Pause
                                else -> Icons.Filled.PlayArrow
                            },
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(52.dp)
                        )
                    }
                    IconButton(onClick = onForward10, modifier = Modifier.size(52.dp)) {
                        Icon(
                            imageVector = Icons.Filled.Forward10,
                            contentDescription = "Forward 10 seconds",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(34.dp)
                        )
                    }
                    IconButton(
                        onClick = onNext,
                        enabled = hasNext,
                        modifier = Modifier
                            .size(48.dp)
                            .alpha(if (hasNext) 1f else 0.35f)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.SkipNext,
                            contentDescription = "Next video",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(30.dp)
                        )
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = positionLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onToggleMute, modifier = Modifier.size(34.dp)) {
                            Icon(
                                imageVector = if (isMuted) Icons.AutoMirrored.Filled.VolumeOff
                                else Icons.AutoMirrored.Filled.VolumeUp,
                                contentDescription = if (isMuted) "Unmute" else "Mute",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        IconButton(onClick = onFullscreen, modifier = Modifier.size(34.dp)) {
                            Icon(
                                imageVector = Icons.Filled.Fullscreen,
                                contentDescription = "Fullscreen",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }
                Slider(
                    value = sliderFraction.coerceIn(0f, 1f),
                    onValueChange = onScrub,
                    onValueChangeFinished = onScrubFinished,
                    modifier = Modifier.fillMaxWidth(),
                    colors = SliderDefaults.colors(
                        thumbColor = YTBrandRed,
                        activeTrackColor = YTBrandRed,
                        inactiveTrackColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.25f)
                    )
                )
            }
        }
    }
}

private fun formatTabletopDuration(ms: Long): String {
    val totalSeconds = (ms / 1000).coerceAtLeast(0L)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    val hours = minutes / 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes % 60, seconds)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}

@Preview(name = "Tabletop", widthDp = 883, heightDp = 360, showBackground = true)
@Composable
private fun TabletopVideoControlsPreview() {
    KVTubeTheme(themeMode = "dark") {
        TabletopVideoControlsBody(
            title = "Sample Foldable Video Title That Wraps Cleanly Across Two Lines",
            channelName = "KV-Tube Channel",
            isPlaying = true,
            isEnded = false,
            isMuted = false,
            hasNext = true,
            sliderFraction = 0.28f,
            positionLabel = "0:18 / 1:08:37",
            onPrevious = {},
            onReplay10 = {},
            onPlayPause = {},
            onForward10 = {},
            onNext = {},
            onScrub = {},
            onScrubFinished = {},
            onToggleMute = {},
            onFullscreen = {},
            onClose = {}
        )
    }
}
