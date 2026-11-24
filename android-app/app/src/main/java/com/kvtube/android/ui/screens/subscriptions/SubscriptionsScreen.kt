package com.kvtube.android.ui.screens.subscriptions

import com.kvtube.android.ui.components.gridVerticalSpacing
import com.kvtube.android.ui.components.gridHorizontalSpacing
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Subscriptions
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.kvtube.android.ui.components.CenteredContent
import com.kvtube.android.ui.components.ChannelAvatar
import com.kvtube.android.ui.components.rememberVideoGridCells
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.navigation.Screen

@Composable
fun SubscriptionsScreen(
    navController: NavController,
    viewModel: SubscriptionsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val chromeInsets = com.kvtube.android.ui.theme.LocalGlassChromeInsets.current

    // Reload every time the tab is opened so new subscriptions/uploads show up.
    LaunchedEffect(Unit) { viewModel.refresh() }

    CenteredContent {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = chromeInsets.calculateTopPadding())
    ) {
        when {
            uiState.isLoading -> LoadingSpinner(fullScreen = true, text = "Loading subscriptions feed...")

            uiState.subscriptions.isEmpty() && uiState.feedVideos.isEmpty() -> {
                val isUnreachable = !uiState.needsAuth && uiState.error?.startsWith("Couldn't reach") == true
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(horizontal = 32.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier.size(56.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = if (isUnreachable) Icons.Outlined.CloudOff else Icons.Outlined.Subscriptions,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(26.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(14.dp))
                        Text(
                            text = when {
                                uiState.needsAuth -> "Sync your subscriptions"
                                uiState.error != null -> "Couldn't load subscriptions"
                                else -> "No subscriptions yet"
                            },
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = uiState.error
                                ?: "Subscribe to channels from search or any video page — their latest uploads will appear here.",
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(18.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (uiState.needsAuth || uiState.error != null) {
                                Button(
                                    onClick = { navController.navigate(Screen.Settings.route) },
                                    shape = CircleShape
                                ) {
                                    Text("Open Settings", fontWeight = FontWeight.SemiBold)
                                }
                            }
                            OutlinedButton(
                                onClick = { viewModel.refresh() },
                                shape = CircleShape
                            ) {
                                Text("Retry", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            else -> {
                // Compact channel strip + refresh button
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    LazyRow(
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(start = 12.dp, end = 4.dp, top = 2.dp, bottom = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(uiState.subscriptions) { sub ->
                            Column(
                                modifier = Modifier
                                    .width(56.dp)
                                    .clickable {
                                        navController.navigate(Screen.Channel.createRoute(sub.channelId))
                                    },
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                ChannelAvatar(
                                    avatarUrl = sub.channelAvatar,
                                    channelName = sub.channelName,
                                    size = 36.dp
                                )
                                Text(
                                    text = sub.channelName,
                                    style = MaterialTheme.typography.labelSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = "Refresh",
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                HorizontalDivider(
                    thickness = 0.5.dp,
                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                )

                val gridState = rememberLazyGridState()

                LazyVerticalGrid(
                    columns = rememberVideoGridCells(),
                    state = gridState,
                    contentPadding = PaddingValues(
                        start = 12.dp,
                        end = 12.dp,
                        top = 4.dp,
                        bottom = chromeInsets.calculateBottomPadding() + 12.dp
                    ),
                    horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing(12.dp)),
                    verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing(8.dp))
                ) {
                    items(uiState.feedVideos, key = { it.id }) { video ->
                        VideoCard(
                            video = video,
                            onVideoClick = { id ->
                                navController.navigate(Screen.Watch.createRoute(id))
                            },
                            onChannelClick = { channelId ->
                                navController.navigate(Screen.Channel.createRoute(channelId))
                            }
                        )
                    }

                    // Loading more indicator
                    if (uiState.isLoadingMore) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            LoadingSpinner(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                size = 28.dp,
                                text = "Loading older videos..."
                            )
                        }
                    }

                    // "Show more videos" button fallback
                    if (!uiState.isLoadingMore && uiState.hasMore && uiState.feedVideos.isNotEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                OutlinedButton(
                                    onClick = { viewModel.loadMore() },
                                    shape = RoundedCornerShape(20.dp)
                                ) {
                                    Text(
                                        text = "Show more videos",
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 14.sp
                                    )
                                }
                            }
                        }
                    }
                }

                // Infinite scroll trigger
                val currentState by rememberUpdatedState(uiState)
                LaunchedEffect(gridState) {
                    snapshotFlow {
                        val info = gridState.layoutInfo
                        val total = info.totalItemsCount
                        val lastVisible = info.visibleItemsInfo.lastOrNull()?.index ?: -1
                        val nearBottom = total > 0 && lastVisible >= total - 4
                        nearBottom && currentState.hasMore && !currentState.isLoading && !currentState.isLoadingMore
                    }
                        .distinctUntilChanged()
                        .filter { it }
                        .collect {
                            viewModel.loadMore()
                        }
                }
            }
        }
    }
    }
}
