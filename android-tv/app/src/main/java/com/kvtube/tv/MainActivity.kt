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
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.kvtube.tv.ui.components.YtSideNav
import com.kvtube.tv.ui.theme.KTubeTvTheme
import com.kvtube.tv.ui.theme.YTBackground

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
    // Sidebar always collapsed (icon-only) — never expands, never overlays content
    val showExpanded = false

    androidx.compose.runtime.CompositionLocalProvider(com.kvtube.tv.ui.navigation.LocalTvNav provides nav) {
        Row(Modifier.fillMaxSize()) {
            if (route != "player") {
                YtSideNav(
                    currentRoute = route,
                    expanded = false,
                    onExpandChange = { },
                    onNavigate = { r ->
                        if (route != r) nav.navigate(r) {
                            launchSingleTop = true
                            popUpTo("home") { inclusive = false }
                        }
                    },
                    modifier = Modifier.fillMaxHeight(),
                )
            }
            Box(Modifier.weight(1f).fillMaxHeight().background(Color(0xFF0F0F0F))) {
                NavHost(navController = nav, startDestination = "home") {
                    composable("home") { com.kvtube.tv.ui.screens.HomeScreen(onVideoClick = { id -> nav.navigate("watch/$id") }) }
                    composable("latest") { com.kvtube.tv.ui.screens.LatestScreen(onVideoClick = { id -> nav.navigate("watch/$id") }) }
                    composable("search") { com.kvtube.tv.ui.screens.SearchScreen(onVideoClick = { id -> nav.navigate("watch/$id") }) }
                    composable("library") { com.kvtube.tv.ui.screens.LibraryScreen(onVideoClick = { id -> nav.navigate("watch/$id") }) }
                    composable("settings") { com.kvtube.tv.ui.screens.SettingsScreen() }
                    composable("watch/{videoId}", arguments = listOf(navArgument("videoId") { type = NavType.StringType })) { e ->
                        val id = e.arguments?.getString("videoId") ?: return@composable
                        com.kvtube.tv.ui.screens.DetailScreen(
                            videoId = id, 
                            onPlay = { vid -> nav.navigate("player/$vid") }, 
                            onVideoClick = { vid -> nav.navigate("watch/$vid") },
                            onChannel = { cid -> nav.navigate("channel/$cid") }
                        )
                    }
                    composable("player/{videoId}", arguments = listOf(navArgument("videoId") { type = NavType.StringType })) { e ->
                        val id = e.arguments?.getString("videoId") ?: return@composable
                        com.kvtube.tv.ui.screens.PlayerScreen(videoId = id, onBack = { nav.popBackStack() })
                    }
                    composable("channel/{channelId}", arguments = listOf(navArgument("channelId") { type = NavType.StringType })) { e ->
                        val cid = e.arguments?.getString("channelId") ?: return@composable
                        com.kvtube.tv.ui.screens.ChannelScreen(channelId = cid, onVideoClick = { id -> nav.navigate("watch/$id") })
                    }
                }
            }
        }
    }
}
