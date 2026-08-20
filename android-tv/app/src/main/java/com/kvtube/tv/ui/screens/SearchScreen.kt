package com.kvtube.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.viewmodel.SearchViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SearchScreen(
    onVideoClick: (String) -> Unit,
    vm: SearchViewModel = viewModel(),
) {
    val query by vm.query.collectAsState()
    val results by vm.results.collectAsState()
    val loading by vm.loading.collectAsState()
    var text by remember { mutableStateOf(query) }

    LaunchedEffect(query) { if (text != query) text = query }

    Column(Modifier.fillMaxSize().background(Color(0xFF0F0F0F)).padding(horizontal = 48.dp, vertical = 28.dp)) {
        Row(Modifier.fillMaxWidth().padding(end = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            androidx.compose.material3.OutlinedTextField(
                value = text,
                onValueChange = { text = it; vm.onQueryChange(it) },
                modifier = Modifier.weight(1f).height(56.dp),
                placeholder = { Text("Search YouTube — titles, channels, topics…", color = Color(0xFFAAAAAA)) },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White,
                    focusedBorderColor = Color.White.copy(alpha = 0.5f),
                    unfocusedBorderColor = Color.White.copy(alpha = 0.22f),
                    focusedContainerColor = Color(0xFF212121),
                    unfocusedContainerColor = Color(0xFF212121),
                    focusedPlaceholderColor = Color(0xFFAAAAAA),
                    unfocusedPlaceholderColor = Color(0xFFAAAAAA),
                ),
                shape = RoundedCornerShape(28.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { vm.searchNow() }),
            )
            androidx.compose.material3.Button(
                onClick = { vm.searchNow() },
                modifier = Modifier.height(56.dp),
                contentPadding = PaddingValues(horizontal = 28.dp),
                shape = RoundedCornerShape(28.dp),
            ) { Text("Search", color = Color.White) }
        }
        if (query.isBlank() && results.isEmpty() && !loading) {
            Text("Tip: type at least 2 characters — results stream from Invidious (https://yt.khoavo.myds.me).", color = Color(0xFF9E9E9E), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
        }
        Spacer(Modifier.height(16.dp))
        if (loading) {
            Text("Searching…", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
        }
        if (results.isEmpty() && query.isNotBlank() && !loading) {
            Text("No results for \"$query\" — try a different query.", color = Color(0xFFAAAAAA))
        }
        TvLazyColumn(
            modifier = Modifier.fillMaxSize().padding(top = 4.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
            contentPadding = PaddingValues(bottom = 32.dp, top = 8.dp),
        ) {
            val chunks = results.chunked(5)
            items(chunks.size) { rowIdx ->
                val chunk = chunks[rowIdx]
                TvLazyRow(
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(chunk, key = { it.id }) { v -> YtTvVideoCard(video = v, onClick = { onVideoClick(v.id) }) }
                }
            }
        }
    }
}
