package com.kvtube.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.*
import coil.compose.AsyncImage
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.components.YtTvVideoRowCard
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
    LaunchedEffect(state.video) { if (state.video != null) try { heroPlayRequester.requestFocus() } catch (_: Exception) {} }

    if (state.isLoading) {
        Box(Modifier.fillMaxSize().background(Color(0xFF0F0F0F)), contentAlignment = Alignment.Center) { Text("Loading…", color = Color.White) }
        return
    }
    state.error?.let {
        Box(Modifier.fillMaxSize().background(Color(0xFF0F0F0F)).padding(32.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(it, color = Color(0xFFFF8A80), style = MaterialTheme.typography.titleSmall)
                Text("The Invidious backend (https://yt.khoavo.myds.me) may be rate-limiting or the companion is restarting. Try another video.", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                Button(onClick = { vm.load(videoId) }) { Text("Retry") }
            }
        }
        return
    }
    val v = state.video ?: return
    val tv = state.tvVideo ?: return

    Row(Modifier.fillMaxSize().background(Color(0xFF0F0F0F)).padding(horizontal = 32.dp, vertical = 24.dp), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
        // Left: hero + meta + actions
        Column(Modifier.weight(1.6f)) {
            Box(
                Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(12.dp)).background(Color(0xFF1A1A1A))
            ) {
                AsyncImage(model = tv.thumbnail.replace("mqdefault", "hqdefault"), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                Box(Modifier.align(Alignment.Center).clip(RoundedCornerShape(24.dp)).background(Color.White.copy(0.9f))) {
                    Button(onClick = { onPlay(tv.id) }, modifier = Modifier.padding(horizontal = 4.dp).focusRequester(heroPlayRequester), colors = ButtonDefaults.colors(containerColor = Color.Transparent, contentColor = Color.Black)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(24.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Play on TV", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                        }
                    }
                }
                if (tv.duration.isNotBlank()) {
                    Box(Modifier.align(Alignment.BottomEnd).padding(12.dp).clip(RoundedCornerShape(4.dp)).background(Color.Black.copy(0.8f)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                        Text(tv.duration, color = Color.White, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(tv.title, color = Color.White, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold, fontSize = 20.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AsyncImage(model = v.authorThumbnails.firstOrNull()?.url, contentDescription = null, modifier = Modifier.size(40.dp).clip(RoundedCornerShape(20.dp)).background(Color(0xFF2A2A2A)))
                Column(Modifier.weight(1f)) {
                    Text(tv.channelTitle, color = Color.White, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                    Text(listOfNotNull(tv.viewsText, tv.publishedText).joinToString(" • "), color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                }
                OutlinedButton(
                    onClick = { v.authorId?.let(onChannel) },
                    border = ButtonDefaults.border(
                        border = Border(BorderStroke(1.dp, Color.White.copy(0.2f)))
                    )
                ) {
                    Text("View channel", color = Color.White, style = MaterialTheme.typography.labelMedium)
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { onPlay(tv.id) }, colors = ButtonDefaults.colors(containerColor = Color.White, contentColor = Color.Black)) {
                    Text("Play", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                }
                Button(onClick = { v.authorId?.let(onChannel) }, colors = ButtonDefaults.colors(containerColor = Color(0xFF2A2A2A), contentColor = Color.White)) {
                    Text("Channel", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
        // Right: Up Next (Single column of ListItems)
        Column(Modifier.weight(1f).fillMaxHeight()) {
            val upNext = state.related.take(20)
            Text("Up next", color = Color.White, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), modifier = Modifier.padding(bottom = 12.dp))
            if (upNext.isEmpty()) {
                Text("No recommendations.", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodyMedium)
            } else {
                TvLazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(upNext, key = { it.id }) { rv ->
                        YtTvVideoRowCard(video = rv, onClick = { onVideoClick(rv.id) })
                    }
                }
            }
        }
    }
}
