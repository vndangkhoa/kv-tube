package com.kvtube.android.ui.screens.channel

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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

        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Banner
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
                        .height(60.dp)
                        .clip(RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp)),
                    contentScale = ContentScale.Crop
                )
            }

            // Channel header
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                ChannelAvatar(
                    avatarUrl = channel.avatarUrl,
                    channelName = channel.title,
                    size = 72.dp
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = channel.title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
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

                Spacer(modifier = Modifier.height(12.dp))

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
