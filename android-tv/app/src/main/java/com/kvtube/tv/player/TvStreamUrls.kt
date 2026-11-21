package com.kvtube.tv.player

/**
 * URL helpers for adaptive (DASH) playback through the KV-Tube gateway.
 * Pure string functions (no Android classes) so they are unit-testable.
 */
object TvStreamUrls {
    private const val GATEWAY_PREFIX = "/api/invidious"

    /**
     * Adaptive DASH manifest for [videoId]: every resolution + audio in one
     * manifest so ExoPlayer can run bandwidth-based ABR. No `/videos/{id}`
     * lookup is needed first, which is what made playback start slowly.
     */
    fun dashManifestUrl(baseUrl: String, videoId: String, gateway: Boolean): String {
        val base = baseUrl.trimEnd('/')
        return if (gateway) "$base$GATEWAY_PREFIX/api/manifest/dash/id/$videoId"
        else "$base/api/manifest/dash/id/$videoId?local=true"
    }

    /**
     * The gateway's manifest carries `/companion/videoplayback?...` segment
     * URLs that resolve against the gateway host root; send them through the
     * same-origin `/api/invidious` proxy (same rule as the web player).
     */
    fun rewriteGatewayUrl(url: String, gatewayHost: String?): String {
        if (gatewayHost.isNullOrBlank()) return url
        val schemeEnd = url.indexOf("://")
        if (schemeEnd < 0) return url
        val authorityStart = schemeEnd + 3
        val pathStart = url.indexOf('/', authorityStart)
        if (pathStart < 0) return url
        val host = url.substring(authorityStart, pathStart).substringAfterLast('@').substringBefore(':')
        if (!host.equals(gatewayHost, ignoreCase = true)) return url
        val path = url.substring(pathStart)
        if (path.startsWith(GATEWAY_PREFIX)) return url
        val proxied = path.startsWith("/companion/") ||
            path.startsWith("/videoplayback") ||
            path.startsWith("/latest_version") ||
            path.startsWith("/api/")
        if (!proxied) return url
        return url.substring(0, pathStart) + GATEWAY_PREFIX + path
    }
}
