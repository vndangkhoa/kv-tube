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
import com.kvtube.tv.ui.components.YtCategoryRow
import com.kvtube.tv.ui.components.YtHeroRow
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.viewmodel.LatestViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LatestScreen(
    onVideoClick: (String) -> Unit,
    vm: LatestViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) {
        vm.refresh()
    }

    TvLazyColumn(
        modifier = Modifier.fillMaxSize().padding(top = 12.dp, bottom = 8.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        item {
            Text(
                "Mới nhất", 
                color = androidx.compose.ui.graphics.Color.White, 
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(start = 32.dp, top = 8.dp, bottom = 16.dp)
            )
        }

        if (state.isLoading && state.hero.isEmpty() && state.rows.isEmpty()) {
            item {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    Text("Loading latest content…", color = YTTextSecondary)
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

        if (state.hero.isNotEmpty()) {
            item { YtHeroRow(title = "Nổi bật gần đây", videos = state.hero, onVideoClick = { onVideoClick(it.id) }) }
        }
        
        state.rows.forEach { (title, list) ->
            item { YtCategoryRow(title = title, videos = list, onVideoClick = { onVideoClick(it.id) }) }
        }
    }
}
