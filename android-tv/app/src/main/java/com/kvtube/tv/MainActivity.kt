package com.kvtube.tv

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.kvtube.tv.ui.components.KvTubeLoadingScreen
import com.kvtube.tv.ui.components.TV_NAV_RAIL_WIDTH
import com.kvtube.tv.ui.components.YtSideNav
import com.kvtube.tv.ui.theme.KTubeTvTheme
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.viewmodel.HomeViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            KTubeTvTheme {
                Box(Modifier.fillMaxSize().background(YTBackground)) {
                    TvShell()
                }
            }
        }
    }
}

@OptIn(androidx.tv.material3.ExperimentalTvMaterial3Api::class)
@androidx.compose.runtime.Composable
private fun TvShell() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route?.substringBefore("/")?.substringBefore("?")
    val isPlayer = route == "player" || route == "watch"

    // Initial boot splash/loading state
    val homeVm: HomeViewModel = viewModel()
    val homeState by homeVm.state.collectAsState()
    var minSplashFinished by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(1200) // Minimum showcase time for YouTube TV boot animation
        minSplashFinished = true
    }

    val isBootLoading = !minSplashFinished || (homeState.isLoading && homeState.hero.isEmpty() && homeState.rows.isEmpty())

    androidx.compose.runtime.CompositionLocalProvider(com.kvtube.tv.ui.navigation.LocalTvNav provides nav) {
        Box(Modifier.fillMaxSize()) {
            // Main content area - indented by 72dp collapsed rail width when not in player
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(start = if (!isPlayer) TV_NAV_RAIL_WIDTH.dp else 0.dp)
                    .background(Color(0xFF0F0F0F))
            ) {
                NavHost(navController = nav, startDestination = "home") {
                    composable("home") { com.kvtube.tv.ui.screens.HomeScreen(onVideoClick = { id -> nav.navigate("player/$id") }, vm = homeVm) }
                    composable("latest") { com.kvtube.tv.ui.screens.LatestScreen(onVideoClick = { id -> nav.navigate("player/$id") }) }
                    composable("search") { com.kvtube.tv.ui.screens.SearchScreen(onVideoClick = { id -> nav.navigate("player/$id") }) }
                    composable("library") { com.kvtube.tv.ui.screens.LibraryScreen(onVideoClick = { id -> nav.navigate("player/$id") }) }
                    composable("settings") { com.kvtube.tv.ui.screens.SettingsScreen() }
                    composable("watch/{videoId}", arguments = listOf(navArgument("videoId") { type = NavType.StringType })) { e ->
                        val id = e.arguments?.getString("videoId") ?: return@composable
                        // Direct playback for watch routes
                        com.kvtube.tv.ui.screens.PlayerScreen(videoId = id, onBack = { nav.popBackStack() })
                    }
                    composable("player/{videoId}", arguments = listOf(navArgument("videoId") { type = NavType.StringType })) { e ->
                        val id = e.arguments?.getString("videoId") ?: return@composable
                        com.kvtube.tv.ui.screens.PlayerScreen(videoId = id, onBack = { nav.popBackStack() })
                    }
                    composable("channel/{channelId}", arguments = listOf(navArgument("channelId") { type = NavType.StringType })) { e ->
                        val cid = e.arguments?.getString("channelId") ?: return@composable
                        com.kvtube.tv.ui.screens.ChannelScreen(channelId = cid, onVideoClick = { id -> nav.navigate("player/$id") })
                    }
                }
            }

            // Fixed side navigation rail (never expands, never overlays content)
            if (!isPlayer) {
                YtSideNav(
                    currentRoute = route,
                    onNavigate = { r ->
                        if (route != r) nav.navigate(r) {
                            launchSingleTop = true
                            popUpTo("home") { inclusive = false }
                        }
                    },
                    modifier = Modifier.fillMaxHeight(),
                )
            }

            // YouTube TV style splash/loading animation overlay
            KvTubeLoadingScreen(isLoading = isBootLoading)
        }
    }
}
