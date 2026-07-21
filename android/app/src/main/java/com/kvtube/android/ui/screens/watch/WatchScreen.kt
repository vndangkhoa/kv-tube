package com.kvtube.android.ui.screens.watch

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.util.Rational
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.draw.clip
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
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchScreen(
    videoId: String,
    navController: NavController,
    viewModel: WatchViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val activity = context as? Activity

    var showDownloadSheet by remember { mutableStateOf(false) }
    var isFullscreen by remember { mutableStateOf(false) }

    LaunchedEffect(isFullscreen) {
        activity?.requestedOrientation = if (isFullscreen)
            ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        else
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }

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
                    audioUrl = uiState.audioUrl,
                    isFullscreen = isFullscreen,
                    onFullscreenToggle = { isFullscreen = !isFullscreen },
                    onEnterPip = {
                        activity?.let { act ->
                            val params = PictureInPictureParams.Builder()
                                .setSourceRectHint(android.graphics.Rect())
                                .setAspectRatio(Rational(16, 9))
                                .build()
                            act.enterPictureInPictureMode(params)
                        }
                    },
                    onBackClick = { navController.popBackStack() },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        if (!isFullscreen) {
            // Video Info
            item {
                uiState.video?.let { video ->
                    VideoInfoSection(
                        video = video,
                        playbackFormats = uiState.playbackInfo?.videoFormats ?: emptyList(),
                        isSubscribed = uiState.isSubscribed,
                        onSubscribeClick = { viewModel.toggleSubscription() },
                        onFormatSelected = { format -> viewModel.selectQuality(format) },
                        onDownloadClick = { showDownloadSheet = true },
                        onShareClick = {
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, video.title)
                                putExtra(Intent.EXTRA_TEXT, "https://youtube.com/watch?v=$videoId")
                            }
                            context.startActivity(Intent.createChooser(shareIntent, "Share video"))
                        },
                        onChannelClick = { channelId ->
                            navController.navigate(Screen.Channel.createRoute(channelId))
                        }
                    )
                }
            }

            // Comments section in a grey card (YouTube style)
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                        .clickable { viewModel.toggleComments() }
                        .padding(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Comments",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            text = if (uiState.showComments) "Hide" else "Show",
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    if (!uiState.showComments && uiState.comments.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        val topComment = uiState.comments.first()
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ChannelAvatar(
                                avatarUrl = topComment.authorThumbnail,
                                channelName = topComment.author,
                                size = 24.dp
                            )
                            Text(
                                text = topComment.text,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // Comments list (visible when expanded)
            if (uiState.showComments) {
                items(uiState.comments) { comment ->
                    CommentItem(comment = comment)
                }
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
    isSubscribed: Boolean,
    onSubscribeClick: () -> Unit,
    onFormatSelected: (PlaybackFormat) -> Unit,
    onDownloadClick: () -> Unit,
    onShareClick: () -> Unit,
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
            SubscribeButton(
                isSubscribed = isSubscribed,
                onToggle = onSubscribeClick
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Actions horizontal scrolling bar (YouTube style)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Like/Save Pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { isSaved = !isSaved }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = if (isSaved) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder,
                    contentDescription = "Save",
                    tint = if (isSaved) YTBrandRed else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (isSaved) "Liked" else "Like",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            // Download Pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { onDownloadClick() }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Download,
                    contentDescription = "Download",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Download",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            // Share Pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { onShareClick() }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Share,
                    contentDescription = "Share",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Share",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            // Quality Pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { showFormats = !showFormats }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Settings,
                    contentDescription = "Quality",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Quality",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        if (showFormats && playbackFormats.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                    .padding(8.dp)
            ) {
                playbackFormats.forEach { format ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onFormatSelected(format) }
                            .padding(vertical = 8.dp, horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${format.height}p",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
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
