package com.kvtube.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SubscriptionsScreen(onVideoClick: (String) -> Unit) {
    var feed by remember { mutableStateOf<List<TvVideo>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            feed = InvidiousRepository().authFeed()
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(YTBackground)
            .padding(horizontal = 36.dp, vertical = 20.dp)
    ) {
        Text(
            text = "Subscriptions",
            color = YTTextPrimary,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
            ),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Sign in with an Invidious token in Settings to see your subscribed channels.",
            style = MaterialTheme.typography.bodySmall,
            color = YTTextSecondary,
        )
        Spacer(Modifier.height(16.dp))
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = YTBrandRed)
            }
            error != null -> Box(Modifier.fillMaxWidth().padding(16.dp)) {
                Text(error ?: "Error", color = MaterialTheme.colorScheme.error)
            }
            feed.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No feed — add a token in Settings or subscribe on the web.", color = YTTextSecondary)
            }
            else -> TvLazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(bottom = 24.dp),
            ) {
                val rows = feed.chunked(3)
                items(rows.size, key = { "sub_row_$it" }) { idx ->
                    val row = rows[idx]
                    TvLazyRow(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        contentPadding = PaddingValues(vertical = 10.dp),
                    ) {
                        items(row, key = { it.id }) { v ->
                            YtTvVideoCard(video = v, onClick = { onVideoClick(v.id) })
                        }
                    }
                }
            }
        }
    }
}
