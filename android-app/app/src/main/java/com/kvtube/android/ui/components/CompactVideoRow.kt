package com.kvtube.android.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.kvtube.android.data.model.VideoData

@Composable
fun CompactVideoRow(
    video: VideoData,
    onClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    thumbnailWidth: Dp? = null,
    onMoreClick: (() -> Unit)? = null
) {
    androidx.compose.foundation.layout.BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        // Keep thumbnails compact like YouTube Web (~140–156dp) while scaling down on narrow panes
        val thumbWidth = thumbnailWidth ?: (maxWidth * 0.38f).coerceIn(112.dp, 156.dp)
        CompactVideoRowContent(video, onClick, thumbWidth, onMoreClick)
    }
}

@Composable
private fun CompactVideoRowContent(
    video: VideoData,
    onClick: (String) -> Unit,
    thumbnailWidth: Dp,
    onMoreClick: (() -> Unit)?
) {
    val shape = RoundedCornerShape(8.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick(video.id) }
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .width(thumbnailWidth)
                .aspectRatio(16f / 9f)
                .clip(shape)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
        ) {
            AsyncImage(
                model = video.displayThumbnail,
                contentDescription = video.title,
                modifier = Modifier.matchParentSize(),
                contentScale = ContentScale.Crop
            )
            when {
                video.isLive -> LiveBadge(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(4.dp)
                )
                video.duration.isNotBlank() -> DurationBadge(
                    duration = video.duration,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(4.dp)
                )
            }
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = video.title,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 17.sp
                ),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(3.dp))
            if (video.displayChannelTitle.isNotBlank()) {
                Text(
                    text = video.displayChannelTitle,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            val meta = buildString {
                if (video.viewCountFormatted.isNotBlank()) append(video.viewCountFormatted)
                if (video.publishedAt.isNotBlank()) {
                    if (isNotEmpty()) append(" • ")
                    append(video.publishedAt)
                }
            }
            if (meta.isNotBlank()) {
                Text(
                    text = meta,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        if (onMoreClick != null) {
            IconButton(onClick = onMoreClick, modifier = Modifier.size(24.dp)) {
                Icon(
                    imageVector = Icons.Default.MoreVert,
                    contentDescription = "More options",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}
