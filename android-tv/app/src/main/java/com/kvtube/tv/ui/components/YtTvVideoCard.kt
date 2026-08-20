package com.kvtube.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTChip

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtTvVideoCard(
    video: TvVideo,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    showChannel: Boolean = true,
) {
    // TV focus: scale + border glow (leanback-native)
    Card(
        onClick = onClick,
        modifier = modifier.width(220.dp),
        shape = CardDefaults.shape(RoundedCornerShape(12.dp)),
        scale = CardDefaults.scale(focusedScale = 1.06f),
        border = CardDefaults.border(focusedBorder = Border(BorderStroke(2.dp, Color.White))),
        glow = CardDefaults.glow(focusedGlow = Glow(elevationColor = Color.White.copy(alpha = 0.45f), elevation = 12.dp),
        ),
        colors = CardDefaults.colors(
            containerColor = YTChip.copy(alpha = 0.0f),
            focusedContainerColor = YTChip.copy(alpha = 0.18f),
        ),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF212121))
            ) {
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(video.thumbnail)
                        .crossfade(true)
                        .build(),
                    contentDescription = video.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
                if (video.duration.isNotBlank()) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(6.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color.Black.copy(alpha = 0.82f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(video.duration, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, color = Color.White))
                    }
                }
                if (video.isLive) {
                    Box(
                        Modifier
                            .align(Alignment.TopStart)
                            .padding(6.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(YTBrandRed)
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text("LIVE", color = Color.White, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold))
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = video.title,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = Color.White,
                style = MaterialTheme.typography.titleSmall.copy(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold, color = Color.White),
                modifier = Modifier.padding(horizontal = 2.dp),
            )
            if (showChannel) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = buildString {
                        append(video.channelTitle)
                        video.viewsText?.let { if (isNotEmpty()) append(" • "); append(it) }
                        video.publishedText?.let { if (it.isNotBlank()) { if (isNotEmpty()) append(" • "); append(it) } }
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = Color(0xFFE0E0E0),
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp, color = Color(0xFFE0E0E0)),
                    modifier = Modifier.padding(horizontal = 2.dp, vertical = 2.dp),
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtTvVideoRowCard(
    video: TvVideo,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = CardDefaults.shape(RoundedCornerShape(8.dp)),
        scale = CardDefaults.scale(focusedScale = 1.05f),
        border = CardDefaults.border(focusedBorder = Border(BorderStroke(2.dp, Color.White))),
        colors = CardDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color.White.copy(alpha = 0.15f)
        )
    ) {
        Row(
            Modifier.padding(6.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                Modifier
                    .width(100.dp)
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0xFF212121))
            ) {
                AsyncImage(model = video.thumbnail, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                if (video.duration.isNotBlank()) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(2.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(Color.Black.copy(0.8f))
                            .padding(horizontal = 3.dp, vertical = 0.dp)
                    ) {
                        Text(video.duration, color = Color.White, style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp))
                    }
                }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    video.title,
                    color = Color.White,
                    style = MaterialTheme.typography.titleSmall.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, lineHeight = 14.sp),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "${video.channelTitle} • ${video.publishedText ?: ""}",
                    color = Color(0xFFAAAAAA),
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                    maxLines = 1
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun YtTvHeroCard(
    video: TvVideo,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier.width(440.dp).height(248.dp),
        shape = CardDefaults.shape(RoundedCornerShape(16.dp)),
        scale = CardDefaults.scale(focusedScale = 1.04f),
        border = CardDefaults.border(focusedBorder = Border(BorderStroke(2.dp, Color.White))),
        glow = CardDefaults.glow(focusedGlow = Glow(elevationColor = Color.White.copy(alpha = 0.35f), elevation = 14.dp)),
        colors = CardDefaults.colors(containerColor = Color(0xFF1A1A1A)),
    ) {
        Box(Modifier.fillMaxSize()) {
            AsyncImage(model = video.thumbnail, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))
            Column(Modifier.align(Alignment.BottomStart).padding(16.dp).fillMaxWidth(0.92f)) {
                Text(video.title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.headlineSmall.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold))
                Spacer(Modifier.height(4.dp))
                Text(
                    buildString {
                        append(video.channelTitle)
                        video.viewsText?.let { append(" • "); append(it) }
                    },
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, color = Color.White.copy(0.9f)),
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
