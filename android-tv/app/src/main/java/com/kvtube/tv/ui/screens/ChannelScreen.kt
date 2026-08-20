package com.kvtube.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.kvtube.tv.data.model.InvidiousChannel
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import com.kvtube.tv.ui.components.YtTvVideoCard
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.text.style.TextOverflow

private fun formatCount(n: Long): String = when {
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
    val scope = rememberCoroutineScope()
    var channel by remember { mutableStateOf<InvidiousChannel?>(null) }
    var videos by remember { mutableStateOf<List<TvVideo>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val repo = remember { InvidiousRepository() }

    LaunchedEffect(channelId) {
        loading = true; error = null
        scope.launch {
            try {
                channel = repo.channel(channelId)
                videos = repo.channelVideos(channelId)
            } catch (e: Exception) { error = e.message } finally { loading = false }
        }
    }

    if (loading) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Loading channel…") }; return }
    error?.let { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(it, color = MaterialTheme.colorScheme.error) }; return }

    // Full YouTube TV channel layout - banner + avatar header + full-width video grid
    TvLazyColumn(Modifier.fillMaxSize().background(Color(0xFF0F0F0F)), contentPadding = PaddingValues(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        // Banner (like YouTube channel banner)
        channel?.authorBanners?.firstOrNull()?.url?.let { bannerUrl ->
            item {
                AsyncImage(
                    model = bannerUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth().height(160.dp),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop
                )
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                AsyncImage(
                    model = channel?.authorThumbnails?.lastOrNull()?.url,
                    contentDescription = null,
                    modifier = Modifier.size(88.dp).clip(RoundedCornerShape(44.dp)).background(Color(0xFF2A2A2A))
                )
                Column(Modifier.weight(1f)) {
                    Text(channel?.author ?: channelId, color = Color.White, style = MaterialTheme.typography.headlineSmall.copy(color = Color.White))
                    channel?.let { c ->
                        Text(
                            listOfNotNull(
                                c.subCount?.let { formatCount(it) + " subscribers" },
                                c.totalViews?.let { formatCount(it) + " views" }
                            ).joinToString(" • "),
                            color = Color(0xFFAAAAAA),
                            style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFFAAAAAA))
                        )
                    }
                    if (!channel?.description.isNullOrBlank()) {
                        Text(channel?.description ?: "", color = Color(0xFFE0E0E0), maxLines = 2, style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFFE0E0E0)), modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
        }
        item {
            Text("Videos", color = Color.White, style = MaterialTheme.typography.titleLarge.copy(color = Color.White), modifier = Modifier.padding(horizontal = 32.dp, vertical = 12.dp))
        }
        if (videos.isEmpty()) {
            item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { Text("No videos.", color = Color(0xFFAAAAAA)) } }
        } else {
            // Grid-like rows of 4 - full width, fills entire TV page
            items(videos.chunked(4).size) { idx ->
                val row = videos.chunked(4)[idx]
                TvLazyRow(
                    contentPadding = PaddingValues(horizontal = 32.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(row, key = { it.id }) { v -> YtTvVideoCard(video = v, onClick = { onVideoClick(v.id) }) }
                }
            }
        }
    }
}
