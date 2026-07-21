package com.kvtube.android.ui.screens.watch

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.ui.components.ChannelAvatar
import com.kvtube.android.ui.components.DownloadBottomSheet
import com.kvtube.android.ui.components.DurationBadge
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.SubscribeButton
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.navigation.Screen
import com.kvtube.android.ui.theme.YTBrandRed

@Composable
fun WatchScreen(
    videoId: String,
    navController: NavController,
    viewModel: WatchViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showDownloadSheet by remember { mutableStateOf(false) }
    val context = LocalContext.current

    if (uiState.isLoading) {
        LoadingSpinner(fullScreen = true)
        return
    }

    if (uiState.error != null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = uiState.error ?: "Error loading video",
                color = MaterialTheme.colorScheme.error
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize()
    ) {
        // Video Player
        item {
            uiState.selectedUrl?.let { url ->
                ExoPlayerView(
                    videoUrl = url,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Video Info
        item {
            uiState.video?.let { video ->
                VideoInfoSection(
                    video = video,
                    playbackFormats = uiState.playbackInfo?.videoFormats ?: emptyList(),
                    onFormatSelected = { format -> viewModel.selectQuality(format) },
                    onDownloadClick = { showDownloadSheet = true },
                    onChannelClick = { channelId ->
                        navController.navigate(Screen.Channel.createRoute(channelId))
                    }
                )
            }
        }

        // Divider
        item {
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
            )
        }

        // Comments header
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { viewModel.toggleComments() }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Comments",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = if (uiState.showComments) "Hide" else "Show",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }

        // Comments
        if (uiState.showComments) {
            items(uiState.comments) { comment ->
                CommentItem(comment = comment)
            }
        }

        // Divider
        item {
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
            )
        }

        // Related videos header
        item {
            Text(
                text = "Related",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
        }

        // Related videos
        items(uiState.relatedVideos) { related ->
            VideoCard(
                video = related,
                onVideoClick = { id ->
                    navController.navigate(Screen.Watch.createRoute(id))
                },
                onChannelClick = { channelId ->
                    navController.navigate(Screen.Channel.createRoute(channelId))
                },
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
            )
        }
    }

    if (showDownloadSheet) {
        val video = uiState.video
        val progress = viewModel.activeDownloads.collectAsState(initial = emptyMap()).value[videoId]

        DownloadBottomSheet(
            videoId = videoId,
            videoTitle = video?.title ?: "",
            progress = progress,
            onStartDownload = { quality ->
                viewModel.startDownload(
                    context = context,
                    videoId = videoId,
                    title = video?.title ?: "",
                    thumbnail = video?.thumbnail ?: "",
                    channelTitle = video?.displayChannelTitle ?: "",
                    duration = video?.duration ?: "",
                    quality = quality
                )
                showDownloadSheet = false
            },
            onCancel = {
                viewModel.cancelDownload(context, videoId)
                showDownloadSheet = false
            },
            onDismiss = { showDownloadSheet = false }
        )
    }
}

@Composable
private fun VideoInfoSection(
    video: VideoData,
    playbackFormats: List<PlaybackFormat>,
    onFormatSelected: (PlaybackFormat) -> Unit,
    onDownloadClick: () -> Unit,
    onChannelClick: (String) -> Unit
) {
    var showFormats by remember { mutableStateOf(false) }
    var isSaved by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // Title
        Text(
            text = video.title,
            style = MaterialTheme.typography.titleMedium.copy(
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            ),
            maxLines = 2
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Stats row
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = buildString {
                    video.viewCount?.let { if (it.isNotEmpty()) append("$it views") }
                    video.publishedAt?.let {
                        if (isNotEmpty()) append(" · ")
                        append(it)
                    }
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Channel row + subscribe
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            ChannelAvatar(
                avatarUrl = video.avatarUrl,
                channelName = video.displayChannelTitle,
                size = 40.dp
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = video.displayChannelTitle,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable { onChannelClick(video.displayChannelId) }
                )
            }
            SubscribeButton(isSubscribed = false, onToggle = { /* TODO */ })
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Action buttons row
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Like/Save
            IconButton(onClick = { isSaved = !isSaved }) {
                Icon(
                    imageVector = if (isSaved) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
                    contentDescription = "Save",
                    tint = if (isSaved) YTBrandRed else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Download
            IconButton(onClick = onDownloadClick) {
                Icon(
                    imageVector = Icons.Filled.Download,
                    contentDescription = "Download",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Share
            IconButton(onClick = { /* TODO */ }) {
                Icon(
                    imageVector = Icons.Filled.Share,
                    contentDescription = "Share",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Quality selector
        Button(
            onClick = { showFormats = !showFormats },
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface
            )
        ) {
            Text("Quality")
        }

        if (showFormats && playbackFormats.isNotEmpty()) {
            Spacer(modifier = Modifier.height(8.dp))
            playbackFormats.forEach { format ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onFormatSelected(format) }
                        .padding(vertical = 4.dp, horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${format.height}p",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = format.ext.uppercase(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentItem(
    comment: com.kvtube.android.data.model.Comment
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        ChannelAvatar(
            avatarUrl = comment.authorThumbnail,
            channelName = comment.author,
            size = 32.dp
        )
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = comment.author,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = comment.published,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = comment.text,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 4
            )
            if (comment.likes > 0) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${comment.likes} likes",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
