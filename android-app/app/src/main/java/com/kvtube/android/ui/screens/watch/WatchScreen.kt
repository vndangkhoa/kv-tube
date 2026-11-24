package com.kvtube.android.ui.screens.watch

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Intent
import android.util.Rational
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed as gridItemsIndexed
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.outlined.ThumbDown
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import coil3.compose.AsyncImage
import com.kvtube.android.data.local.ThumbnailRouter
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.QualityTier
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.ui.adaptive.LocalWindowState
import com.kvtube.android.ui.adaptive.findActivity
import com.kvtube.android.ui.components.ChannelAvatar
import com.kvtube.android.ui.components.DownloadBottomSheet
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.ShimmerEffect
import com.kvtube.android.ui.components.SubscribeButton
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.components.VideoCardSkeleton
import com.kvtube.android.ui.navigation.Screen
import com.kvtube.android.ui.theme.AstryxRadius
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
    val activity = context.findActivity()
    val windowState = LocalWindowState.current

    var showDownloadSheet by remember { mutableStateOf(false) }
    var isFullscreen by remember { mutableStateOf(false) }
    var isTheater by rememberSaveable { mutableStateOf(false) }
    var dismissedTabletop by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(windowState.isTabletop) {
        if (windowState.isTabletop) dismissedTabletop = false
    }

    val canToggleTheater = windowState.isLandscapeTwoPaneWatch && !windowState.isTabletop
    val theaterMode = isTheater && canToggleTheater

    // Watch screen top strip behind the player is pure black: keep status icons white
    // (including in light theme), paint the system status bar black (the theme paints it
    // with the app background, which would show as a grey band above the player) and
    // restore the theme appearance on exit.
    DisposableEffect(activity) {
        val window = activity?.window
        if (window != null) {
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            val prevLight = controller.isAppearanceLightStatusBars
            @Suppress("DEPRECATION")
            val prevStatusColor = window.statusBarColor
            controller.isAppearanceLightStatusBars = false
            @Suppress("DEPRECATION")
            window.statusBarColor = android.graphics.Color.BLACK
            onDispose {
                controller.isAppearanceLightStatusBars = prevLight
                @Suppress("DEPRECATION")
                window.statusBarColor = prevStatusColor
            }
        } else {
            onDispose {}
        }
    }

    // Hide/show system bars on fullscreen toggle + rotate to landscape
    LaunchedEffect(isFullscreen) {
        val window = activity?.window ?: return@LaunchedEffect
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (isFullscreen) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            // Draw under display cutouts/notches in landscape
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                window.attributes.layoutInDisplayCutoutMode =
                    android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            if (!windowState.isWide) {
                activity.requestedOrientation =
                    android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            }
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
            activity.requestedOrientation =
                android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        // Let MainScreen know so it hides/shows its top & bottom chrome
        viewModel.setPlayerFullscreen(isFullscreen)
    }

    // Always restore orientation + app chrome when leaving the watch page
    DisposableEffect(Unit) {
        onDispose {
            viewModel.setPlayerFullscreen(false)
            activity?.requestedOrientation =
                android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    // System back exits fullscreen first instead of leaving the watch page
    BackHandler(enabled = isFullscreen) {
        isFullscreen = false
    }

    // Picture-in-Picture requires API 26 — on older devices even touching
    // PictureInPictureParams kills the process (NoClassDefFoundError), so the
    // button simply isn't offered below Android 8.
    val pipAction: (() -> Unit)? =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            {
                activity?.let { act ->
                    (act as? com.kvtube.android.MainActivity)?.setPipVideo(
                        videoUrl = uiState.selectedUrl.orEmpty(),
                        audioUrl = uiState.audioUrl
                    )
                    val params = PictureInPictureParams.Builder()
                        .setAspectRatio(Rational(16, 9))
                        .build()
                    act.enterPictureInPictureMode(params)
                }
            }
        } else null

    if (uiState.isLoading) {
        LoadingSpinner(
            fullScreen = true,
            text = "Loading video...",
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .statusBarsPadding()
                .navigationBarsPadding()
        )
        return
    }

    if (uiState.error != null && uiState.selectedUrl.isNullOrBlank() && !uiState.useIframeFallback) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .statusBarsPadding()
                .navigationBarsPadding(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = uiState.error ?: "Error loading video",
                    color = MaterialTheme.colorScheme.error,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(24.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(onClick = { viewModel.retry() }) {
                    Text("Retry")
                }
            }
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
                        sharedPlayer = viewModel.playbackManagerRef.player,
                        isFullscreen = true,
                        onFullscreenToggle = { isFullscreen = false },
                        onError = { viewModel.fallbackToIframe() },
                        onEnterPip = pipAction,
                        onBackClick = { isFullscreen = false },
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }
    } else {
        // ---- Shared building blocks ----
        val playerContent: @Composable (Modifier, Boolean, Boolean) -> Unit =
            { playerModifier, fillAvailable, hideOverlay ->
                if (uiState.useIframeFallback) {
                    YouTubeIframePlayer(
                        videoId = videoId,
                        modifier = if (fillAvailable) playerModifier else playerModifier.aspectRatio(16f / 9f),
                        onBackClick = { navController.popBackStack() }
                    )
                } else {
                    val selectedUrl = uiState.selectedUrl
                    if (selectedUrl != null) {
                        ExoPlayerView(
                            videoUrl = selectedUrl,
                            audioUrl = uiState.audioUrl,
                            sharedPlayer = viewModel.playbackManagerRef.player,
                            isFullscreen = false,
                            onFullscreenToggle = { isFullscreen = true },
                            onError = { viewModel.fallbackToIframe() },
                            onEnterPip = pipAction,
                            onTheaterToggle = if (canToggleTheater) {
                                { isTheater = !isTheater }
                            } else null,
                            isTheater = theaterMode,
                            cornerRadius = 0.dp,
                            fillAvailableSpace = fillAvailable,
                            hideOverlayControls = hideOverlay,
                            onBackClick = { navController.popBackStack() },
                            modifier = playerModifier
                        )
                    } else {
                        val posterModifier = if (fillAvailable) {
                            playerModifier.background(Color.Black)
                        } else {
                            playerModifier
                                .aspectRatio(16f / 9f)
                                .background(Color.Black)
                        }
                        Box(modifier = posterModifier) {
                            AsyncImage(
                                model = uiState.video?.displayThumbnail?.ifBlank {
                                    ThumbnailRouter.video(videoId)
                                } ?: ThumbnailRouter.video(videoId),
                                contentDescription = uiState.video?.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(Color.Black.copy(alpha = 0.35f))
                            )
                            IconButton(
                                onClick = { navController.popBackStack() },
                                modifier = Modifier
                                    .align(Alignment.TopStart)
                                    .padding(6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = "Back",
                                    tint = Color.White
                                )
                            }
                            CircularProgressIndicator(
                                color = YTBrandRed,
                                strokeWidth = 2.5.dp,
                                modifier = Modifier
                                    .size(34.dp)
                                    .align(Alignment.Center)
                            )
                        }
                    }
                }
            }

        val infoSectionBlock: @Composable () -> Unit = {
            uiState.video?.let { video ->
                VideoInfoSection(
                    video = video,
                    tierDescriptions = uiState.tierDescriptions,
                    selectedTier = uiState.selectedTier,
                    selectedQualityLabel = uiState.selectedQualityLabel,
                    isSubscribed = uiState.isSubscribed,
                    onSubscribeClick = { viewModel.toggleSubscription() },
                    onTierSelected = { tier -> viewModel.selectQualityTier(tier) },
                    onDownloadClick = { showDownloadSheet = true },
                    onShareClick = {
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, video.title)
                            val base = uiState.serverBaseUrl.ifBlank { "https://youtube.com" }
                            putExtra(Intent.EXTRA_TEXT, "$base/watch?v=$videoId")
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Share video"))
                    },
                    onChannelClick = { channelId ->
                        navController.navigate(Screen.Channel.createRoute(channelId))
                    }
                )
            }
        }

        val commentsHeaderBlock: @Composable () -> Unit = {
            CommentsPreviewCard(
                uiState = uiState,
                onToggle = { viewModel.toggleComments() }
            )
        }

        val commentsFooterBlock: @Composable () -> Unit = {
            CommentsLoadMoreFooter(
                isLoadingMore = uiState.isLoadingMoreComments,
                onLoadMore = { viewModel.loadMoreComments() }
            )
        }

        // Title / channel / actions / comments (LazyColumn panes)
        val infoItems: LazyListScope.() -> Unit = {
            item { infoSectionBlock() }
            item { commentsHeaderBlock() }
            if (uiState.showComments) {
                if (uiState.isLoadingComments && uiState.comments.isEmpty()) {
                    item { CommentsLoadingIndicator() }
                } else if (uiState.comments.isEmpty()) {
                    item { CommentsEmptyText() }
                } else {
                    itemsIndexed(
                        uiState.comments,
                        key = { idx, comment -> "c_${idx}_${comment.id}" }
                    ) { _, comment ->
                        CommentItem(comment = comment)
                    }
                    if (!uiState.commentsContinuation.isNullOrBlank()) {
                        item { commentsFooterBlock() }
                    }
                }
            }
        }

        // Title / channel / actions / comments (full-span items for 2-col foldable grid)
        val gridInfoItems: LazyGridScope.() -> Unit = {
            item(span = { GridItemSpan(maxLineSpan) }) { infoSectionBlock() }
            item(span = { GridItemSpan(maxLineSpan) }) { commentsHeaderBlock() }
            if (uiState.showComments) {
                if (uiState.isLoadingComments && uiState.comments.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) { CommentsLoadingIndicator() }
                } else if (uiState.comments.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) { CommentsEmptyText() }
                } else {
                    gridItemsIndexed(
                        uiState.comments,
                        key = { idx, comment -> "gc_${idx}_${comment.id}" },
                        span = { _, _ -> GridItemSpan(maxLineSpan) }
                    ) { _, comment ->
                        CommentItem(comment = comment)
                    }
                    if (!uiState.commentsContinuation.isNullOrBlank()) {
                        item(span = { GridItemSpan(maxLineSpan) }) { commentsFooterBlock() }
                    }
                }
            }
        }

        val relatedCardPadding = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)

        // Related videos (LazyColumn panes: full VideoCards)
        val relatedItems: LazyListScope.() -> Unit = {
            item {
                RelatedSectionHeader(
                    horizontalPadding = if (windowState.isCompact) 14.dp else 4.dp
                )
            }
            if (uiState.isLoadingRelated && uiState.relatedVideos.isEmpty()) {
                items(2, key = { "rel_skel_$it" }) {
                    VideoCardSkeleton(
                        modifier = if (windowState.isCompact) relatedCardPadding else Modifier
                    )
                }
            } else {
                itemsIndexed(
                    uiState.relatedVideos,
                    key = { idx, item -> "${item.id}_$idx" }
                ) { _, related ->
                    VideoCard(
                        video = related,
                        onVideoClick = { id ->
                            navController.navigate(Screen.Watch.createRoute(id))
                        },
                        onChannelClick = { channelId ->
                            navController.navigate(Screen.Channel.createRoute(channelId))
                        },
                        modifier = if (windowState.isCompact) relatedCardPadding else Modifier
                    )
                }
            }
        }

        when {
            windowState.isTabletop -> {
                // Flex / Tabletop Mode (half-opened horizontal hinge): clean video above hinge,
                // rounded "Video controls" panel below hinge.
                BoxWithConstraints(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black)
                ) {
                    val topPaneHeight = if (windowState.hingeTopDp > 120f) {
                        windowState.hingeTopDp.dp
                    } else {
                        maxHeight * 0.5f
                    }
                    Column(modifier = Modifier.fillMaxSize()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(topPaneHeight)
                                .background(Color.Black)
                                .statusBarsPadding()
                        ) {
                            playerContent(Modifier.fillMaxSize(), true, !dismissedTabletop)
                        }
                        if (windowState.hingeHeightDp > 0f) {
                            Spacer(modifier = Modifier.height(windowState.hingeHeightDp.dp))
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                        ) {
                            if (!dismissedTabletop) {
                                TabletopVideoControls(
                                    player = viewModel.playbackManagerRef.player,
                                    title = uiState.video?.title.orEmpty(),
                                    channelName = uiState.video?.displayChannelTitle.orEmpty(),
                                    hasNext = uiState.relatedVideos.isNotEmpty(),
                                    onPrevious = { navController.popBackStack() },
                                    onNext = {
                                        uiState.relatedVideos.firstOrNull()?.let { next ->
                                            navController.navigate(Screen.Watch.createRoute(next.id))
                                        }
                                    },
                                    onFullscreen = { isFullscreen = true },
                                    onClose = { dismissedTabletop = true },
                                    modifier = Modifier.fillMaxSize()
                                )
                            } else {
                                Column(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(MaterialTheme.colorScheme.background)
                                        .navigationBarsPadding()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 14.dp, vertical = 8.dp),
                                        horizontalArrangement = Arrangement.End
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(18.dp))
                                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                                .clickable { dismissedTabletop = false }
                                                .padding(horizontal = 12.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Filled.Tune,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onSurface,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Text(
                                                text = "Show video controls",
                                                style = MaterialTheme.typography.bodySmall,
                                                fontWeight = FontWeight.Medium,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                        }
                                    }
                                    LazyVerticalGrid(
                                        columns = GridCells.Fixed(2),
                                        modifier = Modifier
                                            .weight(1f)
                                            .fillMaxWidth(),
                                        contentPadding = PaddingValues(bottom = 16.dp)
                                    ) {
                                        gridInfoItems()
                                        item(span = { GridItemSpan(maxLineSpan) }) {
                                            RelatedSectionHeader()
                                        }
                                        gridItemsIndexed(
                                            uiState.relatedVideos,
                                            key = { idx, item -> "t_${item.id}_$idx" }
                                        ) { idx, related ->
                                            VideoCard(
                                                video = related,
                                                onVideoClick = { id ->
                                                    navController.navigate(Screen.Watch.createRoute(id))
                                                },
                                                onChannelClick = { channelId ->
                                                    navController.navigate(Screen.Channel.createRoute(channelId))
                                                },
                                                modifier = Modifier.padding(
                                                    start = if (idx % 2 == 0) 12.dp else 6.dp,
                                                    end = if (idx % 2 == 0) 6.dp else 12.dp
                                                )
                                            )
                                        }
                                        if (uiState.isLoadingRelated && uiState.relatedVideos.isEmpty()) {
                                            items(2) { idx ->
                                                VideoCardSkeleton(
                                                    modifier = Modifier.padding(
                                                        start = if (idx % 2 == 0) 12.dp else 6.dp,
                                                        end = if (idx % 2 == 0) 6.dp else 12.dp
                                                    )
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            windowState.isFoldablePortraitWatch -> {
                // Unfolded foldable portrait (600–839dp): black status strip, edge-to-edge pinned
                // player at top, video info + comments + 2-column related VideoCard grid below.
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.Black)
                            .windowInsetsTopHeight(WindowInsets.statusBars)
                    )
                    BoxWithConstraints(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                    ) {
                        val playerHeight = min(maxWidth * 9f / 16f, maxHeight * 0.56f)
                        Column(modifier = Modifier.fillMaxSize()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(playerHeight)
                                    .background(Color.Black),
                                contentAlignment = Alignment.Center
                            ) {
                                playerContent(Modifier.fillMaxSize(), true, false)
                            }
                            LazyVerticalGrid(
                                columns = GridCells.Fixed(2),
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth()
                                    .navigationBarsPadding(),
                                contentPadding = PaddingValues(bottom = 16.dp)
                            ) {
                                gridInfoItems()
                                item(span = { GridItemSpan(maxLineSpan) }) {
                                    RelatedSectionHeader()
                                }
                                gridItemsIndexed(
                                    uiState.relatedVideos,
                                    key = { idx, item -> "fp_${item.id}_$idx" }
                                ) { idx, related ->
                                    VideoCard(
                                        video = related,
                                        onVideoClick = { id ->
                                            navController.navigate(Screen.Watch.createRoute(id))
                                        },
                                        onChannelClick = { channelId ->
                                            navController.navigate(Screen.Channel.createRoute(channelId))
                                        },
                                        modifier = Modifier.padding(
                                            start = if (idx % 2 == 0) 12.dp else 6.dp,
                                            end = if (idx % 2 == 0) 6.dp else 12.dp
                                        )
                                    )
                                }
                                if (uiState.isLoadingRelated && uiState.relatedVideos.isEmpty()) {
                                    items(2) { idx ->
                                        VideoCardSkeleton(
                                            modifier = Modifier.padding(
                                                start = if (idx % 2 == 0) 12.dp else 6.dp,
                                                end = if (idx % 2 == 0) 6.dp else 12.dp
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            windowState.isLandscapeTwoPaneWatch -> {
                // Unfolded foldable landscape / Book posture / Tablet watch screen
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.Black)
                            .windowInsetsTopHeight(WindowInsets.statusBars)
                    )
                    if (theaterMode) {
                        // Theater: full-width pinned player on top, info + related panel below
                        BoxWithConstraints(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                        ) {
                            val playerHeight = min(maxWidth * 9f / 16f, maxHeight * 0.72f)
                            val playerWidth = playerHeight * 16f / 9f
                            Column(modifier = Modifier.fillMaxSize()) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(playerHeight)
                                        .background(Color.Black),
                                    contentAlignment = Alignment.Center
                                ) {
                                    playerContent(
                                        Modifier
                                            .width(playerWidth)
                                            .fillMaxHeight(),
                                        true,
                                        false
                                    )
                                }
                                Row(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxWidth()
                                        .navigationBarsPadding()
                                ) {
                                    LazyColumn(
                                        modifier = Modifier
                                            .weight(0.64f)
                                            .fillMaxHeight()
                                    ) {
                                        infoItems()
                                    }
                                    Surface(
                                        modifier = Modifier
                                            .weight(0.36f)
                                            .fillMaxHeight()
                                            .padding(start = 8.dp, end = 10.dp, top = 8.dp),
                                        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                                        color = MaterialTheme.colorScheme.surfaceContainerLow
                                    ) {
                                        LazyColumn(
                                            modifier = Modifier.fillMaxSize(),
                                            contentPadding = PaddingValues(12.dp),
                                            verticalArrangement = Arrangement.spacedBy(12.dp)
                                        ) {
                                            relatedItems()
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Default 2-pane landscape: edge-to-edge player + info left, rounded card panel right
                        val useHingeSplit = windowState.isBook && windowState.hingeStartDp > 200f
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .navigationBarsPadding()
                        ) {
                            val leftModifier = if (useHingeSplit) {
                                Modifier.width(windowState.hingeStartDp.dp)
                            } else {
                                Modifier.weight(0.64f)
                            }
                            BoxWithConstraints(modifier = leftModifier.fillMaxHeight()) {
                                val playerHeight = min(maxWidth * 9f / 16f, maxHeight * 0.62f)
                                val playerWidth = playerHeight * 16f / 9f
                                Column(modifier = Modifier.fillMaxSize()) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(playerHeight)
                                            .background(Color.Black),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        playerContent(
                                            Modifier
                                                .width(playerWidth)
                                                .fillMaxHeight(),
                                            true,
                                            false
                                        )
                                    }
                                    LazyColumn(
                                        modifier = Modifier
                                            .weight(1f)
                                            .fillMaxWidth()
                                    ) {
                                        infoItems()
                                    }
                                }
                            }
                            if (useHingeSplit && windowState.hingeWidthDp > 0f) {
                                Spacer(modifier = Modifier.width(windowState.hingeWidthDp.dp))
                            }
                            val rightModifier = if (useHingeSplit) {
                                Modifier.weight(1f)
                            } else {
                                Modifier.weight(0.36f)
                            }
                            Surface(
                                modifier = rightModifier
                                    .fillMaxHeight()
                                    .padding(start = 8.dp, end = 10.dp, top = 8.dp),
                                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                                color = MaterialTheme.colorScheme.surfaceContainerLow
                            ) {
                                LazyColumn(
                                    modifier = Modifier.fillMaxSize(),
                                    contentPadding = PaddingValues(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    relatedItems()
                                }
                            }
                        }
                    }
                }
            }

            else -> {
                // Compact phones (< 600dp): edge-to-edge player + details & related column below
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.Black)
                            .windowInsetsTopHeight(WindowInsets.statusBars)
                    )
                    playerContent(Modifier.fillMaxWidth(), false, false)
                    LazyColumn(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .navigationBarsPadding()
                    ) {
                        infoItems()
                        relatedItems()
                    }
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
    tierDescriptions: Map<QualityTier, String>,
    selectedTier: QualityTier,
    selectedQualityLabel: String?,
    isSubscribed: Boolean,
    onSubscribeClick: () -> Unit,
    onTierSelected: (QualityTier) -> Unit,
    onDownloadClick: () -> Unit,
    onShareClick: () -> Unit,
    onChannelClick: (String) -> Unit
) {
    var showFormats by remember { mutableStateOf(false) }
    var isLiked by remember { mutableStateOf(false) }
    var isDisliked by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp)
        ) {
            // Title
            if (video.title.isBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.92f)
                        .height(18.dp)
                        .clip(RoundedCornerShape(4.dp))
                ) {
                    ShimmerEffect(modifier = Modifier.fillMaxSize())
                }
                Spacer(modifier = Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.58f)
                        .height(18.dp)
                        .clip(RoundedCornerShape(4.dp))
                ) {
                    ShimmerEffect(modifier = Modifier.fillMaxSize())
                }
            } else {
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
            }

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
            val hasChannelInfo = video.channelTitle.isNotBlank() || video.uploader.isNotBlank()
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (hasChannelInfo || video.title.isNotBlank()) {
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
                } else {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(androidx.compose.foundation.shape.CircleShape)
                    ) {
                        ShimmerEffect(modifier = Modifier.fillMaxSize())
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Box(
                        modifier = Modifier
                            .width(120.dp)
                            .height(14.dp)
                            .clip(RoundedCornerShape(4.dp))
                    ) {
                        ShimmerEffect(modifier = Modifier.fillMaxSize())
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // YouTube Action Bar: full-bleed horizontal scroll with Like/Dislike pill, Share, Download, Quality
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 14.dp),
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
                        tint = if (isLiked) YTBrandRed else MaterialTheme.colorScheme.onSurface,
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
                        tint = MaterialTheme.colorScheme.onSurface,
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

            // Compact Quality picker pill
            val compactQuality = selectedQualityLabel?.takeIf { it.isNotBlank() }?.let {
                "${selectedTier.label} • $it"
            } ?: selectedTier.label
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
                    text = compactQuality,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1
                )
            }
        }

        // Expanded quality picker drawer: Auto / Low / Maximum (audio always merged)
        if (showFormats && tierDescriptions.isNotEmpty()) {
            Spacer(modifier = Modifier.height(10.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(8.dp)
            ) {
                QualityTier.entries.forEach { tier ->
                    val isSelected = tier == selectedTier
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onTierSelected(tier)
                                showFormats = false
                            }
                            .padding(vertical = 10.dp, horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = tierDescriptions[tier] ?: tier.label,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1f)
                        )
                        if (isSelected) {
                            Icon(
                                imageVector = Icons.Filled.Check,
                                contentDescription = "Selected",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RelatedSectionHeader(horizontalPadding: androidx.compose.ui.unit.Dp = 14.dp) {
    Text(
        text = "Related videos",
        style = MaterialTheme.typography.titleSmall.copy(
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold
        ),
        modifier = Modifier.padding(horizontal = horizontalPadding, vertical = 10.dp)
    )
}

@Composable
private fun CommentsPreviewCard(
    uiState: WatchUiState,
    onToggle: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(AstryxRadius.container))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(AstryxRadius.container))
            .clickable { onToggle() }
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val countLabel = uiState.commentsCount?.let { " ($it)" }
                ?: if (uiState.comments.isNotEmpty()) " (${uiState.comments.size})" else ""
            Text(
                text = "Comments$countLabel",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f)
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = if (uiState.showComments) "Hide" else "Show",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium
                )
                Icon(
                    imageVector = if (uiState.showComments) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp)
                )
            }
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

@Composable
private fun CommentsLoadingIndicator() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
    }
}

@Composable
private fun CommentsEmptyText() {
    Text(
        text = "No comments available",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
    )
}

@Composable
private fun CommentsLoadMoreFooter(
    isLoadingMore: Boolean,
    onLoadMore: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        if (isLoadingMore) {
            CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
        } else {
            TextButton(onClick = onLoadMore) {
                Text(
                    text = "Load more comments",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
internal fun CommentItem(
    comment: Comment,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
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
                    text = comment.displayTime,
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
