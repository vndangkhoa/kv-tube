package com.kvtube.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.*
import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.model.InvidiousPlaylist
import com.kvtube.tv.data.repository.InvidiousRepository
import com.kvtube.tv.data.repository.TvHistoryRepository
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTTextSecondary
import kotlinx.coroutines.launch

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LibraryScreen(onVideoClick: (String) -> Unit) {
    val historyRepo = remember { TvHistoryRepository.getInstance() }
    val historyItems by historyRepo.historyFlow.collectAsState(initial = emptyList())
    var playlists by remember { mutableStateOf(emptyList<InvidiousPlaylist>()) }
    var isLoadingRemote by remember { mutableStateOf(true) }
    var showClearDialog by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        isLoadingRemote = true
        val invidiousRepo = InvidiousRepository()
        try {
            historyRepo.fetchAndMergeRemote()
        } catch (_: Exception) {}
        playlists = try { invidiousRepo.authPlaylists() } catch (_: Exception) { emptyList() }
        isLoadingRemote = false
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(YTBackground)
    ) {
        TvLazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp, vertical = 20.dp),
            contentPadding = PaddingValues(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Profile & Account Header
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFF1A1A1A))
                        .padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(YTBrandRed),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "User Account",
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }

                    Spacer(Modifier.width(18.dp))

                    Column(Modifier.weight(1f)) {
                        Text(
                            text = "Account & History",
                            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = if (!ApiClient.token.isNullOrBlank()) "Connected to Invidious account" else "Local watch history active (${ApiClient.baseUrl.removeSuffix("/")})",
                            style = MaterialTheme.typography.bodySmall,
                            color = YTTextSecondary
                        )
                    }

                    if (historyItems.isNotEmpty()) {
                        Button(
                            onClick = { showClearDialog = true },
                            colors = ButtonDefaults.colors(
                                containerColor = Color(0xFF2A2A2A),
                                focusedContainerColor = Color.White,
                                contentColor = Color.White,
                                focusedContentColor = Color.Black
                            ),
                            border = ButtonDefaults.border(
                                border = Border(BorderStroke(1.dp, Color.White.copy(alpha = 0.2f))),
                                focusedBorder = Border(BorderStroke(2.dp, Color.White))
                            )
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                                Text("Clear history", style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
            }

            // Watch History Section
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.History,
                                contentDescription = null,
                                tint = YTBrandRed,
                                modifier = Modifier.size(24.dp)
                            )
                            Text(
                                text = "Watch History",
                                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                                color = Color.White
                            )
                        }

                        if (historyItems.isNotEmpty()) {
                            Text(
                                text = "${historyItems.size} ${if (historyItems.size == 1) "video" else "videos"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = YTTextSecondary
                            )
                        }
                    }

                    if (historyItems.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color(0xFF141414))
                                .padding(vertical = 36.dp, horizontal = 24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.History,
                                    contentDescription = null,
                                    tint = YTTextSecondary.copy(alpha = 0.6f),
                                    modifier = Modifier.size(44.dp)
                                )
                                Text(
                                    text = "No watched videos yet",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                    color = Color.White
                                )
                                Text(
                                    text = "Videos you watch on KV-Tube TV will appear here so you can easily resume watching.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = YTTextSecondary
                                )
                            }
                        }
                    } else {
                        TvLazyRow(
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            contentPadding = PaddingValues(vertical = 6.dp)
                        ) {
                            items(historyItems, key = { it.videoId }) { item ->
                                YtTvVideoCard(
                                    video = item.toTvVideo(),
                                    progressFraction = item.progressFraction,
                                    onClick = { onVideoClick(item.videoId) }
                                )
                            }
                        }
                    }
                }
            }

            // Playlists Section
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.PlaylistPlay,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(24.dp)
                        )
                        Text(
                            text = "Playlists",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                    }

                    if (playlists.isEmpty()) {
                        Text(
                            text = if (ApiClient.token.isNullOrBlank()) "Playlists require an Invidious account token (configure in Settings)." else "No playlists found on your account.",
                            color = YTTextSecondary,
                            style = MaterialTheme.typography.bodySmall
                        )
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            playlists.forEach { pl ->
                                Surface(
                                    onClick = {},
                                    modifier = Modifier.fillMaxWidth(0.6f),
                                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
                                    colors = ClickableSurfaceDefaults.colors(
                                        containerColor = YTChip,
                                        focusedContainerColor = Color.White,
                                        contentColor = Color.White,
                                        focusedContentColor = Color.Black
                                    )
                                ) {
                                    Row(
                                        modifier = Modifier.padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            text = pl.title,
                                            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = "${pl.videoCount ?: pl.videos.size} videos",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = YTTextSecondary
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Clear History Confirmation Dialog
        if (showClearDialog) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.75f)),
                contentAlignment = Alignment.Center
            ) {
                Surface(
                    onClick = {},
                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(16.dp)),
                    colors = ClickableSurfaceDefaults.colors(
                        containerColor = Color(0xFF1E1E1E),
                        focusedContainerColor = Color(0xFF1E1E1E)
                    ),
                    modifier = Modifier
                        .width(420.dp)
                        .padding(24.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = "Clear watch history?",
                            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                        Text(
                            text = "This will remove all watched videos from your history on this device.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = YTTextSecondary
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedButton(
                                onClick = { showClearDialog = false },
                                colors = ButtonDefaults.colors(containerColor = Color.Transparent, contentColor = Color.White)
                            ) {
                                Text("Cancel")
                            }
                            Spacer(Modifier.width(12.dp))
                            Button(
                                onClick = {
                                    scope.launch {
                                        historyRepo.clearHistory()
                                        showClearDialog = false
                                    }
                                },
                                colors = ButtonDefaults.colors(
                                    containerColor = YTBrandRed,
                                    contentColor = Color.White,
                                    focusedContainerColor = Color.White,
                                    focusedContentColor = Color.Black
                                )
                            ) {
                                Text("Clear")
                            }
                        }
                    }
                }
            }
        }
    }
}

