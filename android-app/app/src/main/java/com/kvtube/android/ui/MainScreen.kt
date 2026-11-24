package com.kvtube.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import com.kvtube.android.ui.adaptive.LocalWindowState
import com.kvtube.android.ui.navigation.AppNavigationRail
import androidx.compose.ui.res.painterResource
import com.kvtube.android.R
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.kvtube.android.ui.components.FloatingMiniPlayer
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.MiniPlayer
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.components.rememberVideoGridCells
import com.kvtube.android.ui.navigation.BottomNavBar
import com.kvtube.android.ui.navigation.NavGraph
import com.kvtube.android.ui.navigation.Screen
import com.kvtube.android.player.PlaybackManager
import com.kvtube.android.ui.notifications.NotificationsUiState
import com.kvtube.android.ui.notifications.NotificationsViewModel
import com.kvtube.android.ui.screens.search.SearchViewModel
import com.kvtube.android.ui.theme.LiquidGlassBackdropState
import com.kvtube.android.ui.theme.LocalGlassChromeInsets
import com.kvtube.android.ui.theme.LocalLiquidGlassBackdrop
import com.kvtube.android.ui.theme.LocalLiquidGlassLightAngle
import com.kvtube.android.ui.theme.liquidGlassBackdropSource
import com.kvtube.android.ui.theme.liquidGlassEdgeFade
import com.kvtube.android.ui.theme.liquidGlassFloating
import com.kvtube.android.ui.theme.rememberLiquidGlassLightAngle
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import javax.inject.Inject

/** Thin wrapper so composables can grab the singleton PlaybackManager. */
@HiltViewModel
class PlaybackViewModel @Inject constructor(
    val playbackManager: PlaybackManager,
    val fullscreenController: FullscreenController
) : ViewModel()

