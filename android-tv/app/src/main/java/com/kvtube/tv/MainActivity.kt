package com.kvtube.tv

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
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
import com.kvtube.tv.ui.navigation.LocalTvNav
import com.kvtube.tv.ui.screens.ChannelScreen
import com.kvtube.tv.ui.screens.HomeScreen
import com.kvtube.tv.ui.screens.LatestScreen
import com.kvtube.tv.ui.screens.LibraryScreen
import com.kvtube.tv.ui.screens.PlayerScreen
import com.kvtube.tv.ui.screens.SearchScreen
import com.kvtube.tv.ui.screens.SettingsScreen
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
@Composable
private fun TvShell() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route?.substringBefore("/")?.substringBefore("?")
    val isPlayer = route == "player" || route == "watch"

    val homeVm: HomeViewModel = viewModel()
    val homeState by homeVm.state.collectAsState()
    val isBootLoading = homeState.isLoading && homeState.hero.isEmpty() && homeState.rows.isEmpty()

    CompositionLocalProvider(LocalTvNav provides nav) {
        Box(Modifier.fillMaxSize().background(YTBackground)) {
            // Main content reserves the 72dp collapsed rail column so the expandable Left Guide overlays cleanly.
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(start = if (!isPlayer) TV_NAV_RAIL_WIDTH.dp else 0.dp)
                    .background(YTBackground)
            ) {
                NavHost(navController = nav, startDestination = "home") {
                    composable("home") {
                        HomeScreen(
                            onVideoClick = { id -> nav.navigate("player/$id") },
                            onChannelClick = { cid -> if (cid.isNotBlank()) nav.navigate("channel/$cid") },
                            vm = homeVm,
                        )
                    }
                    composable("latest") {
                        LatestScreen(onVideoClick = { id -> nav.navigate("player/$id") })
                    }
                    composable("search") {
                        SearchScreen(onVideoClick = { id -> nav.navigate("player/$id") })
                    }
                    composable("library") {
                        LibraryScreen(onVideoClick = { id -> nav.navigate("player/$id") })
                    }
                    composable("settings") {
                        SettingsScreen()
                    }
                    composable("watch/{videoId}", arguments = listOf(navArgument("videoId") { type = NavType.StringType })) { e ->
                        val id = e.arguments?.getString("videoId") ?: return@composable
                        PlayerScreen(
                            videoId = id,
                            onBack = { nav.popBackStack() },
                            onChannelClick = { cid -> if (cid.isNotBlank()) nav.navigate("channel/$cid") },
                        )
                    }
                    composable("player/{videoId}", arguments = listOf(navArgument("videoId") { type = NavType.StringType })) { e ->
                        val id = e.arguments?.getString("videoId") ?: return@composable
                        PlayerScreen(
                            videoId = id,
                            onBack = { nav.popBackStack() },
                            onChannelClick = { cid -> if (cid.isNotBlank()) nav.navigate("channel/$cid") },
                        )
                    }
                    composable("channel/{channelId}", arguments = listOf(navArgument("channelId") { type = NavType.StringType })) { e ->
                        val cid = e.arguments?.getString("channelId") ?: return@composable
                        ChannelScreen(
                            channelId = cid,
                            onVideoClick = { id -> nav.navigate("player/$id") },
                        )
                    }
                }
            }

            if (!isPlayer) {
                YtSideNav(
                    currentRoute = route,
                    onNavigate = { r ->
                        if (route != r) nav.navigate(r) {
                            launchSingleTop = true
                            popUpTo("home") { inclusive = false }
                        }
                    },
                    modifier = Modifier
                        .fillMaxHeight()
                        .zIndex(10f),
                )
            }

            KvTubeLoadingScreen(
                isLoading = isBootLoading,
                modifier = Modifier.zIndex(20f),
            )
        }
    }
}
