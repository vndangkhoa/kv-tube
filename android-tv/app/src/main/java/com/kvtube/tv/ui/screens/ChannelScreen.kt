package com.kvtube.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.kvtube.tv.data.model.InvidiousChannel
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import com.kvtube.tv.ui.components.YtChannelAvatar
import com.kvtube.tv.ui.components.YtShelfSkeleton
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBorder
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTSurfaceElevated
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.ui.theme.ytExponentialScrimStops
import com.kvtube.tv.viewmodel.PlayerViewModel

private fun formatCount(n: Long): String = when {
    n >= 1_000_000_000 -> String.format("%.1fB", n / 1_000_000_000.0)
    n >= 1_000_000 -> String.format("%.1fM", n / 1_000_000.0)
    n >= 1_000 -> String.format("%.1fK", n / 1_000.0)
    else -> n.toString()
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ChannelScreen(
    channelId: String,
    onVideoClick: (String) -> Unit,
) {
    var channel by remember { mutableStateOf<InvidiousChannel?>(null) }
    var videos by remember { mutableStateOf<List<TvVideo>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }
    val repo = remember { InvidiousRepository() }
    val preview = remember(channelId) { PlayerViewModel.getChannelPreview(channelId) }

    LaunchedEffect(channelId, reloadKey) {
        loading = true
        error = null
        try {
            channel = repo.channel(channelId)
            val chanVideos = repo.channelVideos(channelId)
            videos = if (chanVideos.isNotEmpty()) {
                chanVideos
            } else {
                val query = channel?.author?.takeIf { it.isNotBlank() } ?: preview?.channelTitle
                if (!query.isNullOrBlank()) {
                    val searched = repo.search(query, region = "VN")
                    val exact = searched.filter { it.channelId == channelId }
                    if (exact.size >= 4) exact else (exact + searched).distinctBy { it.id }.take(18)
                } else {
                    emptyList()
                }
            }
        } catch (e: Exception) {
            error = e.message ?: "Failed to load channel"
        } finally {
            loading = false
        }
    }

    if (loading) {
        Column(
            Modifier
                .fillMaxSize()
                .background(YTBackground)
                .padding(top = 28.dp)
        ) {
            YtShelfSkeleton(showHeading = true, cardCount = 3)
            YtShelfSkeleton(showHeading = false, cardCount = 3)
        }
        return
    }

    error?.let { errMsg ->
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
                Text(errMsg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleMedium)
                Button(
                    onClick = { reloadKey++ },
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

    TvLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(YTBackground),
        contentPadding = PaddingValues(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        // Cinema Channel Banner with 14-stop exponential bottom blend into #0F0F0F
        val bannerUrl = channel?.authorBanners?.firstOrNull()?.url
        if (!bannerUrl.isNullOrBlank()) {
            item(key = "channel_banner") {
                Box(Modifier.fillMaxWidth().height(176.dp)) {
                    AsyncImage(
                        model = bannerUrl,
                        contentDescription = null,
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
                                        startFraction = 0.25f,
                                        endFraction = 1.0f,
                                        maxAlpha = 1.0f,
                                    )
                                )
                            )
                    )
                }
            }
        }

        // Channel Identity Header
        item(key = "channel_header") {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 36.dp, vertical = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                val avatarUrl = channel?.authorThumbnails?.lastOrNull()?.url?.takeIf { it.isNotBlank() }
                    ?: preview?.avatarUrl
                val displayName = channel?.author?.takeIf { it.isNotBlank() }
                    ?: preview?.channelTitle?.takeIf { it.isNotBlank() }
                    ?: channelId
                Box(
                    Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(YTSurfaceElevated)
                        .border(1.5.dp, YTBorder, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    YtChannelAvatar(url = avatarUrl, name = displayName, size = 80.dp)
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        text = displayName,
                        color = YTTextPrimary,
                        style = MaterialTheme.typography.headlineLarge.copy(
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                    )
                    Spacer(Modifier.height(4.dp))
                    channel?.let { c ->
                        Text(
                            text = listOfNotNull(
                                c.subCount?.let { "${formatCount(it)} subscribers" },
                                c.totalViews?.let { "${formatCount(it)} views" },
                            ).joinToString(" • "),
                            color = YTTextSecondary,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } ?: run {
                        if (videos.isNotEmpty()) {
                            Text(
                                text = "${videos.size} videos",
                                color = YTTextSecondary,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                    if (!channel?.description.isNullOrBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = channel?.description ?: "",
                            color = androidx.compose.ui.graphics.Color(0xFFD0D0D0),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }

        item(key = "channel_videos_heading") {
            Text(
                text = "Videos",
                color = YTTextPrimary,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                ),
                modifier = Modifier.padding(start = 36.dp, top = 6.dp, bottom = 2.dp),
            )
        }

        if (videos.isEmpty()) {
            item(key = "channel_empty") {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(36.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("No videos found on this channel.", color = YTTextSecondary)
                }
            }
        } else {
            val rows = videos.chunked(3)
            items(rows.size, key = { "chan_row_$it" }) { idx ->
                val row = rows[idx]
                TvLazyRow(
                    contentPadding = PaddingValues(horizontal = 36.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(row, key = { it.id }) { v ->
                        YtTvVideoCard(
                            video = v,
                            onClick = { onVideoClick(v.id) },
                        )
                    }
                }
            }
        }
    }
}
