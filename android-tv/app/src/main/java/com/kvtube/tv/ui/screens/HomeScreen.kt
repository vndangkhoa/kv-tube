package com.kvtube.tv.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.kvtube.tv.ui.components.YtCategoryChips
import com.kvtube.tv.ui.components.YtCategoryRow
import com.kvtube.tv.ui.components.YtHeroRow
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.viewmodel.HomeViewModel
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items

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

    // Refresh content when screen is first entered
    LaunchedEffect(Unit) {
        vm.refresh()
    }

    TvLazyColumn(
        modifier = Modifier.fillMaxSize().padding(top = 12.dp, bottom = 8.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        // YouTube-style chips row (same taxonomy as frontend ClientHomePage CATEGORIES)
        item {
            YtCategoryChips(
                categories = categories,
                selected = selected,
                onSelect = {
                    selected = it
                    if (it == "All") vm.clearFilter() else vm.filterBy(it)
                },
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }

        if (state.isLoading && state.hero.isEmpty() && state.rows.isEmpty()) {
            item {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    Text("Loading…", color = YTTextSecondary)
                }
            }
        }

        state.error?.let { msg ->
            item {
                Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    Text(msg, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        // Filtered: same look as main page but full-width rows — fills the screen
        if (selected != "All") {
            item {
                Column(Modifier.padding(horizontal = 32.dp, vertical = 8.dp)) {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(state.filterLabel ?: selected, color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.titleLarge)
                        if (state.isLoading) Text("Loading…", color = YTTextSecondary, style = MaterialTheme.typography.bodySmall)
                        else Text("${state.filtered.size} videos • VN", color = YTTextSecondary, style = MaterialTheme.typography.bodySmall)
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
            if (state.filtered.isEmpty() && !state.isLoading) {
                item {
                    Box(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 24.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                        Text("No videos for \"$selected\" — try another category.", color = YTTextSecondary)
                    }
                }
            } else {
                // Same layout as main page: reuse YtCategoryRow (identical 280dp thumb + 16dp gap + full bleed)
                val filteredChunks = state.filtered.chunked(6)
                for ((idx, chunk) in filteredChunks.withIndex()) {
                    item { YtCategoryRow(title = if (idx == 0) "${state.filterLabel ?: selected} • VN" else "", videos = chunk, onVideoClick = { onVideoClick(it.id) }) }
                }
            }
        } else {
            if (state.hero.isNotEmpty()) {
                item { YtHeroRow(title = "Dành cho bạn", videos = state.hero, onVideoClick = { onVideoClick(it.id) }) }
            }
            state.rows.forEach { (title, list) ->
                item { YtCategoryRow(title = title, videos = list, onVideoClick = { onVideoClick(it.id) }) }
            }
        }
    }
}
