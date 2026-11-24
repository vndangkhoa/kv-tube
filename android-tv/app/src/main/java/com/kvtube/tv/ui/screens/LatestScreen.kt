package com.kvtube.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.kvtube.tv.ui.components.KvBrandLockup
import com.kvtube.tv.ui.components.YtCategoryRow
import com.kvtube.tv.ui.components.YtHeroRow
import com.kvtube.tv.ui.components.YtShelfSkeleton
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTChip
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTFocusInk
import com.kvtube.tv.ui.theme.YTTextPrimary
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
        if (state.hero.isEmpty() && state.rows.isEmpty()) {
            vm.refresh()
        }
    }

    TvLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(YTBackground)
            .padding(top = 14.dp),
        contentPadding = PaddingValues(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        item(key = "latest_header") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 36.dp, end = 36.dp, top = 6.dp, bottom = 10.dp),
            ) {
                Text(
                    text = "Mới nhất",
                    color = YTTextPrimary,
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "Video mới tải lên & thịnh hành gần đây • VN",
                    color = YTTextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        if (state.isLoading && state.hero.isEmpty() && state.rows.isEmpty()) {
            item(key = "latest_skel_1") { YtShelfSkeleton(showHeading = true, cardCount = 3) }
            item(key = "latest_skel_2") { YtShelfSkeleton(showHeading = true, cardCount = 3) }
        }

        state.error?.let { msg ->
            item(key = "latest_error") {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 36.dp, vertical = 24.dp),
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

        if (state.hero.isNotEmpty()) {
            item(key = "latest_hero") {
                YtHeroRow(
                    title = "Nổi bật gần đây",
                    videos = state.hero,
                    onVideoClick = { onVideoClick(it.id) },
                )
            }
        }

        state.rows.forEach { (title, list) ->
            item(key = "latest_row_$title") {
                YtCategoryRow(
                    title = title,
                    videos = list,
                    onVideoClick = { onVideoClick(it.id) },
                )
            }
        }
    }
}
