package com.kvtube.tv.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SpaceBar
import androidx.compose.material.icons.filled.Whatshot
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
import com.kvtube.tv.ui.components.KvBrandLockup
import com.kvtube.tv.ui.components.TvTextField
import com.kvtube.tv.ui.components.YtShelfSkeleton
import com.kvtube.tv.ui.components.YtTvVideoCard
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBorderSubtle
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusGlow
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTSurface
import com.kvtube.tv.ui.theme.YTSurfaceElevated
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.viewmodel.SearchViewModel

private val TV_KEY_ROWS = listOf(
    listOf("A", "B", "C", "D", "E", "F"),
    listOf("G", "H", "I", "J", "K", "L"),
    listOf("M", "N", "O", "P", "Q", "R"),
    listOf("S", "T", "U", "V", "W", "X"),
    listOf("Y", "Z", "0", "1", "2", "3"),
    listOf("4", "5", "6", "7", "8", "9"),
)

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SearchScreen(
    onVideoClick: (String) -> Unit,
    vm: SearchViewModel = viewModel(),
) {
    val query by vm.query.collectAsState()
    val lastSearchedQuery by vm.lastSearchedQuery.collectAsState()
    val results by vm.results.collectAsState()
    val loading by vm.loading.collectAsState()
    val suggestions by vm.suggestions.collectAsState()
    val trendingKeywords by vm.trendingKeywords.collectAsState()
    val recentSearches by vm.recentSearches.collectAsState()

    Column(
        Modifier
            .fillMaxSize()
            .background(YTBackground)
            .padding(horizontal = 36.dp, vertical = 20.dp)
    ) {
        // Header Bar: Pill Search input + compact KV-Tube mark
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TvTextField(
                value = query,
                onValueChange = { vm.onQueryChange(it) },
                modifier = Modifier.weight(1f),
                placeholder = {
                    Text(
                        text = "Tìm kiếm KV-Tube — bài hát, nghệ sĩ, phim, chủ đề…",
                        color = YTTextSecondary,
                    )
                },
                leadingIcon = {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = "Search",
                        tint = YTTextSecondary,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                },
                trailingIcon = {
                    if (query.isNotBlank()) {
                        androidx.compose.material3.IconButton(onClick = { vm.onQueryChange("") }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear", tint = YTTextPrimary)
                        }
                    }
                },
                imeAction = ImeAction.Search,
                onImeAction = { vm.searchNow() },
            )

            Button(
                onClick = { vm.searchNow() },
                modifier = Modifier.height(48.dp),
                contentPadding = PaddingValues(horizontal = 24.dp),
                shape = ButtonDefaults.shape(CircleShape),
                colors = ButtonDefaults.colors(
                    containerColor = YTChip,
                    contentColor = YTTextPrimary,
                    focusedContainerColor = YTFocus,
                    focusedContentColor = YTFocusInk,
                ),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text("Search", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                }
            }
        }

        // Autocomplete strip while user types
        if (query.isNotBlank() && suggestions.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            TvLazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 2.dp),
            ) {
                items(suggestions, key = { "sug_$it" }) { suggestion ->
                    SearchKeywordChip(
                        text = suggestion,
                        icon = Icons.Default.Search,
                        onClick = { vm.selectKeyword(suggestion) },
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Split YouTube TV Living-Room Canvas: Left on-screen D-pad keyboard | Right discovery/results
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            // ── Left: Authentic YouTube TV On-Screen D-Pad Keyboard ──────────
            TvOnScreenKeyboard(
                onChar = { ch -> vm.onQueryChange(query + ch.lowercase()) },
                onSpace = { vm.onQueryChange(if (query.endsWith(" ") || query.isEmpty()) query else "$query ") },
                onBackspace = { if (query.isNotEmpty()) vm.onQueryChange(query.dropLast(1)) },
                onClear = { vm.onQueryChange("") },
                onSearch = { vm.searchNow() },
                modifier = Modifier.width(268.dp),
            )

            // ── Right: Discovery Suggestions OR Search Video Results ─────────
            Box(Modifier.weight(1f).fillMaxHeight()) {
                if (lastSearchedQuery.isBlank() && results.isEmpty() && !loading) {
                    TvLazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                        contentPadding = PaddingValues(bottom = 24.dp),
                    ) {
                        if (recentSearches.isNotEmpty()) {
                            item(key = "recent_block") {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
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
                                                tint = YTTextSecondary,
                                                modifier = Modifier.size(18.dp),
                                            )
                                            Text(
                                                text = "Tìm kiếm gần đây",
                                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                                color = YTTextPrimary,
                                            )
                                        }
                                        SmallActionPill(
                                            label = "Xoá lịch sử",
                                            onClick = { vm.clearRecentSearches() },
                                        )
                                    }
                                    TvLazyRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        contentPadding = PaddingValues(vertical = 2.dp),
                                    ) {
                                        items(recentSearches, key = { "rec_$it" }) { recent ->
                                            SearchKeywordChip(
                                                text = recent,
                                                icon = Icons.Default.History,
                                                onClick = { vm.selectKeyword(recent) },
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        item(key = "vn_trending_block") {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Whatshot,
                                            contentDescription = null,
                                            tint = YTBrandRed,
                                            modifier = Modifier.size(20.dp),
                                        )
                                        Text(
                                            text = "Xu hướng tìm kiếm tại Việt Nam",
                                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                            color = YTTextPrimary,
                                        )
                                    }
                                    SmallActionPill(
                                        label = "Cập nhật",
                                        icon = Icons.Default.Refresh,
                                        onClick = { vm.refreshTrending() },
                                    )
                                }

                                val half = (trendingKeywords.size + 1) / 2
                                val row1 = trendingKeywords.take(half)
                                val row2 = trendingKeywords.drop(half)

                                TvLazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    contentPadding = PaddingValues(vertical = 2.dp),
                                ) {
                                    items(row1, key = { "tr1_$it" }) { keyword ->
                                        SearchKeywordChip(
                                            text = keyword,
                                            icon = Icons.AutoMirrored.Filled.TrendingUp,
                                            highlightIcon = true,
                                            onClick = { vm.selectKeyword(keyword) },
                                        )
                                    }
                                }

                                if (row2.isNotEmpty()) {
                                    TvLazyRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        contentPadding = PaddingValues(vertical = 2.dp),
                                    ) {
                                        items(row2, key = { "tr2_$it" }) { keyword ->
                                            SearchKeywordChip(
                                                text = keyword,
                                                icon = Icons.AutoMirrored.Filled.TrendingUp,
                                                onClick = { vm.selectKeyword(keyword) },
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        item(key = "topics_header") {
                            Text(
                                text = "Khám phá chủ đề phổ biến",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = YTTextPrimary,
                            )
                        }

                        vm.topicCategories.forEach { (catName, keywords) ->
                            item(key = "topic_$catName") {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        text = catName,
                                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                                        color = YTTextSecondary,
                                    )
                                    TvLazyRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        contentPadding = PaddingValues(vertical = 2.dp),
                                    ) {
                                        items(keywords, key = { "${catName}_$it" }) { kw ->
                                            SearchKeywordChip(
                                                text = kw,
                                                onClick = { vm.selectKeyword(kw) },
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    Column(Modifier.fillMaxSize()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = if (loading) "Đang tìm \"$lastSearchedQuery\"…"
                                else "Kết quả cho \"$lastSearchedQuery\" (${results.size})",
                                color = YTTextPrimary,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            )
                            SmallActionPill(
                                label = "Xoá kết quả",
                                icon = Icons.Default.Clear,
                                onClick = { vm.onQueryChange("") },
                            )
                        }

                        if (loading && results.isEmpty()) {
                            YtShelfSkeleton(showHeading = false, cardCount = 2)
                        } else if (results.isEmpty() && lastSearchedQuery.isNotBlank()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 40.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text(
                                        text = "Không tìm thấy kết quả cho \"$lastSearchedQuery\"",
                                        color = YTTextPrimary,
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                    Text(
                                        text = "Thử tìm bằng từ khoá khác hoặc bấm Xoá kết quả để xem gợi ý xu hướng.",
                                        color = YTTextSecondary,
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                            }
                        } else {
                            TvLazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                                contentPadding = PaddingValues(bottom = 24.dp),
                            ) {
                                val chunks = results.chunked(2)
                                items(chunks.size, key = { "res_row_$it" }) { rowIdx ->
                                    val chunk = chunks[rowIdx]
                                    TvLazyRow(
                                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 10.dp),
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        items(chunk, key = { it.id }) { v ->
                                            YtTvVideoCard(
                                                video = v,
                                                cardWidth = 250.dp,
                                                onClick = { onVideoClick(v.id) },
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TvOnScreenKeyboard(
    onChar: (String) -> Unit,
    onSpace: () -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        TV_KEY_ROWS.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                row.forEach { ch ->
                    Surface(
                        onClick = { onChar(ch) },
                        modifier = Modifier
                            .weight(1f)
                            .height(36.dp),
                        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
                        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.06f),
                        colors = ClickableSurfaceDefaults.colors(
                            containerColor = YTSurface,
                            contentColor = YTTextPrimary,
                            focusedContainerColor = YTFocus,
                            focusedContentColor = YTFocusInk,
                        ),
                        border = ClickableSurfaceDefaults.border(
                            border = Border(BorderStroke(0.75.dp, YTBorderSubtle)),
                            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
                        ),
                    ) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                text = ch,
                                style = MaterialTheme.typography.labelLarge.copy(
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                ),
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(2.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            KeyboardUtilityButton(
                label = "Space",
                icon = Icons.Default.SpaceBar,
                onClick = onSpace,
                modifier = Modifier.weight(1.4f),
            )
            KeyboardUtilityButton(
                label = null,
                icon = Icons.AutoMirrored.Filled.Backspace,
                onClick = onBackspace,
                modifier = Modifier.weight(1f),
            )
            KeyboardUtilityButton(
                label = "Xoá",
                icon = null,
                onClick = onClear,
                modifier = Modifier.weight(1f),
            )
        }

        Surface(
            onClick = onSearch,
            modifier = Modifier
                .fillMaxWidth()
                .height(40.dp),
            shape = ClickableSurfaceDefaults.shape(CircleShape),
            scale = ClickableSurfaceDefaults.scale(focusedScale = 1.03f),
            glow = ClickableSurfaceDefaults.glow(
                focusedGlow = Glow(elevationColor = YTFocusGlow, elevation = 10.dp),
            ),
            colors = ClickableSurfaceDefaults.colors(
                containerColor = YTSurfaceElevated,
                contentColor = YTTextPrimary,
                focusedContainerColor = YTFocus,
                focusedContentColor = YTFocusInk,
            ),
            border = ClickableSurfaceDefaults.border(
                border = Border(BorderStroke(1.dp, Color.White.copy(alpha = 0.14f))),
                focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
            ),
        ) {
            Row(
                Modifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Tìm kiếm",
                    style = MaterialTheme.typography.labelLarge.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                    ),
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun KeyboardUtilityButton(
    label: String?,
    icon: ImageVector?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.height(36.dp),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.05f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = YTChip,
            contentColor = YTTextPrimary,
            focusedContainerColor = YTFocus,
            focusedContentColor = YTFocusInk,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(0.75.dp, YTBorderSubtle)),
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
        ),
    ) {
        Row(
            Modifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = label, modifier = Modifier.size(16.dp))
            }
            if (label != null) {
                if (icon != null) Spacer(Modifier.width(4.dp))
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SmallActionPill(
    label: String,
    icon: ImageVector? = null,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = ClickableSurfaceDefaults.shape(CircleShape),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.04f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = YTChip,
            contentColor = YTTextSecondary,
            focusedContainerColor = YTFocus,
            focusedContentColor = YTFocusInk,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(0.75.dp, YTBorderSubtle)),
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
        ),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(13.dp))
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            )
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
    highlightIcon: Boolean = false,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.padding(vertical = 2.dp),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = YTChip,
            contentColor = YTTextPrimary,
            focusedContainerColor = YTFocus,
            focusedContentColor = YTFocusInk,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(0.75.dp, YTBorderSubtle)),
            focusedBorder = Border(BorderStroke(1.5.dp, YTFocus)),
        ),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.04f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = if (highlightIcon) YTBrandRed else LocalContentColor.current,
                )
            }
            Text(
                text = text,
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Medium,
                    fontSize = 12.5.sp,
                ),
            )
        }
    }
}
