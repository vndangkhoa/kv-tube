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
fun SubscriptionsScreen(onVideoClick: (String) -> Unit) {
    var feed by remember { mutableStateOf<List<TvVideo>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try { feed = InvidiousRepository().authFeed() } catch (e: Exception) { error = e.message } finally { loading = false }
    }

    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Subscriptions", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(6.dp))
        Text("Sign in with an Invidious token in Settings to see your feed. Without a token this shows nothing — by design.", style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFFAAAAAA)))
        Spacer(Modifier.height(16.dp))
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Loading…") }
            error != null -> Box(Modifier.fillMaxWidth().padding(16.dp)) { Text(error ?: "Error", color = MaterialTheme.colorScheme.error) }
            feed.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No feed — add a token in Settings or subscribe on the web.", color = Color(0xFFAAAAAA)) }
            else -> TvLazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                items(feed.chunked(4).size) { idx ->
                    val row = feed.chunked(4)[idx]
                    TvLazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        items(row, key = { it.id }) { v ->
                            com.kvtube.tv.ui.components.YtTvVideoCard(video = v, onClick = { onVideoClick(v.id) })
                        }
                    }
                }
            }
        }
    }
}
