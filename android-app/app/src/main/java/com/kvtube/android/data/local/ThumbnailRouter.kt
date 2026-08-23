package com.kvtube.android.data.local

/**
 * Central thumbnail router: EVERY image the app shows goes through the
 * configured Invidious server (`{server}/vi/{videoId}/{quality}.jpg`), which
 * proxies YouTube's CDN server-side. No direct connections to i.ytimg.com or
 * other Google hosts — they are unreachable/blocked on several networks this
 * app runs on.
 */
object ThumbnailRouter {

    /** Active Invidious base URL, e.g. "https://yt.khoavo.myds.me". */
    @Volatile
    var serverBase: String = ""

    fun setServer(url: String) {
        serverBase = url.trim().trimEnd('/')
    }

    /** Proxied poster image for a video id. */
    fun video(id: String, quality: String = "hqdefault"): String =
        if (id.isBlank() || serverBase.isBlank()) ""
        else "$serverBase/vi/$id/$quality.jpg"

    /**
     * Routes an arbitrary thumbnail URL through Invidious when possible:
     * direct YouTube-CDN links (i.ytimg.com) are rewritten to the proxy;
     * anything already served by the instance passes through untouched.
     */
    fun route(url: String, videoId: String): String {
        if (url.isBlank() || url.contains("/vi/")) return url
        if (url.contains("ytimg.com") && videoId.isNotBlank()) return video(videoId)
        return url
    }
}