@Composable
fun MainScreen() {
    val navController = rememberNavController()
    val searchViewModel: SearchViewModel = hiltViewModel()

    var isSearchActive by remember { mutableStateOf(false) }
    val searchUiState by searchViewModel.uiState.collectAsState()
    val activeDownloadsCount by searchViewModel.activeDownloadsCount.collectAsState()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusRequester = remember { FocusRequester() }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // App-wide background playback (mini player)
    val playbackViewModel: PlaybackViewModel = hiltViewModel()
    val playbackManager = playbackViewModel.playbackManager
    val nowPlaying by playbackManager.nowPlaying.collectAsState()

    // Subscription updates: bell next to search + slide-in panel
    val notifViewModel: NotificationsViewModel = hiltViewModel()
    val notifUiState by notifViewModel.uiState.collectAsState()
    var isNotificationsOpen by remember { mutableStateOf(false) }
    // Snapshot of unseen ids captured when the panel opens — the badge clears
    // immediately but the red "NEW" chips stay for the videos you came to see.
    var highlightNewIds by remember { mutableStateOf(setOf<String>()) }

    // When the watch player goes fullscreen the whole scaffold chrome hides so
    // the video fills the entire screen.
    val isPlayerFullscreen by playbackViewModel.fullscreenController.isFullscreen.collectAsState()

    val showMiniPlayer = remember(nowPlaying, currentRoute) {
        nowPlaying != null &&
            currentRoute?.startsWith("watch/") != true &&
            currentRoute?.startsWith("localWatch") != true
    }

    // Pause background audio while watching Shorts (they have their own sound)
    LaunchedEffect(currentRoute) {
        if (currentRoute == Screen.Shorts.route) {
            playbackManager.pause()
        }
    }

    // Compact search: the page below stays visible until results are ready,
    // then search takes over the full content area.
    val showFullResults = isSearchActive &&
        (searchUiState.hasSearched || searchUiState.results.isNotEmpty())

    BackHandler(enabled = isSearchActive) {
        isSearchActive = false
        searchViewModel.onQueryChanged("")
        focusManager.clearFocus()
        keyboardController?.hide()
    }

    BackHandler(enabled = isNotificationsOpen) {
        isNotificationsOpen = false
    }

    val windowState = LocalWindowState.current
    val isWatchRoute = currentRoute?.startsWith("watch/") == true ||
        currentRoute?.startsWith("localWatch") == true
    val hideScaffoldChrome = isPlayerFullscreen || isWatchRoute
    val showRail = windowState.useNavigationRail && !hideScaffoldChrome
    val showBottomNav = !hideScaffoldChrome && !showRail && (!showMiniPlayer || windowState.isWide)
    val isShortsRoute = currentRoute == Screen.Shorts.route
    val showTopFloatingBar = !hideScaffoldChrome && (!isShortsRoute || isSearchActive)
    val onNavTabClick: (String) -> Unit = {
        isSearchActive = false
        searchViewModel.onQueryChanged("")
        focusManager.clearFocus()
    }

    // Liquid Glass backdrop layer + gravity-reactive highlight angle
    val backdropLayer = rememberGraphicsLayer()
    val backdropState = remember(backdropLayer) { LiquidGlassBackdropState(backdropLayer) }
    val lightAngle = rememberLiquidGlassLightAngle()

    LaunchedEffect(currentRoute, isSearchActive, isNotificationsOpen, showMiniPlayer) {
        backdropState.frameTick++
    }

    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val topChromeDp = if (showTopFloatingBar) statusTop + 62.dp else 0.dp
    val bottomChromeDp = if (!hideScaffoldChrome) {
        val bottomBarHeight = when {
            !windowState.isWide && showMiniPlayer -> 74.dp
            showBottomNav -> 76.dp
            else -> 0.dp
        }
        navBottom + bottomBarHeight
    } else {
        0.dp
    }
    val chromeInsets = PaddingValues(top = topChromeDp, bottom = bottomChromeDp)

    CompositionLocalProvider(
        LocalLiquidGlassBackdrop provides backdropState,
        LocalLiquidGlassLightAngle provides lightAngle,
        LocalGlassChromeInsets provides chromeInsets,
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
        ) {
            if (showRail) {
                AppNavigationRail(
                    navController = navController,
                    activeDownloadsCount = activeDownloadsCount,
                    onTabClick = onNavTabClick
                )
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .then(
                        if (showRail && !hideScaffoldChrome) {
                            Modifier.windowInsetsPadding(
                                WindowInsets.systemBars.only(WindowInsetsSides.End)
                            )
                        } else {
                            Modifier
                        }
                    )
            ) {
                // Layer 1: Scrollable content captured for live Liquid Glass backdrop sampling
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .then(
                            if (!hideScaffoldChrome) Modifier.liquidGlassBackdropSource(backdropState)
                            else Modifier
                        )
                ) {
                    when {
                        showFullResults -> {
                            SearchResultsContent(
                                uiState = searchUiState,
                                chromeInsets = chromeInsets,
                                onRetry = { searchViewModel.retry() },
                                onVideoClick = { videoId ->
                                    isSearchActive = false
                                    searchViewModel.onQueryChanged("")
                                    navController.navigate(Screen.Watch.createRoute(videoId))
                                },
                                onChannelClick = { channelId ->
                                    isSearchActive = false
                                    searchViewModel.onQueryChanged("")
                                    navController.navigate(Screen.Channel.createRoute(channelId))
                                }
                            )
                        }
                        isNotificationsOpen -> {
                            NotificationsPanel(
                                uiState = notifUiState,
                                highlightIds = highlightNewIds,
                                chromeInsets = chromeInsets,
                                onClose = { isNotificationsOpen = false },
                                onVideoClick = { videoId ->
                                    isNotificationsOpen = false
                                    navController.navigate(Screen.Watch.createRoute(videoId))
                                },
                                onChannelClick = { channelId ->
                                    isNotificationsOpen = false
                                    navController.navigate(Screen.Channel.createRoute(channelId))
                                }
                            )
                        }
                        else -> {
                            NavGraph(
                                navController = navController,
                                onOpenSearch = {
                                    isSearchActive = true
                                    searchViewModel.onQueryChanged("")
                                }
                            )
                        }
                    }
                }

                // Layer 2a: Top Floating Liquid Glass Chrome
                if (showTopFloatingBar) {
                    val subRouteTitle = when {
                        currentRoute == Screen.History.route -> "Watch history"
                        currentRoute == Screen.Subscriptions.route -> "Subscriptions"
                        currentRoute == Screen.Downloads.route -> "Downloads"
                        currentRoute == Screen.Settings.route -> "Settings"
                        currentRoute?.startsWith("channel/") == true -> "Channel"
                        else -> null
                    }

                    Box(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .fillMaxWidth()
                    ) {
                        Box(
                            modifier = Modifier
                                .matchParentSize()
                                .liquidGlassEdgeFade(toTop = true)
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .statusBarsPadding()
                                .padding(horizontal = 12.dp, vertical = 6.dp)
                                .height(50.dp)
                                .animateContentSize(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (isSearchActive) {
                                Box(
                                    modifier = Modifier.fillMaxWidth(),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .then(
                                                if (windowState.isWide) Modifier.widthIn(max = 640.dp)
                                                else Modifier
                                            )
                                            .fillMaxWidth()
                                            .height(46.dp)
                                            .liquidGlassFloating(shape = CircleShape)
                                            .padding(horizontal = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                    IconButton(onClick = {
                                        isSearchActive = false
                                        searchViewModel.onQueryChanged("")
                                        focusManager.clearFocus()
                                        keyboardController?.hide()
                                    }) {
                                        Icon(
                                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                            contentDescription = "Back"
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .padding(end = 6.dp),
                                        contentAlignment = Alignment.CenterStart
                                    ) {
                                        if (searchUiState.query.isEmpty()) {
                                            Text(
                                                text = "Search videos...",
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp)
                                            )
                                        }
                                        BasicTextField(
                                            value = searchUiState.query,
                                            onValueChange = { searchViewModel.onQueryChanged(it) },
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .focusRequester(focusRequester),
                                            singleLine = true,
                                            textStyle = MaterialTheme.typography.bodyMedium.copy(
                                                color = MaterialTheme.colorScheme.onSurface,
                                                fontSize = 15.sp
                                            ),
                                            cursorBrush = SolidColor(MaterialTheme.colorScheme.onSurface),
                                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                            keyboardActions = KeyboardActions(
                                                onSearch = {
                                                    searchViewModel.searchImmediate(searchUiState.query)
                                                    focusManager.clearFocus()
                                                    keyboardController?.hide()
                                                }
                                            )
                                        )
                                    }
                                    if (searchUiState.query.isNotEmpty()) {
                                        IconButton(
                                            onClick = {
                                                searchViewModel.onQueryChanged("")
                                                focusRequester.requestFocus()
                                            },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                                Icon(
                                                    imageVector = Icons.Filled.Close,
                                                    contentDescription = "Clear",
                                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            } else {
                                // Brand / Sub-route title capsule
                                Row(
                                    modifier = Modifier
                                        .height(46.dp)
                                        .widthIn(max = 260.dp)
                                        .liquidGlassFloating(shape = CircleShape)
                                        .padding(
                                            start = if (subRouteTitle != null) 4.dp else 14.dp,
                                            end = 16.dp
                                        ),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    if (subRouteTitle != null) {
                                        IconButton(
                                            onClick = { navController.popBackStack() },
                                            modifier = Modifier.size(38.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                                contentDescription = "Back"
                                            )
                                        }
                                        Text(
                                            text = subRouteTitle,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 17.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    } else {
                                        Image(
                                            painter = painterResource(id = R.drawable.ic_splash_logo),
                                            contentDescription = null,
                                            modifier = Modifier
                                                .size(22.dp)
                                                .clip(RoundedCornerShape(6.dp))
                                        )
                                        Text(
                                            text = "KV-Tube",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 18.sp,
                                            maxLines = 1
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.weight(1f))

                                // Paired action capsule: Notifications + Search share one capsule
                                Row(
                                    modifier = Modifier
                                        .height(46.dp)
                                        .liquidGlassFloating(shape = CircleShape)
                                        .padding(horizontal = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    IconButton(
                                        onClick = {
                                            isNotificationsOpen = true
                                            isSearchActive = false
                                            focusManager.clearFocus()
                                            highlightNewIds = notifUiState.unseenIds
                                            notifViewModel.markAllSeen()
                                            notifViewModel.refresh()
                                        },
                                        modifier = Modifier.size(40.dp)
                                    ) {
                                        BadgedBox(badge = {
                                            val unseen = notifUiState.unseenIds.size
                                            if (unseen > 0) {
                                                Badge {
                                                    Text(if (unseen > 99) "99+" else unseen.toString())
                                                }
                                            }
                                        }) {
                                            Icon(
                                                imageVector = Icons.Filled.Notifications,
                                                contentDescription = "New subscription videos",
                                                modifier = Modifier.size(21.dp)
                                            )
                                        }
                                    }
                                    IconButton(
                                        onClick = {
                                            isNotificationsOpen = false
                                            isSearchActive = true
                                        },
                                        modifier = Modifier.size(40.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Filled.Search,
                                            contentDescription = "Search",
                                            modifier = Modifier.size(21.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Layer 2b: Bottom Floating Liquid Glass Chrome (MiniPlayer + Capsule Dock)
                if (!hideScaffoldChrome && (!windowState.isWide || showBottomNav)) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                    ) {
                        if (!isShortsRoute) {
                            Box(
                                modifier = Modifier
                                    .matchParentSize()
                                    .liquidGlassEdgeFade(toTop = false)
                            )
                        }
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .navigationBarsPadding()
                                .padding(bottom = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            if (!windowState.isWide) {
                                AnimatedVisibility(
                                    visible = showMiniPlayer,
                                    enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                                    exit = slideOutVertically(targetOffsetY = { it }) + fadeOut()
                                ) {
                                    nowPlaying?.let { np ->
                                        MiniPlayer(
                                            nowPlaying = np,
                                            player = playbackManager.player,
                                            onOpen = {
                                                navController.navigate(Screen.Watch.createRoute(np.videoId)) {
                                                    launchSingleTop = true
                                                }
                                            },
                                            onClose = { playbackManager.stopAndClear() },
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                        )
                                    }
                                }
                            }
                            AnimatedVisibility(
                                visible = showBottomNav,
                                enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                                exit = slideOutVertically(targetOffsetY = { it }) + fadeOut()
                            ) {
                                BottomNavBar(
                                    navController = navController,
                                    activeDownloadsCount = activeDownloadsCount,
                                    onTabClick = onNavTabClick
                                )
                            }
                        }
                    }
                }

                // Wide windows (foldables & tablets): floating corner video mini-player
                androidx.compose.animation.AnimatedVisibility(
                    visible = showMiniPlayer && windowState.isWide && !hideScaffoldChrome,
                    enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 }),
                    exit = fadeOut() + slideOutVertically(targetOffsetY = { it / 2 }),
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 16.dp, bottom = 16.dp + navBottom + if (showBottomNav) 76.dp else 0.dp)
                ) {
                    nowPlaying?.let { np ->
                        FloatingMiniPlayer(
                            nowPlaying = np,
                            player = playbackManager.player,
                            onOpen = {
                                navController.navigate(Screen.Watch.createRoute(np.videoId)) {
                                    launchSingleTop = true
                                }
                            },
                            onClose = { playbackManager.stopAndClear() }
                        )
                    }
                }
            }
        }
    }

    if (isSearchActive) {
        LaunchedEffect(isSearchActive) {
            try {
                delay(100)
                focusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }
}

@Composable
private fun SearchResultsContent(
    uiState: com.kvtube.android.ui.screens.search.SearchUiState,
    chromeInsets: PaddingValues,
    onRetry: () -> Unit,
    onVideoClick: (String) -> Unit,
    onChannelClick: (String) -> Unit
) {
    when {
        uiState.isLoading -> {
            LoadingSpinner(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(chromeInsets),
                fullScreen = true,
                text = "Searching videos..."
            )
        }

        uiState.error != null -> {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(chromeInsets),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Text(
                        text = uiState.error ?: "",
                        color = MaterialTheme.colorScheme.error,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onRetry) {
                        Text("Retry")
                    }
                }
            }
        }

        uiState.hasSearched && uiState.results.isEmpty() -> {
            EmptyStateView(
                icon = Icons.Outlined.SearchOff,
                title = "No results found",
                subtitle = "Try a different keyword or check your spelling.",
                modifier = Modifier.padding(chromeInsets)
            )
        }

        uiState.results.isNotEmpty() -> {
            LazyVerticalGrid(
                columns = rememberVideoGridCells(),
                contentPadding = PaddingValues(
                    start = 12.dp,
                    end = 12.dp,
                    top = chromeInsets.calculateTopPadding() + 6.dp,
                    bottom = chromeInsets.calculateBottomPadding() + 12.dp
                ),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(uiState.results, key = { it.id }) { video ->
                    VideoCard(
                        video = video,
                        onVideoClick = { onVideoClick(video.id) },
                        onChannelClick = { onChannelClick(video.displayChannelId) }
                    )
                }
            }
        }

        else -> {
            EmptyStateView(
                icon = Icons.Filled.Search,
                title = "Search KV-Tube",
                subtitle = "Find videos, channels, and playlists on your instance.",
                modifier = Modifier.padding(chromeInsets)
            )
        }
    }
}

@Composable
private fun EmptyStateView(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(horizontal = 32.dp)
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.size(56.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(26.dp)
                    )
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        }
    }
}

/** Panel behind the bell: newest videos from the subscription feed, with red
 *  "NEW" chips on the ones that arrived since the last visit. */
@Composable
private fun NotificationsPanel(
    uiState: com.kvtube.android.ui.notifications.NotificationsUiState,
    highlightIds: Set<String>,
    chromeInsets: PaddingValues,
    onClose: () -> Unit,
    onVideoClick: (String) -> Unit,
    onChannelClick: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = chromeInsets.calculateTopPadding())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "New from your subscriptions",
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
                modifier = Modifier.weight(1f)
            )
            IconButton(onClick = onClose) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Close"
                )
            }
        }

        HorizontalDivider(
            thickness = 0.5.dp,
            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
        )

        when {
            uiState.isLoading && uiState.latest.isEmpty() -> {
                LoadingSpinner(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(bottom = chromeInsets.calculateBottomPadding()),
                    fullScreen = true,
                    text = "Checking for latest uploads..."
                )
            }

            uiState.latest.isEmpty() -> {
                EmptyStateView(
                    icon = Icons.Outlined.NotificationsNone,
                    title = "You're all caught up",
                    subtitle = if (uiState.hasSubscriptionsHint) {
                        "Subscribe to channels — their newest videos will appear here."
                    } else {
                        "New uploads from channels you subscribe to will appear here."
                    },
                    modifier = Modifier.padding(bottom = chromeInsets.calculateBottomPadding())
                )
            }

            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 180.dp),
                    contentPadding = PaddingValues(
                        start = 12.dp,
                        end = 12.dp,
                        top = 4.dp,
                        bottom = chromeInsets.calculateBottomPadding() + 12.dp
                    ),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(uiState.latest, key = { it.id }) { video ->
                        Column {
                            if (video.id in highlightIds || video.id in uiState.unseenIds) {
                                Text(
                                    text = "NEW",
                                    color = Color.White,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier
                                        .padding(start = 12.dp, bottom = 4.dp)
                                        .background(Color(0xFFD32F2F), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                            VideoCard(
                                video = video,
                                onVideoClick = { onVideoClick(video.id) },
                                onChannelClick = { onChannelClick(video.displayChannelId) }
                            )
                        }
                    }
                }
            }
        }
    }
}
