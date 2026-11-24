package com.kvtube.android.ui.screens.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.ui.adaptive.LocalWidthClass
import com.kvtube.android.ui.components.CategoryPills
import com.kvtube.android.ui.components.CenteredContent
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.SmartSuggestionsShelf
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.components.VideoGridSkeleton
import com.kvtube.android.ui.components.gridHorizontalSpacing
import com.kvtube.android.ui.components.gridVerticalSpacing
import com.kvtube.android.ui.components.rememberVideoGridCells
import com.kvtube.android.ui.navigation.Screen
import com.kvtube.android.ui.navigation.TabReselect
import com.kvtube.android.ui.theme.LocalGlassChromeInsets
import com.kvtube.android.ui.theme.YTBrandRed
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

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

    LaunchedEffect(uiState.selectedCategory) {
        gridState.scrollToItem(0)
    }

    val hasContent = uiState.videos.isNotEmpty() || uiState.categorySections.isNotEmpty()
    val chromeInsets = LocalGlassChromeInsets.current

    CenteredContent {
        Box(
            modifier = Modifier.fillMaxSize()
        ) {
            // Feed Content
            if (uiState.isLoading && !hasContent) {
                Column(modifier = Modifier.fillMaxSize()) {
                    CategoryPills(
                        selectedCategory = uiState.selectedCategory,
                        onCategorySelected = { viewModel.selectCategory(it) },
                        modifier = Modifier
                            .padding(top = chromeInsets.calculateTopPadding() + 4.dp)
                            .padding(vertical = if (LocalWidthClass.current.isWide) 2.dp else 4.dp)
                    )
                    Spacer(modifier = Modifier.height(if (LocalWidthClass.current.isWide) 2.dp else 4.dp))
                    VideoGridSkeleton()
                }
            } else if (uiState.error != null && !hasContent) {
                Column(modifier = Modifier.fillMaxSize()) {
                    CategoryPills(
                        selectedCategory = uiState.selectedCategory,
                        onCategorySelected = { viewModel.selectCategory(it) },
                        modifier = Modifier
                            .padding(top = chromeInsets.calculateTopPadding() + 4.dp)
                            .padding(vertical = if (LocalWidthClass.current.isWide) 2.dp else 4.dp)
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 32.dp)
                            .padding(bottom = chromeInsets.calculateBottomPadding()),
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
                }
            } else {
                LazyVerticalGrid(
                    columns = rememberVideoGridCells(),
                    state = gridState,
                    contentPadding = PaddingValues(
                        start = 12.dp,
                        end = 12.dp,
                        top = chromeInsets.calculateTopPadding() + 4.dp,
                        bottom = chromeInsets.calculateBottomPadding() + 12.dp
                    ),
                    horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing(12.dp)),
                    verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing(8.dp))
                ) {
                    // Horizontal Category Pills scroll naturally behind the floating Liquid Glass header
                    item(
                        key = "home_category_pills",
                        span = { GridItemSpan(maxLineSpan) }
                    ) {
                        CategoryPills(
                            selectedCategory = uiState.selectedCategory,
                            onCategorySelected = { viewModel.selectCategory(it) },
                            modifier = Modifier
                                .fullBleedHorizontal(12.dp)
                                .padding(vertical = if (LocalWidthClass.current.isWide) 2.dp else 4.dp)
                        )
                    }
                    // Smart Suggestions Shelf at the top of the feed for "All" category
                    if (uiState.selectedCategory == "All" && uiState.smartSuggestions.isNotEmpty()) {
                        item(
                            key = "smart_suggestions_shelf",
                            span = { GridItemSpan(maxLineSpan) }
                        ) {
                            SmartSuggestionsShelf(
                                suggestions = uiState.smartSuggestions,
                                onVideoClick = { videoId ->
                                    navController.navigate(Screen.Watch.createRoute(videoId))
                                },
                                onChannelClick = { channelId ->
                                    navController.navigate(Screen.Channel.createRoute(channelId))
                                },
                                onRefresh = { viewModel.refreshSuggestions() }
                            )
                        }
                    }

                    // Category shelves on the main page ("All"), lazy-loaded in batches
                    if (uiState.selectedCategory == "All" && uiState.categorySections.isNotEmpty()) {
                        uiState.categorySections.forEach { section ->
                            item(
                                key = "cat_section_${section.category}",
                                span = { GridItemSpan(maxLineSpan) }
                            ) {
                                CategoryShelf(
                                    category = section.category,
                                    videos = section.videos,
                                    onVideoClick = { videoId ->
                                        navController.navigate(Screen.Watch.createRoute(videoId))
                                    },
                                    onChannelClick = { channelId ->
                                        navController.navigate(Screen.Channel.createRoute(channelId))
                                    },
                                    onSeeAllClick = { viewModel.selectCategory(section.category) }
                                )
                            }
                        }

                        if (uiState.videos.isNotEmpty()) {
                            item(
                                key = "more_videos_header",
                                span = { GridItemSpan(maxLineSpan) }
                            ) {
                                Text(
                                    text = "More Videos",
                                    fontSize = if (LocalWidthClass.current.isWide) 15.sp else 17.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.padding(top = 6.dp, bottom = 2.dp)
                                )
                            }
                        }
                    }

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
                        item(
                            key = "home_loading_more",
                            span = { GridItemSpan(maxLineSpan) }
                        ) {
                            LoadingSpinner(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                size = 28.dp,
                                text = "Loading more videos..."
                            )
                        }
                    }

                    // Manual "show more" button (in addition to infinite scroll)
                    if (!uiState.isLoadingMore && uiState.hasMore && hasContent) {
                        item(
                            key = "home_show_more_btn",
                            span = { GridItemSpan(maxLineSpan) }
                        ) {
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

                    if (!uiState.hasMore && hasContent) {
                        item(
                            key = "home_no_more",
                            span = { GridItemSpan(maxLineSpan) }
                        ) {
                            Text(
                                text = "No more videos",
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 14.dp)
                            )
                        }
                    }
                }

                // Infinite scroll trigger: re-evaluates after each batch completes or grid grows
                val currentState by rememberUpdatedState(uiState)
                LaunchedEffect(gridState, uiState.selectedCategory) {
                    snapshotFlow {
                        val info = gridState.layoutInfo
                        val total = info.totalItemsCount
                        val lastVisible = info.visibleItemsInfo.lastOrNull()?.index ?: -1
                        val nearBottom = total > 0 && lastVisible >= total - 4
                        nearBottom &&
                            currentState.hasMore &&
                            !currentState.isLoading &&
                            !currentState.isLoadingMore
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

private fun Modifier.fullBleedHorizontal(bleed: Dp): Modifier = layout { measurable, constraints ->
    val bleedPx = bleed.roundToPx()
    val expandedWidth = if (constraints.hasBoundedWidth) constraints.maxWidth + bleedPx * 2 else Constraints.Infinity
    val placeable = measurable.measure(
        constraints.copy(
            minWidth = if (constraints.hasBoundedWidth) expandedWidth else constraints.minWidth,
            maxWidth = expandedWidth
        )
    )
    layout(constraints.maxWidth, placeable.height) {
        placeable.placeRelative(-bleedPx, 0)
    }
}

@Composable
private fun CategoryShelf(
    category: String,
    videos: List<VideoData>,
    onVideoClick: (String) -> Unit,
    onChannelClick: (String) -> Unit,
    onSeeAllClick: () -> Unit
) {
    if (videos.isEmpty()) return
    val isWide = LocalWidthClass.current.isWide
    val cardWidth = if (isWide) 248.dp else 272.dp

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp, bottom = 4.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onSeeAllClick)
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = category,
                fontSize = if (isWide) 15.sp else 17.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Row(
                    modifier = Modifier.padding(start = 10.dp, end = 6.dp, top = 4.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "See all",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = "See all $category",
                        tint = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(if (isWide) 4.dp else 6.dp))

        LazyRow(
            modifier = Modifier.fullBleedHorizontal(12.dp),
            contentPadding = PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(
                items = videos,
                key = { "shelf-${category}-${it.id}" }
            ) { video ->
                VideoCard(
                    video = video,
                    onVideoClick = onVideoClick,
                    onChannelClick = onChannelClick,
                    compactLayout = true,
                    modifier = Modifier.width(cardWidth)
                )
            }
        }
    }
}
