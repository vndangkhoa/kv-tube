package com.kvtube.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.ui.components.KvBrandLockup
import com.kvtube.tv.ui.components.YtCategoryChips
import com.kvtube.tv.ui.components.YtCategoryRow
import com.kvtube.tv.ui.components.YtHeroRow
import com.kvtube.tv.ui.components.YtShelfSkeleton
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.viewmodel.HomeViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun HomeScreen(
    onVideoClick: (String) -> Unit,
    onChannelClick: (String) -> Unit = {},
    vm: HomeViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()
    val categories = remember { listOf("All", "Music", "Gaming", "Movies", "News", "Tech", "Sports", "Live", "Comedy") }
    var selected by remember { mutableStateOf("All") }

    val currentInstance by ApiClient.instanceFlow.collectAsState()

    LaunchedEffect(currentInstance) {
        if (state.hero.isEmpty() && state.rows.isEmpty()) {
            vm.refresh()
        }
    }

    TvLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(YTBackground)
            .padding(top = 12.dp),
        contentPadding = PaddingValues(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        // Top Bar: YouTube TV translucent category chips
        item(key = "home_top_bar") {
            YtCategoryChips(
                categories = categories,
                selected = selected,
                onSelect = {
                    selected = it
                    if (it == "All") vm.clearFilter() else vm.filterBy(it)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp, bottom = 6.dp),
            )
        }

        if (state.isLoading && state.hero.isEmpty() && state.rows.isEmpty()) {
            item(key = "home_boot_skeleton_1") { YtShelfSkeleton(showHeading = true, cardCount = 3) }
            item(key = "home_boot_skeleton_2") { YtShelfSkeleton(showHeading = true, cardCount = 3) }
        }

        state.error?.let { msg ->
            item(key = "home_error") {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 36.dp, vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleMedium)
                    Button(
                        onClick = { vm.refresh() },
                        shape = ButtonDefaults.shape(CircleShape),
                        colors = ButtonDefaults.colors(
                            containerColor = YTChip,
                            contentColor = YTTextPrimary,
                            focusedContainerColor = YTFocus,
                            focusedContentColor = YTFocusInk,
                        ),
                    ) {
                        Text("Retry", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        if (selected != "All") {
            item(key = "filter_header") {
                Row(
                    modifier = Modifier.padding(horizontal = 36.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = state.filterLabel ?: selected,
                        color = YTTextPrimary,
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    )
                    if (!state.isLoading) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color.White.copy(alpha = 0.08f))
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = "${state.filtered.size} videos • VN",
                                color = YTTextSecondary,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                }
            }

            if (state.isLoading && state.filtered.isEmpty()) {
                item(key = "filter_skeleton_1") { YtShelfSkeleton(showHeading = false, cardCount = 3) }
                item(key = "filter_skeleton_2") { YtShelfSkeleton(showHeading = false, cardCount = 3) }
            } else if (state.filtered.isEmpty() && !state.isLoading) {
                item(key = "filter_empty") {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 36.dp, vertical = 32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "No videos for \"$selected\" — try another category.",
                            color = YTTextSecondary,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            } else {
                val filteredChunks = state.filtered.chunked(6)
                for ((idx, chunk) in filteredChunks.withIndex()) {
                    item(key = "filter_row_${selected}_$idx") {
                        YtCategoryRow(
                            title = if (idx == 0) "${state.filterLabel ?: selected} • VN" else "",
                            videos = chunk,
                            onVideoClick = { onVideoClick(it.id) },
                        )
                    }
                }
            }
        } else {
            if (state.hero.isNotEmpty()) {
                val heroTitle = if (state.isSmartHero) "Dành cho bạn • Đề xuất thông minh" else "Dành cho bạn"
                item(key = "hero_section") {
                    YtHeroRow(
                        title = heroTitle,
                        videos = state.hero,
                        onVideoClick = { onVideoClick(it.id) },
                    )
                }
            }
            state.rows.forEach { (title, list) ->
                item(key = "cat_row_$title") {
                    YtCategoryRow(
                        title = title,
                        videos = list,
                        onVideoClick = { onVideoClick(it.id) },
                    )
                }
            }
        }
    }
}
