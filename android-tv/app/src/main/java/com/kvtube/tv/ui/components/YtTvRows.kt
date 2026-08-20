package com.kvtube.tv.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.itemsIndexed
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.kvtube.tv.data.model.TvVideo

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtCategoryRow(
    title: String,
    videos: List<TvVideo>,
    onVideoClick: (TvVideo) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (videos.isEmpty()) return
    val distinct = remember(videos) { videos.distinctBy { it.id } }
    Column(modifier.padding(vertical = 6.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold, fontSize = 16.sp),
            modifier = Modifier.padding(start = 32.dp, bottom = 6.dp)
        )
        TvLazyRow(
            contentPadding = PaddingValues(horizontal = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            itemsIndexed(distinct, key = { i, v -> "${title}_${v.id}_$i" }) { _, v ->
                YtTvVideoCard(video = v, onClick = { onVideoClick(v) })
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtHeroRow(
    title: String,
    videos: List<TvVideo>,
    onVideoClick: (TvVideo) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (videos.isEmpty()) return
    Column(modifier.padding(vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold, fontSize = 18.sp), modifier = Modifier.padding(start = 32.dp, bottom = 8.dp))
        TvLazyRow(contentPadding = PaddingValues(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            itemsIndexed(videos.take(6), key = { i, v -> "hero_${v.id}_$i" }) { _, v ->
                YtTvHeroCard(video = v, onClick = { onVideoClick(v) })
            }
        }
    }
}
