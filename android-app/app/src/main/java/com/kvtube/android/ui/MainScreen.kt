package com.kvtube.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.res.painterResource
import com.kvtube.android.R
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.kvtube.android.ui.components.LoadingSpinner
import com.kvtube.android.ui.components.MiniPlayer
import com.kvtube.android.ui.components.VideoCard
import com.kvtube.android.ui.navigation.BottomNavBar
import com.kvtube.android.ui.navigation.NavGraph
import com.kvtube.android.ui.navigation.Screen
import com.kvtube.android.player.PlaybackManager
import com.kvtube.android.ui.notifications.NotificationsUiState
import com.kvtube.android.ui.notifications.NotificationsViewModel
import com.kvtube.android.ui.screens.search.SearchViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import javax.inject.Inject

/** Thin wrapper so composables can grab the singleton PlaybackManager. */
@HiltViewModel
class PlaybackViewModel @Inject constructor(
    val playbackManager: PlaybackManager,
    val fullscreenController: FullscreenController
) : ViewModel()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen() {
    val navController = rememberNavController()
    val searchViewModel: SearchViewModel = hiltViewModel()

    var isSearchActive by remember { mutableStateOf(false) }
    val searchUiState by searchViewModel.uiState.collectAsState()
    val activeDownloadsCount by searchViewModel.activeDownloadsCount.collectAsState()
    val focusManager = LocalFocusManager.current
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
        if (searchUiState.query.isNotEmpty()) {
            searchViewModel.onQueryChanged("")
            focusRequester.requestFocus()
        } else {
            isSearchActive = false
        }
    }

    BackHandler(enabled = isNotificationsOpen) {
        isNotificationsOpen = false
    }

    Scaffold(
        topBar = {
            if (!isPlayerFullscreen) {
                Box(modifier = Modifier.animateContentSize()) {
                if (isSearchActive) {
                    // Compact expanding search field — just enough space to type
                    TopAppBar(
                        title = {
                            TextField(
                                value = searchUiState.query,
                                onValueChange = { searchViewModel.onQueryChanged(it) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(focusRequester),
                                placeholder = {
                                    Text(
                                        text = "Search...",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                },
                                singleLine = true,
                                colors = TextFieldDefaults.colors(
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent,
                                    disabledContainerColor = Color.Transparent,
                                    focusedIndicatorColor = Color.Transparent,
                                    unfocusedIndicatorColor = Color.Transparent,
                                    cursorColor = MaterialTheme.colorScheme.onSurface
                                ),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                keyboardActions = KeyboardActions(
                                    onSearch = {
                                        searchViewModel.searchImmediate(searchUiState.query)
                                        focusManager.clearFocus()
                                    }
                                )
                            )
                        },
                        navigationIcon = {
                            IconButton(onClick = {
                                if (searchUiState.query.isNotEmpty()) {
                                    // First back: clear query, stay in compact search
                                    searchViewModel.onQueryChanged("")
                                    focusRequester.requestFocus()
                                } else {
                                    isSearchActive = false
                                    focusManager.clearFocus()
                                }
                            }) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = "Back"
                                )
                            }
                        },
                        actions = {
                            if (searchUiState.query.isNotEmpty()) {
                                IconButton(onClick = {
                                    searchViewModel.onQueryChanged("")
                                    focusRequester.requestFocus()
                                }) {
                                    Icon(
                                        imageVector = Icons.Filled.Close,
                                        contentDescription = "Clear"
                                    )
                                }
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = MaterialTheme.colorScheme.background,
                            titleContentColor = MaterialTheme.colorScheme.onSurface
                        )
                    )
                } else if (currentRoute != Screen.Shorts.route) {
                    TopAppBar(
                        title = {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.ic_splash_logo),
                                    contentDescription = null,
                                    modifier = Modifier.size(24.dp)
                                )
                                Text(
                                    text = "KV-Tube",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 20.sp
                                )
                            }
                        },
                        actions = {
                            // Subscription updates: badge shows how many feed
                            // videos arrived since the panel was last opened.
                            IconButton(onClick = {
                                isNotificationsOpen = true
                                isSearchActive = false
                                focusManager.clearFocus()
                                highlightNewIds = notifUiState.unseenIds
                                notifViewModel.markAllSeen()
                                notifViewModel.refresh()
                            }) {
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
                                        contentDescription = "New subscription videos"
                                    )
                                }
                            }
                            IconButton(onClick = {
                                isNotificationsOpen = false
                                isSearchActive = true
                            }) {
                                Icon(
                                    imageVector = Icons.Filled.Search,
                                    contentDescription = "Search"
                                )
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = MaterialTheme.colorScheme.background,
                            titleContentColor = MaterialTheme.colorScheme.onSurface
                        )
                    )
                }
                // Shorts route: chromeless — no top bar, the video is full page (#6)
                }
            }
        },
        bottomBar = {
            if (!isPlayerFullscreen) {
                Column {
                    // Mini player: keeps playing after leaving the watch page
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
                                onClose = { playbackManager.stopAndClear() }
                            )
                        }
                    }

                    BottomNavBar(
                        navController = navController,
                        activeDownloadsCount = activeDownloadsCount,
                        onTabClick = {
                            isSearchActive = false
                            searchViewModel.onQueryChanged("")
                            focusManager.clearFocus()
                        }
                    )
                }
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .then(if (isPlayerFullscreen) Modifier else Modifier.padding(innerPadding))
        ) {
            when {
                showFullResults -> {
                    SearchResultsContent(
                        uiState = searchUiState,
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
    }

    if (isSearchActive) {
        androidx.compose.runtime.LaunchedEffect(isSearchActive) {
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
    onVideoClick: (String) -> Unit,
    onChannelClick: (String) -> Unit
) {
    when {
        uiState.isLoading -> {
            LoadingSpinner(modifier = Modifier.fillMaxSize(), fullScreen = true)
        }

        uiState.error != null -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = uiState.error ?: "",
                    color = MaterialTheme.colorScheme.error
                )
            }
        }

        uiState.hasSearched && uiState.results.isEmpty() -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No results found",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        uiState.results.isNotEmpty() -> {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 300.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
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
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Search for videos",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/** Panel behind the bell: newest videos from the subscription feed, with red
 *  "NEW" chips on the ones that arrived since the last visit. */
@Composable
private fun NotificationsPanel(
    uiState: com.kvtube.android.ui.notifications.NotificationsUiState,
    highlightIds: Set<String>,
    onClose: () -> Unit,
    onVideoClick: (String) -> Unit,
    onChannelClick: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
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

        when {
            uiState.isLoading && uiState.latest.isEmpty() -> {
                LoadingSpinner(modifier = Modifier.fillMaxSize(), fullScreen = true)
            }

            uiState.latest.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (uiState.hasSubscriptionsHint) {
                            "Subscribe to channels — their newest videos will appear here."
                        } else {
                            "No videos right now."
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.padding(24.dp)
                    )
                }
            }

            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 180.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
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
