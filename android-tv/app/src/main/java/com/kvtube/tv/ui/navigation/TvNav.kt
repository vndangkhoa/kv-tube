package com.kvtube.tv.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.kvtube.tv.ui.screens.*

@OptIn(androidx.tv.material3.ExperimentalTvMaterial3Api::class)
@Composable
fun TvNavHost(currentTheme: String = "youtube") {
    val nav = rememberNavController()
    androidx.compose.runtime.CompositionLocalProvider(LocalTvNav provides nav) {
        NavHost(navController = nav, startDestination = "home") {
            composable("home") {
                HomeScreen(onVideoClick = { id -> nav.navigate("player/$id") }, onChannelClick = { cid -> nav.navigate("channel/$cid") })
            }
            composable("latest") {
                LatestScreen(onVideoClick = { id -> nav.navigate("player/$id") })
            }
            composable("search") {
                SearchScreen(onVideoClick = { id -> nav.navigate("player/$id") })
            }
            composable("library") { LibraryScreen(onVideoClick = { id -> nav.navigate("player/$id") }) }
            composable("settings") { SettingsScreen() }
            composable("watch/{videoId}", arguments = listOf(navArgument("videoId") { type = NavType.StringType })) { backStack ->
                val id = backStack.arguments?.getString("videoId") ?: return@composable
                PlayerScreen(videoId = id, onBack = { nav.popBackStack() })
            }
            composable("player/{videoId}", arguments = listOf(navArgument("videoId") { type = NavType.StringType })) { backStack ->
                val id = backStack.arguments?.getString("videoId") ?: return@composable
                PlayerScreen(videoId = id, onBack = { nav.popBackStack() })
            }
            composable("channel/{channelId}", arguments = listOf(navArgument("channelId") { type = NavType.StringType })) { backStack ->
                val cid = backStack.arguments?.getString("channelId") ?: return@composable
                ChannelScreen(channelId = cid, onVideoClick = { id -> nav.navigate("player/$id") })
            }
        }
    }
}

val LocalTvNav = staticCompositionLocalOf<androidx.navigation.NavHostController> { error("No NavController") }
