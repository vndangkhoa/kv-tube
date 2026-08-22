package com.kvtube.android.ui.screens.watch

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Intent
import android.util.Rational
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.outlined.ThumbDown
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.ui.components.ChannelAvatar
import com.kvtube.android.ui.components.DownloadBottomSheet
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

    // Hide/show system bars on fullscreen toggle
    LaunchedEffect(isFullscreen) {
        val window = activity?.window ?: return@LaunchedEffect
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (isFullscreen) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    if (uiState.isLoading) {
        LoadingSpinner(fullScreen = true)
        return
    }

    if (uiState.error != null && uiState.selectedUrl.isNullOrBlank() && !uiState.useIframeFallback) {
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

    if (isFullscreen) {
        // Fullscreen: player covers everything
        if (uiState.useIframeFallback) {
            Box(modifier = Modifier.fillMaxSize()) {
                YouTubeIframePlayer(
                    videoId = videoId,
                    modifier = Modifier.fillMaxSize(),
                    onBackClick = { isFullscreen = false }
                )
            }
        } else {
            uiState.selectedUrl?.let { url ->
                Box(modifier = Modifier.fillMaxSize()) {
                    ExoPlayerView(
                        videoUrl = url,
                        audioUrl = uiState.audioUrl,
                        isFullscreen = true,
                        onFullscreenToggle = { isFullscreen = false },
                        onError = { viewModel.fallbackToIframe() },
                        onEnterPip = {
                            activity?.let { act ->
                                (act as? com.kvtube.android.MainActivity)?.setPipVideo(
                                    videoUrl = url,
                                    audioUrl = uiState.audioUrl
                                )
                                val params = PictureInPictureParams.Builder()
                                    .setAspectRatio(Rational(16, 9))
                                    .build()
                                act.enterPictureInPictureMode(params)
                            }
                        },
                        onBackClick = { isFullscreen = false },
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }
    } else {
        // Normal portrait layout
        Column(modifier = Modifier.fillMaxSize()) {
            if (uiState.useIframeFallback) {
                YouTubeIframePlayer(
                    videoId = videoId,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f),
                    onBackClick = { navController.popBackStack() }
                )
            } else {
                uiState.selectedUrl?.let { url ->
                    ExoPlayerView(
                        videoUrl = url,
                        audioUrl = uiState.audioUrl,
                        isFullscreen = false,
                        onFullscreenToggle = { isFullscreen = true },
                        onError = { viewModel.fallbackToIframe() },
                        onEnterPip = {
                            activity?.let { act ->
                                (act as? com.kvtube.android.MainActivity)?.setPipVideo(
                                    videoUrl = url,
                                    audioUrl = uiState.audioUrl
                                )
                                val params = PictureInPictureParams.Builder()
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

            LazyColumn(
                modifier = Modifier.fillMaxSize()
            ) {
                // Video Info Section
                item {
                    uiState.video?.let { video ->
                        VideoInfoSection(
                            video = video,
                            playbackFormats = uiState.playbackInfo?.videoFormats ?: emptyList(),
                            selectedQuality = uiState.selectedQualityLabel,
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

                // Comments preview box
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 6.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
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
                                color = Color(0xFF3EA6FF),
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
                                    avatarUrl = topComment.authorThumbnail.ifBlank { null },
                                    channelName = topComment.author,
                                    size = 22.dp
                                )
                                Text(
                                    text = topComment.text,
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }

                // Comments list
                if (uiState.showComments) {
                    items(uiState.comments) { comment ->
                        CommentItem(comment = comment)
                    }
                }

                // Related videos header
                item {
                    Text(
                        text = "Related videos",
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)
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
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
                    )
                }
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
                    thumbnail = video?.displayThumbnail ?: "",
                    channelTitle = video?.displayChannelTitle ?: "",
                    duration = video?.duration ?: "",
                    quality = quality
                )
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
    selectedQuality: String?,
    isSubscribed: Boolean,
    onSubscribeClick: () -> Unit,
    onFormatSelected: (PlaybackFormat) -> Unit,
    onDownloadClick: () -> Unit,
    onShareClick: () -> Unit,
    onChannelClick: (String) -> Unit
) {
    var showFormats by remember { mutableStateOf(false) }
    var isLiked by remember { mutableStateOf(false) }
    var isDisliked by remember { mutableStateOf(false) }
    var isSaved by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        // Title
        Text(
            text = video.title,
            style = MaterialTheme.typography.titleMedium.copy(
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                lineHeight = 22.sp
            ),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.height(6.dp))

        // Views and publish info
        val metaString = buildString {
            if (video.viewCountFormatted.isNotBlank()) append(video.viewCountFormatted)
            if (video.publishedAt.isNotBlank()) {
                if (isNotEmpty()) append(" • ")
                append(video.publishedAt)
            }
        }
        if (metaString.isNotBlank()) {
            Text(
                text = metaString,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Channel row
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            ChannelAvatar(
                avatarUrl = video.channelThumbnail.ifBlank { null },
                channelName = video.displayChannelTitle,
                size = 36.dp,
                onClick = { onChannelClick(video.displayChannelId) }
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onChannelClick(video.displayChannelId) }
            ) {
                Text(
                    text = video.displayChannelTitle,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (video.subscriberCount.isNotBlank()) {
                    Text(
                        text = video.subscriberCount,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            SubscribeButton(
                isSubscribed = isSubscribed,
                onToggle = onSubscribeClick
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Save pill — sits right next to the channel/subscribe row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { isSaved = !isSaved }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = if (isSaved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                    contentDescription = "Save",
                    tint = if (isSaved) Color(0xFF3EA6FF) else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = if (isSaved) "Saved" else "Save",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // YouTube Action Bar: Like/Dislike pill, Share, Download, Quality, Save
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Segmented Like / Dislike pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier
                        .clickable {
                            isLiked = !isLiked
                            if (isLiked) isDisliked = false
                        }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = if (isLiked) Icons.Filled.ThumbUp else Icons.Outlined.ThumbUp,
                        contentDescription = "Like",
                        tint = if (isLiked) Color(0xFF3EA6FF) else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = if (isLiked) "Liked" else "Like",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(16.dp)
                        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                )

                Box(
                    modifier = Modifier
                        .clickable {
                            isDisliked = !isDisliked
                            if (isDisliked) isLiked = false
                        }
                        .padding(horizontal = 10.dp, vertical = 7.dp)
                ) {
                    Icon(
                        imageVector = if (isDisliked) Icons.Filled.ThumbDown else Icons.Outlined.ThumbDown,
                        contentDescription = "Dislike",
                        tint = if (isDisliked) Color(0xFF3EA6FF) else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            // Share pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { onShareClick() }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Share,
                    contentDescription = "Share",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = "Share",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            // Download pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { onDownloadClick() }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Download,
                    contentDescription = "Download",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = "Download",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            // Quality picker pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { showFormats = !showFormats }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Settings,
                    contentDescription = "Quality",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = selectedQuality?.let { "Quality • $it" } ?: "Quality",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        // Expanded quality picker drawer
        if (showFormats && playbackFormats.isNotEmpty()) {
            Spacer(modifier = Modifier.height(10.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(8.dp)
            ) {
                playbackFormats.forEach { format ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onFormatSelected(format)
                                showFormats = false
                            }
                            .padding(vertical = 8.dp, horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${format.height}p",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = format.ext.uppercase(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (!format.hasAudio) {
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "video only",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CommentItem(
    comment: Comment
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        ChannelAvatar(
            avatarUrl = comment.authorThumbnail.ifBlank { null },
            channelName = comment.author,
            size = 32.dp
        )
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = comment.author,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = comment.timestamp,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(3.dp))
            Text(
                text = comment.text,
                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.sp, lineHeight = 18.sp),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 6
            )
            if (comment.likes > 0) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "👍 ${comment.likes}",
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * Always-works fallback player: the official YouTube embed iframe rendered in a
 * WebView. Used when on-device extraction and the server playback-info path
 * both fail (YouTube blocking, server yt-dlp down, etc.).
 */
@Composable
fun YouTubeIframePlayer(
    videoId: String,
    modifier: Modifier = Modifier,
    onBackClick: () -> Unit = {}
) {
    val context = LocalContext.current
    val embedUrl = remember(videoId) {
        "https://www.youtube.com/embed/$videoId?autoplay=1&playsinline=1"
    }

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                webChromeClient = WebChromeClient()
                setOnKeyListener { _, keyCode, _ ->
                    if (keyCode == android.view.KeyEvent.KEYCODE_BACK) {
                        if (canGoBack()) {
                            goBack()
                        } else {
                            onBackClick()
                        }
                        true
                    } else false
                }
                loadUrl(embedUrl)
            }
        },
        modifier = modifier
    )
}
