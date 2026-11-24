package com.kvtube.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
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
import com.kvtube.tv.ui.components.KvBrandLockup
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBorder
import com.kvtube.tv.ui.theme.YTBorderSubtle
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTSurface
import com.kvtube.tv.ui.theme.YTSurfaceElevated
import com.kvtube.tv.ui.theme.YTTextPrimary
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
                .padding(top = 18.dp),
            contentPadding = PaddingValues(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            // Compact YouTube TV "You" Header
            item(key = "you_header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 36.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(50.dp)
                            .clip(CircleShape)
                            .background(YTSurfaceElevated)
                            .border(1.dp, YTBorder, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "Account",
                            tint = YTTextPrimary,
                            modifier = Modifier.size(26.dp),
                        )
                    }

                    Column(Modifier.weight(1f)) {
                        Text(
                            text = "You",
                            style = MaterialTheme.typography.headlineLarge.copy(
                                fontSize = 26.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = YTTextPrimary,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = if (!ApiClient.token.isNullOrBlank()) {
                                "Connected to Invidious account"
                            } else {
                                "Local watch history active • ${ApiClient.baseUrl.removeSuffix("/")}"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = YTTextSecondary,
                        )
                    }

                    if (historyItems.isNotEmpty()) {
                        Surface(
                            onClick = { showClearDialog = true },
                            shape = ClickableSurfaceDefaults.shape(CircleShape),
                            scale = ClickableSurfaceDefaults.scale(focusedScale = 1.04f),
                            colors = ClickableSurfaceDefaults.colors(
                                containerColor = YTChip,
                                focusedContainerColor = YTFocus,
                                contentColor = YTTextPrimary,
                                focusedContentColor = YTFocusInk,
                            ),
                            border = ClickableSurfaceDefaults.border(
                                border = Border(BorderStroke(0.75.dp, YTBorderSubtle)),
                                focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
                            ),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                                Text(
                                    "Clear history",
                                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                                )
                            }
                        }
                    }
                }
            }

            // Watch History Shelf
            item(key = "you_history") {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 36.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.History,
                                contentDescription = null,
                                tint = YTTextPrimary,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                text = "Watch History",
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                ),
                                color = YTTextPrimary,
                            )
                        }

                        if (historyItems.isNotEmpty()) {
                            Text(
                                text = "${historyItems.size} ${if (historyItems.size == 1) "video" else "videos"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = YTTextSecondary,
                            )
                        }
                    }

                    if (historyItems.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 36.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(YTSurface)
                                .border(1.dp, YTBorderSubtle, RoundedCornerShape(14.dp))
                                .padding(vertical = 32.dp, horizontal = 24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.History,
                                    contentDescription = null,
                                    tint = YTTextSecondary,
                                    modifier = Modifier.size(36.dp),
                                )
                                Text(
                                    text = "No watched videos yet",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                    color = YTTextPrimary,
                                )
                                Text(
                                    text = "Videos you play on KV-Tube TV will appear here so you can resume right where you left off.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = YTTextSecondary,
                                )
                            }
                        }
                    } else {
                        TvLazyRow(
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            contentPadding = PaddingValues(horizontal = 36.dp, vertical = 10.dp),
                        ) {
                            items(historyItems, key = { it.videoId }) { item ->
                                YtTvVideoCard(
                                    video = item.toTvVideo(),
                                    progressFraction = item.progressFraction,
                                    onClick = { onVideoClick(item.videoId) },
                                )
                            }
                        }
                    }
                }
            }

            // Playlists Section
            item(key = "you_playlists") {
                Column(
                    modifier = Modifier.padding(horizontal = 36.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.PlaylistPlay,
                            contentDescription = null,
                            tint = YTTextPrimary,
                            modifier = Modifier.size(22.dp),
                        )
                        Text(
                            text = "Playlists",
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = YTTextPrimary,
                        )
                    }

                    if (playlists.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(YTSurface)
                                .border(1.dp, YTBorderSubtle, RoundedCornerShape(12.dp))
                                .padding(horizontal = 18.dp, vertical = 14.dp),
                        ) {
                            Text(
                                text = if (ApiClient.token.isNullOrBlank()) {
                                    "Connect an Invidious token in Settings to sync playlists across devices."
                                } else {
                                    "No playlists found on your account."
                                },
                                color = YTTextSecondary,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            playlists.forEach { pl ->
                                var focused by remember { mutableStateOf(false) }
                                Surface(
                                    onClick = {},
                                    modifier = Modifier
                                        .fillMaxWidth(0.65f)
                                        .onFocusChanged { focused = it.isFocused },
                                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(12.dp)),
                                    colors = ClickableSurfaceDefaults.colors(
                                        containerColor = YTSurface,
                                        focusedContainerColor = YTFocus,
                                        contentColor = YTTextPrimary,
                                        focusedContentColor = YTFocusInk,
                                    ),
                                    border = ClickableSurfaceDefaults.border(
                                        border = Border(BorderStroke(0.75.dp, YTBorderSubtle)),
                                        focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
                                    ),
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text(
                                            text = pl.title,
                                            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f),
                                        )
                                        Spacer(Modifier.width(12.dp))
                                        Text(
                                            text = "${pl.videoCount ?: pl.videos.size} videos",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = if (focused) Color(0xFF444444) else YTTextSecondary,
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
                    .background(Color.Black.copy(alpha = 0.78f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    modifier = Modifier
                        .width(420.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(YTSurfaceElevated)
                        .border(1.dp, YTBorder, RoundedCornerShape(20.dp))
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text(
                        text = "Clear watch history?",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        color = YTTextPrimary,
                    )
                    Text(
                        text = "This removes all watched videos from your history on this TV.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = YTTextSecondary,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Button(
                            onClick = { showClearDialog = false },
                            shape = ButtonDefaults.shape(CircleShape),
                            colors = ButtonDefaults.colors(
                                containerColor = YTChip,
                                contentColor = YTTextPrimary,
                                focusedContainerColor = YTFocus,
                                focusedContentColor = YTFocusInk,
                            ),
                        ) {
                            Text("Cancel", fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(Modifier.width(12.dp))
                        Button(
                            onClick = {
                                scope.launch {
                                    historyRepo.clearHistory()
                                    showClearDialog = false
                                }
                            },
                            shape = ButtonDefaults.shape(CircleShape),
                            colors = ButtonDefaults.colors(
                                containerColor = YTBrandRed,
                                contentColor = Color.White,
                                focusedContainerColor = YTFocus,
                                focusedContentColor = YTFocusInk,
                            ),
                        ) {
                            Text("Clear", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
