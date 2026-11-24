package com.kvtube.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.*
import coil.compose.AsyncImage
import com.kvtube.tv.ui.components.YtChannelAvatar
import com.kvtube.tv.ui.components.YtShelfSkeleton
import com.kvtube.tv.ui.components.YtTvVideoRowCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBorderSubtle
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTSurface
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.ui.theme.ytExponentialScrimStops
import com.kvtube.tv.viewmodel.DetailViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DetailScreen(
    videoId: String,
    onPlay: (String) -> Unit,
    onVideoClick: (String) -> Unit = {},
    onChannel: (String) -> Unit = {},
    vm: DetailViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()
    val heroPlayRequester = remember { FocusRequester() }
    LaunchedEffect(videoId) { vm.load(videoId) }
    LaunchedEffect(state.video) {
        if (state.video != null) try { heroPlayRequester.requestFocus() } catch (_: Exception) {}
    }

    if (state.isLoading) {
        Column(
            Modifier
                .fillMaxSize()
                .background(YTBackground)
                .padding(top = 28.dp)
        ) {
            YtShelfSkeleton(showHeading = false, cardCount = 2)
        }
        return
    }

    state.error?.let { err ->
        val isInvidiousBroken = err.contains("This content isn't available", ignoreCase = true)
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
                Text(err, color = Color(0xFFFF8A80), style = MaterialTheme.typography.titleSmall)
                Text(
                    text = if (isInvidiousBroken) {
                        "This video failed on the server, and direct playback also failed. Try another video."
                    } else {
                        "The server (${com.kvtube.tv.data.api.ApiClient.baseUrl}) may be unavailable. Try another video or check Settings."
                    },
                    color = YTTextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                )
                Button(
                    onClick = { vm.load(videoId) },
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
        return
    }

    val v = state.video ?: return
    val tv = state.tvVideo ?: return

    Row(
        Modifier
            .fillMaxSize()
            .background(YTBackground)
            .padding(horizontal = 36.dp, vertical = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        Column(Modifier.weight(1.55f)) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(YTSurface)
                    .border(0.75.dp, YTBorderSubtle, RoundedCornerShape(14.dp))
            ) {
                AsyncImage(
                    model = tv.thumbnail.replace("mqdefault", "hqdefault"),
                    contentDescription = tv.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                *ytExponentialScrimStops(
                                    baseColor = YTBackground,
                                    startFraction = 0.45f,
                                    endFraction = 1.0f,
                                    maxAlpha = 0.85f,
                                )
                            )
                        )
                )
                if (tv.duration.isNotBlank()) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(12.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(Color(0xD90F0F0F))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(tv.duration, color = YTTextPrimary, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            Text(
                text = tv.title,
                color = YTTextPrimary,
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                ),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Spacer(Modifier.height(12.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                YtChannelAvatar(
                    url = v.authorThumbnails.firstOrNull()?.url,
                    name = tv.channelTitle,
                    size = 40.dp,
                )
                Column(Modifier.weight(1f)) {
                    Text(
                        text = tv.channelTitle,
                        color = YTTextPrimary,
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        text = listOfNotNull(tv.viewsText, tv.publishedText).joinToString(" • "),
                        color = YTTextSecondary,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = { onPlay(tv.id) },
                    modifier = Modifier.focusRequester(heroPlayRequester),
                    shape = ButtonDefaults.shape(CircleShape),
                    colors = ButtonDefaults.colors(
                        containerColor = YTFocus,
                        contentColor = YTFocusInk,
                        focusedContainerColor = Color.White,
                        focusedContentColor = Color.Black,
                    ),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Play on TV", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
                    }
                }
                Button(
                    onClick = { v.authorId?.let(onChannel) },
                    shape = ButtonDefaults.shape(CircleShape),
                    colors = ButtonDefaults.colors(
                        containerColor = YTChip,
                        contentColor = YTTextPrimary,
                        focusedContainerColor = YTFocus,
                        focusedContentColor = YTFocusInk,
                    ),
                ) {
                    Text("View channel", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
                }
            }
        }

        Column(Modifier.weight(1f).fillMaxHeight()) {
            val upNext = state.related.take(20)
            Text(
                text = "More videos",
                color = YTTextPrimary,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                ),
                modifier = Modifier.padding(bottom = 10.dp),
            )
            if (upNext.isEmpty()) {
                Text("No recommendations.", color = YTTextSecondary, style = MaterialTheme.typography.bodyMedium)
            } else {
                TvLazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 4.dp),
                ) {
                    items(upNext, key = { it.id }) { rv ->
                        YtTvVideoRowCard(video = rv, onClick = { onVideoClick(rv.id) })
                    }
                }
            }
        }
    }
}
