package com.kvtube.android.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.kvtube.android.ui.screens.downloads.DownloadsScreen
import com.kvtube.android.ui.screens.home.HomeScreen
import com.kvtube.android.ui.screens.library.LibraryScreen
import com.kvtube.android.ui.screens.search.SearchScreen
import com.kvtube.android.ui.screens.shorts.ShortsScreen
import com.kvtube.android.ui.screens.subscriptions.SubscriptionsScreen
import com.kvtube.android.ui.screens.channel.ChannelScreen
import com.kvtube.android.ui.screens.watch.WatchScreen
import com.kvtube.android.ui.SettingsScreen

@Composable
fun NavGraph(navController: NavHostController) {
    NavHost(
        navController = navController,
        startDestination = Screen.Home.route
    ) {
        composable(Screen.Home.route) {
            HomeScreen(navController = navController)
        }

        composable(Screen.Subscriptions.route) {
            SubscriptionsScreen(navController = navController)
        }

        composable(Screen.Library.route) {
            LibraryScreen(navController = navController)
        }

        composable(Screen.Downloads.route) {
            DownloadsScreen(navController = navController)
        }

        composable(
            route = Screen.Watch.route,
            arguments = listOf(
                navArgument("videoId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val videoId = backStackEntry.arguments?.getString("videoId") ?: return@composable
            WatchScreen(
                videoId = videoId,
                navController = navController
            )
        }

        composable(
            route = Screen.Search.route,
            arguments = listOf(
                navArgument("query") {
                    type = NavType.StringType
                    defaultValue = ""
                }
            )
        ) { backStackEntry ->
            val query = backStackEntry.arguments?.getString("query") ?: ""
            SearchScreen(
                query = query,
                navController = navController
            )
        }

        composable(Screen.Shorts.route) {
            ShortsScreen(navController = navController)
        }

        composable(
            route = Screen.Channel.route,
            arguments = listOf(
                navArgument("channelId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val channelId = backStackEntry.arguments?.getString("channelId") ?: return@composable
            ChannelScreen(
                channelId = channelId,
                navController = navController
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(navController = navController)
        }
    }
}
