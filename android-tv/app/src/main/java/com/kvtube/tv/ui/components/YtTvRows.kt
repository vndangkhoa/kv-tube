package com.kvtube.tv.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.itemsIndexed
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.ui.theme.YTSurface
import com.kvtube.tv.ui.theme.YTSurfaceElevated
import com.kvtube.tv.ui.theme.YTTextPrimary

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
    Column(modifier = modifier.padding(top = 8.dp, bottom = 4.dp)) {
        if (title.isNotBlank()) {
            Text(
                text = title,
                color = YTTextPrimary,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                ),
                modifier = Modifier.padding(start = 36.dp, bottom = 2.dp),
            )
        }
        // Vertical padding (10dp) keeps focused 1.05x + concentric ring clear of headings above/below.
        TvLazyRow(
            contentPadding = PaddingValues(horizontal = 36.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            itemsIndexed(distinct, key = { _, v -> "${title}_${v.id}" }) { _, v ->
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
    Column(modifier = modifier.padding(top = 6.dp, bottom = 6.dp)) {
        Text(
            text = title,
            color = YTTextPrimary,
            style = MaterialTheme.typography.titleLarge.copy(
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
            ),
            modifier = Modifier.padding(start = 36.dp, bottom = 2.dp),
        )
        TvLazyRow(
            contentPadding = PaddingValues(horizontal = 36.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            itemsIndexed(videos.take(6), key = { _, v -> "hero_${v.id}" }) { _, v ->
                YtTvHeroCard(video = v, onClick = { onVideoClick(v) })
            }
        }
    }
}

/** YouTube TV Kabuki-style dark skeleton placeholders during asynchronous feed/category fetches. */
@Composable
fun YtShelfSkeleton(
    showHeading: Boolean = true,
    cardCount: Int = 3,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "YtSkeleton")
    val pulse by transition.animateFloat(
        initialValue = 0.55f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "YtSkeletonAlpha",
    )
    val tileColor = YTSurfaceElevated.copy(alpha = 0.55f + 0.30f * pulse)
    val metaColor = YTSurface.copy(alpha = 0.65f + 0.25f * pulse)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 36.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (showHeading) {
            Box(
                Modifier
                    .width(150.dp)
                    .height(20.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(tileColor)
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            repeat(cardCount) {
                Column(Modifier.width(254.dp)) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(16f / 9f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(tileColor)
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(
                            Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(metaColor)
                        )
                        Column(
                            Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth(0.9f)
                                    .height(14.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(tileColor)
                            )
                            Box(
                                Modifier
                                    .fillMaxWidth(0.55f)
                                    .height(11.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(metaColor)
                            )
                        }
                    }
                }
            }
        }
    }
}
