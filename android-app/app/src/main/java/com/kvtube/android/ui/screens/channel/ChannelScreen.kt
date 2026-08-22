package com.kvtube.android.ui.screens.channel

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import coil3.compose.AsyncImagePainter
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import coil3.compose.AsyncImage
import com.kvtube.android.ui.components.ChannelAvatar
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.SubscribeButton
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.navigation.Screen

@Composable
fun ChannelScreen(
    channelId: String,
    navController: NavController,
    viewModel: ChannelViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(channelId) {
        viewModel.loadChannel(channelId)
    }

    if (uiState.isLoading) {
        LoadingSpinner(fullScreen = true)
        return
    }

    uiState.channel?.let { channel ->
        var showBanner by remember(channel.id) { mutableStateOf(!channel.bannerUrl.isNullOrBlank()) }
        var descriptionExpanded by remember(channel.id) { mutableStateOf(false) }

        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Compact banner
            if (showBanner && !channel.bannerUrl.isNullOrBlank()) {
                AsyncImage(
                    model = channel.bannerUrl,
                    contentDescription = null,
                    onState = { state ->
                        if (state is AsyncImagePainter.State.Error) {
                            showBanner = false
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                        .clip(RoundedCornerShape(bottomStart = 10.dp, bottomEnd = 10.dp)),
                    contentScale = ContentScale.Crop
                )
            }

            // Channel header: avatar + name/stats + subscribe aligned horizontally
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                ChannelAvatar(
                    avatarUrl = channel.avatarUrl,
                    channelName = channel.title,
                    size = 52.dp
                )

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = channel.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                    )
                    Text(
                        text = buildString {
                            if (channel.subscriberCount > 0) {
                                val count = channel.subscriberCount
                                val formattedSubscribers = when {
                                    count >= 1_000_000_000 -> String.format("%.1fB", count / 1_000_000_000f).replace(".0", "")
                                    count >= 1_000_000 -> String.format("%.1fM", count / 1_000_000f).replace(".0", "")
                                    count >= 1_000 -> String.format("%.1fk", count / 1_000f).replace(".0", "")
                                    else -> count.toString()
                                }
                                append("$formattedSubscribers subscribers")
                            }
                            if (channel.videoCount > 0) {
                                if (isNotEmpty()) append(" · ")
                                append("${channel.videoCount} videos")
                            }
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                SubscribeButton(
                    isSubscribed = uiState.isSubscribed,
                    onToggle = {
                        viewModel.toggleSubscription(
                            channel.id,
                            channel.title,
                            channel.avatarUrl ?: ""
                        )
                    }
                )
            }

            // Channel description (tap to expand)
            if (!channel.description.isNullOrBlank()) {
                Text(
                    text = channel.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = if (descriptionExpanded) 20 else 2,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { descriptionExpanded = !descriptionExpanded }
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }

            // Videos
            Text(
                text = "Videos",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )

            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 180.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(uiState.videos, key = { it.id }) { video ->
                    VideoCard(
                        video = video,
                        onVideoClick = { id ->
                            navController.navigate(Screen.Watch.createRoute(id))
                        },
                        showChannelName = false
                    )
                }
            }
        }
    }
}
