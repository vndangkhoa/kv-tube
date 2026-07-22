package com.kvtube.android.ui.navigation

sealed class Screen(val route: String) {
    data object Home : Screen("home")
    data object Subscriptions : Screen("subscriptions")
    data object Library : Screen("library")
    data object Downloads : Screen("downloads")
    data object Settings : Screen("settings")

    data object Watch : Screen("watch/{videoId}") {
        fun createRoute(videoId: String) = "watch/$videoId"
    }
    data object LocalWatch : Screen("localWatch/{videoId}") {
        fun createRoute(videoId: String) = "localWatch/$videoId"
    }
    data object Search : Screen("search?q={query}") {
        fun createRoute(query: String) = "search?q=$query"
    }
    data object Shorts : Screen("shorts")
    data object Channel : Screen("channel/{channelId}") {
        fun createRoute(channelId: String) = "channel/$channelId"
    }
}
