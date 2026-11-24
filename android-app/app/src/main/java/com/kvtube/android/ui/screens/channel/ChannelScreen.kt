package com.kvtube.android.ui.screens.channel

import com.kvtube.android.ui.components.gridVerticalSpacing
import com.kvtube.android.ui.components.gridHorizontalSpacing
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import com.kvtube.android.ui.components.CenteredContent
import com.kvtube.android.ui.components.ChannelAvatar
import com.kvtube.android.ui.components.rememberVideoGridCells
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.SubscribeButton
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.navigation.Screen
import com.kvtube.android.ui.theme.AstryxRadius

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
        LoadingSpinner(fullScreen = true, text = "Loading channel & uploads...")
        return
    }

    val channel = uiState.channel
    if (channel == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                    modifier = Modifier.size(64.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Outlined.CloudOff,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(30.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Couldn't load channel",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = uiState.error ?: "Check your connection or server and try again.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(18.dp))
                Button(
                    onClick = { viewModel.loadChannel(channelId) },
                    shape = CircleShape
                ) {
                    Text("Retry", fontWeight = FontWeight.SemiBold)
                }
            }
        }
        return
    }

    run {
        val chromeInsets = com.kvtube.android.ui.theme.LocalGlassChromeInsets.current
        var showBanner by remember(channel.id) { mutableStateOf(!channel.bannerUrl.isNullOrBlank()) }
        var descriptionExpanded by remember(channel.id) { mutableStateOf(false) }

        CenteredContent {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = chromeInsets.calculateTopPadding())
        ) {
            // Compact rounded banner (collapsed completely if missing/error)
            if (showBanner && !channel.bannerUrl.isNullOrBlank()) {
                val bannerShape = RoundedCornerShape(AstryxRadius.container)
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
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                        .height(88.dp)
                        .clip(bannerShape)
                        .border(
                            1.dp,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f),
                            bannerShape
                        ),
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

            // Channel description card (tap to expand)
            if (!channel.description.isNullOrBlank()) {
                val descShape = RoundedCornerShape(AstryxRadius.element)
                Surface(
                    shape = descShape,
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                    border = BorderStroke(
                        1.dp,
                        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .clip(descShape)
                        .clickable { descriptionExpanded = !descriptionExpanded }
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = channel.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = if (descriptionExpanded) 20 else 2,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                        )
                        if (descriptionExpanded || channel.description.length > 90) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = if (descriptionExpanded) "Show less" else "More",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }

            HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                modifier = Modifier.padding(top = 10.dp)
            )

            // Videos
            Text(
                text = "Videos",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 6.dp)
            )

            if (uiState.videos.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No videos available",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyVerticalGrid(
                    columns = rememberVideoGridCells(),
                    contentPadding = PaddingValues(
                        start = 12.dp,
                        end = 12.dp,
                        top = 4.dp,
                        bottom = chromeInsets.calculateBottomPadding() + 12.dp
                    ),
                    horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
                    verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
                ) {
                    items(uiState.videos, key = { it.id }) { video ->
                        VideoCard(
                            video = video,
                            onVideoClick = { id ->
                                navController.navigate(Screen.Watch.createRoute(id))
                            },
                            showChannelAvatar = false,
                            showChannelName = false
                        )
                    }
                }
            }
        }
        }
    }
}
