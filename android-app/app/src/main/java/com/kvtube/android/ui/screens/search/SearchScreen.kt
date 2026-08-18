package com.kvtube.android.ui.screens.search

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.kvtube.android.ui.components.SearchBar
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.components.VideoGridSkeleton
import com.kvtube.android.ui.navigation.Screen

@Composable
fun SearchScreen(
    query: String,
    navController: NavController,
    viewModel: SearchViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Fallback: open the search on YouTube directly when the app's own
    // search (server + on-device extractor) returns nothing.
    fun openYouTubeSearch() {
        val q = uiState.query.ifBlank { query }.trim()
        if (q.isBlank()) return
        val intent = Intent(
            Intent.ACTION_VIEW,
            Uri.parse("https://www.youtube.com/results?search_query=" + Uri.encode(q))
        )
        runCatching { context.startActivity(intent) }
    }

    LaunchedEffect(query) {
        if (query.isNotBlank() && !uiState.hasSearched) {
            viewModel.searchImmediate(query)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        SearchBar(
            query = uiState.query,
            onQueryChange = { viewModel.onQueryChanged(it) },
            onSearch = { viewModel.searchImmediate(uiState.query) },
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
        )

        when {
            uiState.isLoading -> VideoGridSkeleton()

            uiState.error != null -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                        modifier = Modifier.padding(24.dp)
                    ) {
                        Text(
                            text = uiState.error ?: "",
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { openYouTubeSearch() }) {
                            Text("Search on YouTube instead")
                        }
                    }
                }
            }

            uiState.hasSearched && uiState.results.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                        modifier = Modifier.padding(24.dp)
                    ) {
                        Text(
                            text = "No results found",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { openYouTubeSearch() }) {
                            Text("Search on YouTube")
                        }
                    }
                }
            }

            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 180.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
                    verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp)
                ) {
                    items(
                        items = uiState.results,
                        key = { it.id }
                    ) { video ->
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
                }
            }
        }
    }
}
