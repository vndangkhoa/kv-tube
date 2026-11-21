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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.ui.adaptive.LocalWindowState
import com.kvtube.android.ui.adaptive.WidthClass
import com.kvtube.android.ui.theme.AstryxRadius

/** Thumbnail — the URL is already Invidious-proxied upstream (see
 *  VideoData.displayThumbnail); nothing here ever touches Google hosts. */
@Composable
private fun VideoThumb(
    video: VideoData,
    modifier: Modifier
) {
    AsyncImage(
        model = video.displayThumbnail,
        contentDescription = video.title,
        modifier = modifier,
        contentScale = ContentScale.Crop
    )
}

@Composable
fun VideoCard(
    video: VideoData,
    onVideoClick: (String) -> Unit,
    onChannelClick: ((String) -> Unit)? = null,
    onMoreClick: (() -> Unit)? = null,
    showChannelAvatar: Boolean = true,
    showChannelName: Boolean = true,
    modifier: Modifier = Modifier
) {
    val widthClass = LocalWindowState.current.widthClass
    val isWide = widthClass.isWide
    val isExpanded = widthClass == WidthClass.Expanded
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onVideoClick(video.id) }
            .padding(bottom = when {
                isExpanded -> 8.dp
                isWide -> 12.dp
                else -> 16.dp
            })
    ) {
        // 16:9 Thumbnail with LIVE / duration badge overlay
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(AstryxRadius.container))
                .border(
                    1.dp,
                    MaterialTheme.colorScheme.outlineVariant,
                    RoundedCornerShape(AstryxRadius.container)
                )
        ) {
            VideoThumb(
                video = video,
                modifier = Modifier.fillMaxWidth()
            )

            when {
                video.isLive -> LiveBadge(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(6.dp)
                )
                video.duration.isNotBlank() -> DurationBadge(
                    duration = video.duration,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(6.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(if (isExpanded) 8.dp else 10.dp))

        // Information row: Avatar + Title/Channel/Stats + 3-dot More button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(if (isExpanded) 8.dp else 10.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Channel Avatar
            if (showChannelAvatar) {
                ChannelAvatar(
                    avatarUrl = video.channelThumbnail.ifBlank { null },
                    channelName = video.displayChannelTitle,
                    size = if (isExpanded) 32.dp else 36.dp,
                    onClick = if (onChannelClick != null) {
                        { onChannelClick(video.displayChannelId) }
                    } else null
                )
            }

            // Title and Metadata
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = video.title,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontSize = 14.sp,
                        fontWeight = if (isExpanded) FontWeight.Medium else FontWeight.SemiBold,
                        lineHeight = 18.sp
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(if (isExpanded) 2.dp else 4.dp))

                val subtitle = buildString {
                    if (showChannelName && video.displayChannelTitle.isNotBlank()) {
                        append(video.displayChannelTitle)
                    }
                    if (video.viewCountFormatted.isNotBlank()) {
                        if (isNotEmpty()) append(" • ")
                        append(video.viewCountFormatted)
                    }
                    if (video.publishedAt.isNotBlank()) {
                        if (isNotEmpty()) append(" • ")
                        append(video.publishedAt)
                    }
                }

                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // 3-dot overflow menu
            if (onMoreClick != null) {
                IconButton(
                    onClick = onMoreClick,
                    modifier = Modifier.size(24.dp)
                ) {
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
}
