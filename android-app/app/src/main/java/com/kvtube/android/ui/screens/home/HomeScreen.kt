package com.kvtube.android.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.kvtube.android.ui.components.CategoryPills
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.components.VideoGridSkeleton
import com.kvtube.android.ui.navigation.Screen
import com.kvtube.android.ui.navigation.TabReselect
import com.kvtube.android.ui.theme.YTBrandRed

@Composable
fun HomeScreen(
    navController: NavController,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val gridState = rememberLazyGridState()

    // Re-tapping the active tab scrolls back to the first item
    LaunchedEffect(Unit) {
        TabReselect.events.collect { route ->
            if (route == Screen.Home.route) gridState.scrollToItem(0)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // YouTube-style horizontal Category Pills
        CategoryPills(
            selectedCategory = uiState.selectedCategory,
            onCategorySelected = { viewModel.selectCategory(it) },
            modifier = Modifier.padding(vertical = 4.dp)
        )

        Spacer(modifier = Modifier.height(4.dp))

        // Feed Content
        if (uiState.isLoading && uiState.videos.isEmpty()) {
            VideoGridSkeleton()
        } else if (uiState.error != null && uiState.videos.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CloudOff,
                        contentDescription = null,
                        modifier = Modifier.size(56.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = uiState.error ?: "Unable to connect",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Button(
                        onClick = { viewModel.refresh() },
                        colors = ButtonDefaults.buttonColors(containerColor = YTBrandRed),
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Text(
                            text = "Try again",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 300.dp),
                state = gridState,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(
                    items = uiState.videos,
                    key = { it.id }
                ) { video ->
                    VideoCard(
                        video = video,
                        onVideoClick = { videoId ->
                            navController.navigate(Screen.Watch.createRoute(videoId))
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
                                .padding(16.dp)
                        )
                    }
                }

                // Manual "show more" button (in addition to infinite scroll)
                if (!uiState.isLoadingMore && uiState.hasMore && uiState.videos.isNotEmpty()) {
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
            val shouldLoadMore by remember {
                derivedStateOf {
                    val lastVisibleItem = gridState.layoutInfo.visibleItemsInfo.lastOrNull()
                        ?: return@derivedStateOf false
                    lastVisibleItem.index >= gridState.layoutInfo.totalItemsCount - 3
                }
            }

            LaunchedEffect(shouldLoadMore) {
                if (shouldLoadMore && uiState.hasMore && !uiState.isLoadingMore) {
                    viewModel.loadMore()
                }
            }
        }
    }
}
