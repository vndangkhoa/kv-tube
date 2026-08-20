package com.kvtube.tv.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.repository.InvidiousRepository

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LibraryScreen(onVideoClick: (String) -> Unit) {
    var history by remember { mutableStateOf<List<TvVideo>>(emptyList()) }
    var playlists by remember { mutableStateOf(emptyList<com.kvtube.tv.data.model.InvidiousPlaylist>()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val repo = InvidiousRepository()
        history = try { repo.authHistory() } catch (_: Exception) { emptyList() }
        playlists = try { repo.authPlaylists() } catch (_: Exception) { emptyList() }
        loading = false
    }

    TvLazyColumn(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Text("You", style = MaterialTheme.typography.headlineSmall) }
        if (loading) {
            item { Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { Text("Loading…") } }
        } else {
            item {
                Text("History", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
                if (history.isEmpty()) Text("No history yet — requires Invidious token.", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                else TvLazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(history.take(20), key = { it.id }) { v -> com.kvtube.tv.ui.components.YtTvVideoCard(video = v, onClick = { onVideoClick(v.id) }) }
                }
            }
            item {
                Text("Playlists", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
                if (playlists.isEmpty()) Text("No playlists — requires Invidious token or create them on the web.", color = Color(0xFFAAAAAA), style = MaterialTheme.typography.bodySmall)
                else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    playlists.forEach { pl ->
                        Text("• ${pl.title} (${pl.videoCount ?: pl.videos.size} videos)", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}
