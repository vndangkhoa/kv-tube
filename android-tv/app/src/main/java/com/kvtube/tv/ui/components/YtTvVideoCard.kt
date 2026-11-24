package com.kvtube.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBorderSubtle
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusGlow
import com.kvtube.tv.ui.theme.YTLiveRed
import com.kvtube.tv.ui.theme.YTSurface
import com.kvtube.tv.ui.theme.YTSurfaceElevated
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.ui.theme.ytExponentialScrimStops
import com.kvtube.tv.ui.theme.ytProgressBrush
import com.kvtube.tv.viewmodel.PlayerViewModel
import kotlinx.coroutines.delay

/**
 * Google YouTube for Android TV 8.03.300 standard video tile:
 * - Signature concentric `#F1F1F1` focus ring wraps ONLY the 16:9 thumbnail (`15.dp` outer /
 *   `3.5.dp` `#0F0F0F` gap / `11.dp` inner), leaving title & channel metadata clean below.
 * - Duration / LIVE badges & `#FF0033 -> #FF2791` watch progress bar match Kabuki specs.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtTvVideoCard(
    video: TvVideo,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    cardWidth: Dp = 262.dp,
    showChannel: Boolean = true,
    progressFraction: Float? = null,
) {
    var isFocused by remember { mutableStateOf(false) }
    LaunchedEffect(isFocused) {
        if (isFocused && video.id.isNotBlank()) {
            PlayerViewModel.putPreview(video)
            delay(120)
            PlayerViewModel.prefetch(video.id)
        }
    }

    Card(
        onClick = {
            PlayerViewModel.putPreview(video)
            onClick()
        },
        modifier = modifier
            .width(cardWidth)
            .onFocusChanged { isFocused = it.isFocused },
        shape = CardDefaults.shape(RoundedCornerShape(15.dp)),
        scale = CardDefaults.scale(focusedScale = 1.05f),
        border = CardDefaults.border(focusedBorder = Border.None),
        glow = CardDefaults.glow(focusedGlow = Glow.None),
        colors = CardDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color.Transparent,
        ),
    ) {
        Column(Modifier.fillMaxWidth()) {
            // Concentric YouTube TV thumbnail ring (permanent 4dp padding prevents focus shift)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(15.dp))
                    .then(
                        if (isFocused) {
                            Modifier.border(2.5.dp, YTFocus, RoundedCornerShape(15.dp))
                        } else {
                            Modifier
                        }
                    )
                    .padding(4.dp)
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(11.dp))
                        .background(YTSurface)
                        .border(0.75.dp, YTBorderSubtle, RoundedCornerShape(11.dp))
                ) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(video.thumbnail)
                            .crossfade(false)
                            .build(),
                        contentDescription = video.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )

                    if (video.isLive) {
                        YtLiveBadge(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(7.dp)
                        )
                    } else if (video.duration.isNotBlank()) {
                        Box(
                            Modifier
                                .align(Alignment.BottomEnd)
                                .padding(7.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(0xD90F0F0F))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = video.duration,
                                color = YTTextPrimary,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                ),
                            )
                        }
                    }

                    if (progressFraction != null && progressFraction > 0.01f) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(3.dp)
                                .align(Alignment.BottomStart)
                                .background(Color.White.copy(alpha = 0.28f))
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(progressFraction.coerceIn(0f, 1f))
                                    .fillMaxHeight()
                                    .background(ytProgressBrush)
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                if (showChannel) {
                    YtChannelAvatar(url = video.avatarUrl, name = video.channelTitle, size = 32.dp)
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        text = video.title,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        color = if (isFocused) YTTextPrimary else Color(0xFFE6E6E6),
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontSize = 13.5.sp,
                            lineHeight = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                        ),
                    )
                    if (showChannel) {
                        Spacer(Modifier.height(3.dp))
                        Text(
                            text = buildString {
                                append(video.channelTitle)
                                video.viewsText?.let { append(" • "); append(it) }
                                video.publishedText?.let {
                                    if (it.isNotBlank()) {
                                        append(" • ")
                                        append(it)
                                    }
                                }
                            },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            color = if (isFocused) Color(0xFFCCCCCC) else YTTextSecondary,
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
internal fun YtChannelAvatar(url: String?, name: String, size: Dp) {
    if (!url.isNullOrBlank()) {
        AsyncImage(
            model = ImageRequest.Builder(LocalContext.current)
                .data(url)
                .crossfade(false)
                .build(),
            contentDescription = null,
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(YTSurfaceElevated),
            contentScale = ContentScale.Crop,
        )
    } else {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(Color(0xFF2E2E2E)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = name.take(1).uppercase(),
                color = YTTextPrimary,
                fontSize = (size.value * 0.42f).sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
internal fun YtLiveBadge(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(YTLiveRed)
            .padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(
            Modifier
                .size(5.dp)
                .clip(CircleShape)
                .background(Color.White)
        )
        Text(
            text = "LIVE",
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.4.sp,
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtTvVideoRowCard(
    video: TvVideo,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var isFocused by remember { mutableStateOf(false) }
    LaunchedEffect(isFocused) {
        if (isFocused && video.id.isNotBlank()) {
            PlayerViewModel.putPreview(video)
            delay(120)
            PlayerViewModel.prefetch(video.id)
        }
    }

    Card(
        onClick = {
            PlayerViewModel.putPreview(video)
            onClick()
        },
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
        shape = CardDefaults.shape(RoundedCornerShape(10.dp)),
        scale = CardDefaults.scale(focusedScale = 1.03f),
        border = CardDefaults.border(
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus.copy(alpha = 0.85f))),
        ),
        colors = CardDefaults.colors(
            containerColor = YTSurface,
            focusedContainerColor = YTSurfaceElevated,
        ),
    ) {
        Row(
            Modifier
                .padding(8.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier
                    .width(116.dp)
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(6.dp))
                    .background(YTSurfaceElevated)
            ) {
                AsyncImage(
                    model = video.thumbnail,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
                if (video.isLive) {
                    YtLiveBadge(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(3.dp)
                    )
                } else if (video.duration.isNotBlank()) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(3.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color(0xD90F0F0F))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    ) {
                        Text(
                            video.duration,
                            color = YTTextPrimary,
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    text = video.title,
                    color = YTTextPrimary,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        lineHeight = 17.sp,
                    ),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    text = listOfNotNull(
                        video.channelTitle.takeIf { it.isNotBlank() },
                        video.viewsText,
                        video.publishedText?.takeIf { it.isNotBlank() },
                    ).joinToString(" • "),
                    color = if (isFocused) Color(0xFFCCCCCC) else YTTextSecondary,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtTvHeroCard(
    video: TvVideo,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var isFocused by remember { mutableStateOf(false) }
    LaunchedEffect(isFocused) {
        if (isFocused && video.id.isNotBlank()) {
            PlayerViewModel.putPreview(video)
            delay(120)
            PlayerViewModel.prefetch(video.id)
        }
    }

    Card(
        onClick = {
            PlayerViewModel.putPreview(video)
            onClick()
        },
        modifier = modifier
            .width(412.dp)
            .height(232.dp)
            .onFocusChanged { isFocused = it.isFocused },
        shape = CardDefaults.shape(RoundedCornerShape(17.dp)),
        scale = CardDefaults.scale(focusedScale = 1.035f),
        border = CardDefaults.border(focusedBorder = Border.None),
        glow = CardDefaults.glow(focusedGlow = Glow.None),
        colors = CardDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color.Transparent,
        ),
    ) {
        // Concentric YouTube TV spotlight ring
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(17.dp))
                .then(
                    if (isFocused) {
                        Modifier.border(2.5.dp, YTFocus, RoundedCornerShape(17.dp))
                    } else {
                        Modifier
                    }
                )
                .padding(4.dp)
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(13.dp))
                    .background(YTSurface)
                    .border(0.75.dp, YTBorderSubtle, RoundedCornerShape(13.dp))
            ) {
                AsyncImage(
                    model = video.thumbnail.replace("mqdefault.jpg", "hqdefault.jpg"),
                    contentDescription = video.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )

                // 14-stop exponential #0F0F0F bottom scrim: leaves top 45% clear and vivid
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                *ytExponentialScrimStops(
                                    baseColor = YTBackground,
                                    startFraction = 0.28f,
                                    endFraction = 1.0f,
                                    maxAlpha = 0.94f,
                                )
                            )
                        )
                )

                if (video.isLive) {
                    YtLiveBadge(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(12.dp)
                    )
                } else if (video.duration.isNotBlank()) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(12.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(Color(0xD90F0F0F))
                            .padding(horizontal = 7.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = video.duration,
                            color = YTTextPrimary,
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                            ),
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    YtChannelAvatar(url = video.avatarUrl, name = video.channelTitle, size = 34.dp)
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = video.title,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            color = YTTextPrimary,
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontSize = 16.sp,
                                lineHeight = 21.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                        Spacer(Modifier.height(3.dp))
                        Text(
                            text = buildString {
                                append(video.channelTitle)
                                video.viewsText?.let { append(" • "); append(it) }
                                video.publishedText?.let {
                                    if (it.isNotBlank()) {
                                        append(" • ")
                                        append(it)
                                    }
                                }
                            },
                            color = Color(0xFFD0D0D0),
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}
