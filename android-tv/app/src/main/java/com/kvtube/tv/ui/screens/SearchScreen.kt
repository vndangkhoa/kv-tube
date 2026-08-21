package com.kvtube.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Whatshot
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.*
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTTextSecondary
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
    val suggestions by vm.suggestions.collectAsState()
    val trendingKeywords by vm.trendingKeywords.collectAsState()
    val recentSearches by vm.recentSearches.collectAsState()
    var text by remember { mutableStateOf(query) }

    LaunchedEffect(query) { if (text != query) text = query }

    Column(
        Modifier
            .fillMaxSize()
            .background(YTBackground)
            .padding(horizontal = 40.dp, vertical = 24.dp)
    ) {
        // Search Input Bar
        Row(
            Modifier
                .fillMaxWidth()
                .padding(end = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            androidx.compose.material3.OutlinedTextField(
                value = text,
                onValueChange = {
                    text = it
                    vm.onQueryChange(it)
                },
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
                placeholder = { Text("Tìm kiếm YouTube — bài hát, nghệ sĩ, phim, chủ đề…", color = Color(0xFFAAAAAA)) },
                leadingIcon = {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = "Search",
                        tint = Color.White.copy(alpha = 0.7f),
                        modifier = Modifier.padding(start = 8.dp)
                    )
                },
                trailingIcon = {
                    if (text.isNotBlank()) {
                        androidx.compose.material3.IconButton(onClick = {
                            text = ""
                            vm.onQueryChange("")
                        }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color.White)
                        }
                    }
                },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White,
                    focusedBorderColor = Color.White.copy(alpha = 0.6f),
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

            Button(
                onClick = { vm.searchNow() },
                modifier = Modifier.height(56.dp),
                contentPadding = PaddingValues(horizontal = 28.dp),
                shape = ButtonDefaults.shape(RoundedCornerShape(28.dp)),
                colors = ButtonDefaults.colors(
                    containerColor = YTBrandRed,
                    contentColor = Color.White,
                    focusedContainerColor = Color.White,
                    focusedContentColor = Color.Black
                )
            ) {
                Text("Search", fontWeight = FontWeight.Bold)
            }
        }

        // Live Autocomplete Suggestions Row (shown when user is typing)
        if (text.isNotBlank() && suggestions.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            TvLazyRow(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(vertical = 4.dp)
            ) {
                items(suggestions) { suggestion ->
                    SearchKeywordChip(
                        text = suggestion,
                        icon = Icons.Default.Search,
                        onClick = {
                            text = suggestion
                            vm.selectKeyword(suggestion)
                        }
                    )
                }
            }
        }

        Spacer(Modifier.height(14.dp))

        // Main Content Area
        if (query.isBlank() && results.isEmpty() && !loading) {
            // Pre-Search Discover & Regional Trending View
            TvLazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(24.dp),
                contentPadding = PaddingValues(bottom = 32.dp)
            ) {
                // 1. Recent Searches (if any)
                if (recentSearches.isNotEmpty()) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.History,
                                        contentDescription = null,
                                        tint = Color.White.copy(alpha = 0.8f),
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Text(
                                        text = "Tìm kiếm gần đây",
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                        color = Color.White
                                    )
                                }

                                Button(
                                    onClick = { vm.clearRecentSearches() },
                                    colors = ButtonDefaults.colors(
                                        containerColor = Color.Transparent,
                                        focusedContainerColor = Color.White,
                                        contentColor = YTTextSecondary,
                                        focusedContentColor = Color.Black
                                    )
                                ) {
                                    Text("Xoá lịch sử", style = MaterialTheme.typography.labelSmall)
                                }
                            }

                            TvLazyRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                contentPadding = PaddingValues(vertical = 4.dp)
                            ) {
                                items(recentSearches) { recent ->
                                    SearchKeywordChip(
                                        text = recent,
                                        icon = Icons.Default.History,
                                        onClick = {
                                            text = recent
                                            vm.selectKeyword(recent)
                                        }
                                    )
                                }
                            }
                        }
                    }
                }

                // 2. Vietnam Trending Searches ("🔥 Xu hướng tìm kiếm tại Việt Nam")
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
                                    imageVector = Icons.Default.Whatshot,
                                    contentDescription = null,
                                    tint = YTBrandRed,
                                    modifier = Modifier.size(22.dp)
                                )
                                Text(
                                    text = "Xu hướng tìm kiếm tại Việt Nam (VN)",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = Color.White
                                )
                            }

                            Button(
                                onClick = { vm.refreshTrending() },
                                colors = ButtonDefaults.colors(
                                    containerColor = Color(0xFF212121),
                                    focusedContainerColor = Color.White,
                                    contentColor = YTTextSecondary,
                                    focusedContentColor = Color.Black
                                )
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp))
                                    Text("Cập nhật", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }

                        // Display trending keywords in 2 horizontal rows for rich, easy TV browsing
                        val half = (trendingKeywords.size + 1) / 2
                        val row1 = trendingKeywords.take(half)
                        val row2 = trendingKeywords.drop(half)

                        TvLazyRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            contentPadding = PaddingValues(vertical = 2.dp)
                        ) {
                            items(row1) { keyword ->
                                SearchKeywordChip(
                                    text = keyword,
                                    icon = Icons.AutoMirrored.Filled.TrendingUp,
                                    isPrimary = true,
                                    onClick = {
                                        text = keyword
                                        vm.selectKeyword(keyword)
                                    }
                                )
                            }
                        }

                        if (row2.isNotEmpty()) {
                            TvLazyRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                contentPadding = PaddingValues(vertical = 2.dp)
                            ) {
                                items(row2) { keyword ->
                                    SearchKeywordChip(
                                        text = keyword,
                                        icon = Icons.AutoMirrored.Filled.TrendingUp,
                                        isPrimary = false,
                                        onClick = {
                                            text = keyword
                                            vm.selectKeyword(keyword)
                                        }
                                    )
                                }
                            }
                        }
                    }
                }

                // 3. Vietnam Categories & Popular Topics
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(
                            text = "Khám phá chủ đề phổ biến",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )

                        vm.topicCategories.forEach { (catName, keywords) ->
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    text = catName,
                                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                                    color = YTTextSecondary
                                )
                                TvLazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    contentPadding = PaddingValues(vertical = 2.dp)
                                ) {
                                    items(keywords) { kw ->
                                        SearchKeywordChip(
                                            text = kw,
                                            onClick = {
                                                text = kw
                                                vm.selectKeyword(kw)
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Search Results View
            if (loading) {
                Row(
                    modifier = Modifier.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Đang tìm kiếm…", color = YTTextSecondary, style = MaterialTheme.typography.bodyMedium)
                }
            }

            if (results.isEmpty() && query.isNotBlank() && !loading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            "Không tìm thấy kết quả cho \"$query\"",
                            color = Color.White,
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            "Thử tìm bằng từ khoá khác hoặc chọn các gợi ý xu hướng ở trên.",
                            color = YTTextSecondary,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
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
                        items(chunk, key = { it.id }) { v ->
                            YtTvVideoCard(video = v, onClick = { onVideoClick(v.id) })
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SearchKeywordChip(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    isPrimary: Boolean = false,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.padding(vertical = 2.dp),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(20.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (isPrimary) Color(0xFF2C1E1E) else Color(0xFF222222),
            contentColor = if (isPrimary) Color(0xFFFF8A80) else Color.White,
            focusedContainerColor = Color.White,
            focusedContentColor = Color.Black,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, if (isPrimary) YTBrandRed.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.12f))),
            focusedBorder = Border(BorderStroke(2.dp, Color.White))
        ),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.05f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(15.dp)
                )
            }
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium, fontSize = 13.sp)
            )
        }
    }
}

