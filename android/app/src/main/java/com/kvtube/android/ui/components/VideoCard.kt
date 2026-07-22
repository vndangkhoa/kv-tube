package com.kvtube.android.ui.components

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.kvtube.android.data.model.VideoData

@Composable
fun VideoCard(
    video: VideoData,
    onVideoClick: (String) -> Unit,
    onChannelClick: ((String) -> Unit)? = null,
    showChannelName: Boolean = true,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onVideoClick(video.id) }
    ) {
        // Thumbnail
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(12.dp))
        ) {
            AsyncImage(
                model = video.thumbnail.ifBlank {
                    "https://i.ytimg.com/vi/${video.id}/hqdefault.jpg"
                },
                contentDescription = video.title,
                modifier = Modifier.fillMaxWidth(),
                contentScale = ContentScale.Crop
            )

            // Duration badge
            if (video.duration.isNotBlank()) {
                DurationBadge(
                    duration = video.duration,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(4.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Info row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                // Title
                Text(
                    text = video.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    lineHeight = MaterialTheme.typography.titleMedium.lineHeight
                )

                Spacer(modifier = Modifier.height(4.dp))

                // Channel name
                if (showChannelName) {
                    Text(
                        text = video.displayChannelTitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        modifier = if (onChannelClick != null) {
                            Modifier.clickable { onChannelClick(video.displayChannelId) }
                        } else Modifier
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }

                // Views and date
                Text(
                    text = buildString {
                        video.viewCountFormatted.let { if (it.isNotEmpty()) append(it) }
                        video.publishedAt.let {
                            if (it.isNotEmpty()) {
                                if (isNotEmpty()) append(" · ")
                                append(it)
                            }
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
        }
    }
}
