package com.kvtube.android.data.api

import android.util.Log
import com.kvtube.android.data.model.ChannelInfo
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.Subscription
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.relativeRecencyMinutes
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Invidious-direct API client.
 *
 * The app talks to any Invidious instance (/api/v1) instead of the retired
 * Go backend. Default points at the production instance; users can override
 * it in Settings (self-hosters just paste their own instance URL).
 */
class KVApi(
    private val client: HttpClient,
    private val json: Json
) {
    companion object {
        private const val TAG = "KVApi"
        /** Set exclusively from user input (Settings). Empty = not configured. */
        private const val DEFAULT_BASE_URL = ""

        /**
         * Invidious accepts two credentials on the /auth/ endpoints:
         *  - `Authorization: Bearer <token>` where the token is a JSON payload
         *    (raw, or base64/base64url encoded) containing a session id;
         *  - a raw session id sent as `Cookie: SID=<sid>`.
         *
         * A Bearer header that the instance cannot decode makes it fail hard
         * with 403 even when a valid SID cookie is present too — so exactly
         * one of them may be sent. Tokens generated via Preferences → Tokens
         * are base64-encoded JSON; SID cookie values are opaque strings.
         */
        @OptIn(ExperimentalEncodingApi::class)
        internal fun usesBearerToken(rawToken: String): Boolean {
            val token = rawToken.trim().removeSurrounding("\"")
            if (token.startsWith("{")) return true

            val compact = token.replace("-", "+").replace("_", "/")
                .filterNot { it.isWhitespace() }
                .trimEnd('=')
            // 4 chars encode 3 bytes; re-pad so the decoder accepts unpadded input
            val padded = compact + "=".repeat((4 - compact.length % 4) % 4)
            if (padded.length < 16) return false
            return try {
                val decoded = Base64.decode(padded).toString(Charsets.UTF_8).trim()
                decoded.startsWith("{") && decoded.contains("\"session\"")
            } catch (e: Exception) {
                false
            }
        }
    }

    @Volatile
    private var baseUrl: String = DEFAULT_BASE_URL

    /** Invidious session token (SID cookie value or JSON token). Required for
     *  subscriptions; empty = anonymous mode. Set from the Settings screen. */
    @Volatile
    private var authToken: String = ""

    /** null = not probed yet; false = raw Invidious; true = KV-Tube web gateway
     *  (the Next.js frontend exposes Invidious under /api/invidious/api/v1). */
    @Volatile
    private var gatewayMode: Boolean? = null

    fun setServerUrl(url: String) {
        val clean = url.trim().removeSuffix("/")
        if (clean != baseUrl) gatewayMode = null
        baseUrl = clean
        Log.d(TAG, "Server URL set to: ${if (baseUrl.isBlank()) "<not configured>" else baseUrl}")
    }

    fun setToken(token: String) {
        authToken = token.trim()
        Log.d(TAG, "Invidious token ${if (authToken.isBlank()) "cleared" else "set"}")
    }

    private fun applyAuth(b: io.ktor.client.request.HttpRequestBuilder) {
        if (authToken.isBlank()) return
        b.header("x-invidious-token", authToken)
        if (usesBearerToken(authToken)) {
            b.header("Authorization", "Bearer $authToken")
        } else {
            b.header("Cookie", "SID=$authToken")
        }
    }

    fun getServerUrl(): String = baseUrl

    /** Accepts absolute, protocol-relative and instance-relative URLs. */
    private fun absoluteUrl(raw: String): String = when {
        raw.isBlank() -> ""
        raw.startsWith("https://") || raw.startsWith("http://") -> raw
        raw.startsWith("//") -> "https:$raw"
        raw.startsWith("/") -> "$baseUrl$raw"
        else -> "https://$raw"
    }

    // --- low-level helpers ---------------------------------------------------

    /** Probes once whether [baseUrl] is raw Invidious or the KV-Tube gateway.
     *  Detection is content-based: SPA fallbacks answer HTTP 200 for any path
     *  with an HTML body, so status codes alone cannot be trusted. */
    private suspend fun resolveGateway() {
        if (gatewayMode != null) return
        gatewayMode = when {
            invidiousOk("/api/v1") -> false
            invidiousOk("/api/invidious/api/v1") -> true
            else -> false
        }
        Log.d(TAG, "Server mode: ${if (gatewayMode == true) "kv-tube gateway" else "raw invidious"}")
    }

    private suspend fun invidiousOk(prefix: String): Boolean {
        return try {
            val body = client.get("$baseUrl$prefix/stats").bodyAsText()
            val o = json.parseToJsonElement(body) as? JsonObject
            o?.containsKey("version") == true
        } catch (e: Exception) {
            Log.d(TAG, "probe $prefix/stats: not invidious (${e.message})")
            false
        }
    }

    private suspend fun api(path: String): String {
        resolveGateway()
        val p = if (path.startsWith("/")) path else "/$path"
        return if (gatewayMode == true) {
            "$baseUrl/api/invidious/api/v1$p"
        } else {
            "$baseUrl/api/v1$p"
        }
    }

    private suspend fun getBody(path: String, params: Map<String, String> = emptyMap(), auth: Boolean = false): String? {
        return try {
            val resp = client.get(api(path)) {
                params.forEach { (k, v) -> parameter(k, v) }
                if (auth) applyAuth(this)
            }
            if (!resp.status.isSuccess()) {
                Log.w(TAG, "GET $path -> HTTP ${resp.status.value}")
                null
            } else {
                resp.bodyAsText()
            }
        } catch (e: Exception) {
            Log.e(TAG, "GET $path error: ${e.message}")
            null
        }
    }

    private suspend fun getObject(path: String, params: Map<String, String> = emptyMap()): JsonObject? {
        val body = getBody(path, params) ?: return null
        return try {
            json.parseToJsonElement(body) as? JsonObject
        } catch (e: Exception) {
            Log.e(TAG, "GET $path parse error: ${e.message}")
            null
        }
    }

    /** GETs a JSON array response; also unwraps common wrapper keys. */
    private suspend fun getJsonArray(path: String, params: Map<String, String> = emptyMap(), auth: Boolean = false): List<JsonObject> {
        val body = getBody(path, params, auth) ?: return emptyList()
        return try {
            when (val el = json.parseToJsonElement(body)) {
                is JsonArray -> el.jsonArray.mapNotNull { it as? JsonObject }
                is JsonObject -> (
                    el["videos"] ?: el["comments"] ?: el["relatedVideos"]
                        ?: el["recommendedVideos"]
                    )?.jsonArray?.mapNotNull { it as? JsonObject } ?: emptyList()
                else -> emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "GET $path parse error: ${e.message}")
            emptyList()
        }
    }

    private fun JsonObject.str(vararg keys: String): String {
        for (k in keys) {
            val prim = this[k]?.jsonPrimitive ?: continue
            val content = prim.content
            if (content.isNotBlank()) return content
        }
        return ""
    }

    private fun JsonObject.num(vararg keys: String): Long {
        for (k in keys) {
            val prim = this[k]?.jsonPrimitive ?: continue
            prim.longOrNull?.let { return it }
            prim.content.toLongOrNull()?.let { return it }
        }
        return 0
    }

    private fun JsonObject.bool(key: String): Boolean =
        this[key]?.jsonPrimitive?.booleanOrNull ?: false

    private fun JsonObject.thumbList(key: String): String {
        val arr = this[key] as? JsonArray ?: return ""
        val best = arr.lastOrNull() as? JsonObject ?: return ""
        return absoluteUrl(best.str("url"))
    }

    private fun secondsToDuration(sec: Long): String {
        if (sec <= 0) return ""
        val h = sec / 3600
        val m = (sec % 3600) / 60
        val s = sec % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    private fun JsonObject.toVideo(): VideoData {
        val id = str("videoId")
        return VideoData(
            id = id,
            title = str("title"),
            description = str("description"),
            duration = secondsToDuration(num("lengthSeconds")),
            durationSeconds = num("lengthSeconds"),
            viewCount = num("viewCount"),
            published = str("publishedText"),
            uploadedAt = str("publishedText"),
            thumbnail = com.kvtube.android.data.local.ThumbnailRouter.video(id),
            uploader = str("author"),
            uploaderId = str("authorId"),
            channelId = str("authorId"),
            channelTitle = str("author"),
            channelThumbnail = thumbList("authorThumbnails"),
            isLive = bool("liveNow")
        )
    }

    private fun JsonObject.toChannel(): ChannelInfo = ChannelInfo(
        id = str("authorId"),
        title = str("author", "title"),
        subscriberCount = num("subCount"),
        avatar = thumbList("authorThumbnails"),
        avatarUrl = thumbList("authorThumbnails"),
        bannerUrl = thumbList("authorBanners"),
        description = str("description"),
        videoCount = num("videosCount").toInt()
    )

    // --- content feeds -------------------------------------------------------

    suspend fun search(query: String, limit: Int = 20, region: String = ""): List<VideoData> {
        val params = buildMap {
            put("q", query)
            put("type", "video")
            put("page", "1")
            if (region.isNotBlank() && region != "GLOBAL") put("region", region)
        }
        return getJsonArray("search", params)
            .filter { it.str("type").ifBlank { "video" } == "video" }
            .map { it.toVideo() }
            .take(limit)
    }

    suspend fun getHomeFeed(limit: Int = 30, offset: Int = 0, region: String = ""): List<VideoData> =
        getTrending(limit + offset, region).drop(offset)

    suspend fun getTrending(limit: Int = 20, region: String = ""): List<VideoData> {
        val params = if (region.isNotBlank() && region != "GLOBAL") mapOf("region" to region) else emptyMap()
        return getJsonArray("trending", params).map { it.toVideo() }.take(limit)
    }

    suspend fun getVideoInfo(videoId: String): VideoData {
        val o = getObject("videos/$videoId")
            ?: return VideoData(id = videoId, title = "")
        return o.toVideo().copy(description = o.str("description"))
    }

    // --- playback ------------------------------------------------------------

    /**
     * Builds PlaybackInfo from the Invidious video payload:
     *  - progressive formatStreams become combined (has_audio=true) formats
     *  - adaptiveFormats video/mp4 entries become video-only formats
     *  - highest-bitrate audio/mp4 becomes audio_format
     */
    suspend fun getPlaybackInfo(videoId: String, audio: String = "opus"): PlaybackInfo {
        // local=true → Invidious rewrites stream URLs to itself
        // (/latest_version?...), so video+audio bytes are proxied through the
        // user's server instead of connecting to googlevideo.com directly.
        val o = getObject("videos/$videoId?local=true") ?: return PlaybackInfo()

        fun heightOf(vararg labels: String): Int {
            for (label in labels) {
                Regex("(\\d+)p").find(label)?.groupValues?.get(1)?.toIntOrNull()?.let { return it }
            }
            return 0
        }

        // With local=true Invidious may return RELATIVE proxy paths like
        // "/latest_version?id=...". Prefix them with the server base so the
        // player gets an absolute URL — otherwise ExoPlayer fails instantly
        // with ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ("Source error").
        fun JsonObject.absoluteStreamUrl(): String {
            val raw = str("url")
            return when {
                raw.startsWith("http://") || raw.startsWith("https://") -> raw
                raw.startsWith("/") && baseUrl.isNotBlank() -> baseUrl + raw
                else -> raw
            }
        }

        fun JsonObject.format(hasAudio: Boolean): PlaybackFormat = PlaybackFormat(
            formatId = str("itag"),
            height = heightOf(str("qualityLabel"), str("resolution")),
            width = num("width").toInt(),
            vcodec = if (hasAudio) str("type").substringAfter("codecs=").trim('"', ' ', ';') else "",
            acodec = if (hasAudio) "mp4a" else "",
            ext = str("type").substringAfter('/').substringBefore(';'),
            bandwidth = num("bitrate").toInt(),
            filesize = num("filesize", "clen"),
            url = absoluteStreamUrl(),
            hasAudio = hasAudio
        )

        val videoOnly = (o["adaptiveFormats"] as? JsonArray ?: JsonArray(emptyList()))
            .mapNotNull { it as? JsonObject }
            .filter { f -> f.str("type").startsWith("video/") && f.str("url").isNotBlank() }
            .map { it.format(false) }
            .sortedByDescending { it.height }

        val progressive = (o["formatStreams"] as? JsonArray ?: JsonArray(emptyList()))
            .mapNotNull { it as? JsonObject }
            .filter { it.str("url").isNotBlank() }
            .map { it.format(true) }
            .sortedByDescending { it.height }

        val bestAudio = (o["adaptiveFormats"] as? JsonArray ?: JsonArray(emptyList()))
            .mapNotNull { it as? JsonObject }
            .filter { f -> f.str("type").startsWith("audio/") && f.str("url").isNotBlank() }
            .maxByOrNull { it.num("bitrate") }
            ?.let { f ->
                PlaybackFormat(
                    formatId = f.str("itag"),
                    height = 0,
                    bandwidth = f.num("bitrate").toInt(),
                    filesize = f.num("filesize", "clen"),
                    acodec = f.str("type").substringAfter("codecs=").trim('"', ' ', ';'),
                    ext = f.str("type").substringAfter('/').substringBefore(';'),
                    url = f.absoluteStreamUrl(),
                    hasAudio = true
                )
            }

        return PlaybackInfo(
            title = o.str("title"),
            duration = o.num("lengthSeconds").toDouble(),
            videoFormats = progressive + videoOnly,
            audioFormat = bestAudio
        )
    }

    suspend fun getRelatedVideos(videoId: String, limit: Int = 15): List<VideoData> {
        val o = getObject("videos/$videoId") ?: return emptyList()
        return (o["recommendedVideos"] as? JsonArray ?: JsonArray(emptyList()))
            .mapNotNull { it as? JsonObject }
            .map { it.toVideo() }
            .take(limit)
    }

    suspend fun getComments(videoId: String, limit: Int = 20): List<Comment> {
        return getJsonArray("comments/$videoId", mapOf("sort_by" to "top"))
            .take(limit)
            .map { c ->
                Comment(
                    id = c.str("commentId"),
                    text = c.str("content", "commentText"),
                    author = c.str("author"),
                    authorId = c.str("authorId"),
                    authorThumbnail = c.thumbList("authorThumbnails"),
                    likes = c.num("likeCount").toInt(),
                    published = c.str("publishedText")
                )
            }
    }

    // --- channels --------------------------------------------------------------

    suspend fun getChannelInfo(channelId: String): ChannelInfo? =
        getObject("channels/$channelId")?.toChannel()

    suspend fun getChannelPage(channelId: String, limit: Int = 48): ChannelInfo? =
        getChannelInfo(channelId)

    suspend fun getChannelVideos(channelId: String, limit: Int = 48): List<VideoData> =
        getJsonArray(
            "channels/$channelId/videos",
            mapOf("sort_by" to "newest")
        ).map { it.toVideo() }.take(limit)

    suspend fun getChannelAvatars(ids: String): Map<String, ChannelInfo> {
        val wanted = ids.split(",").map { it.trim() }.filter { it.isNotBlank() }.take(20)
        val result = mutableMapOf<String, ChannelInfo>()
        for (id in wanted) {
            getChannelInfo(id)?.let { result[id] = it }
        }
        return result
    }

    // --- personal storage --------------------------------------------------------
    // History and likes are tracked locally (Room). Subscriptions use the
    // Invidious authenticated endpoints when a token is configured in Settings;
    // without one they answer gracefully in anonymous mode.

    suspend fun getHistory(limit: Int = 50): List<VideoData> = emptyList()

    suspend fun addToHistory(videoId: String, title: String, thumbnail: String, uploader: String): Boolean = true

    suspend fun getLiked(limit: Int = 50): List<VideoData> = emptyList()

    /**
     * Authenticated channel list: GET /auth/subscriptions.
     * When the app has no local token the request still goes out: a KV-Tube
     * gateway injects its server-side Invidious token, so subscriptions work
     * on your own instance without any manual setup.
     */
    suspend fun getSubscriptions(): List<Subscription> {
        return getJsonArray("auth/subscriptions", auth = true)
            .mapNotNull { o ->
                val id = o.str("authorId")
                if (id.isBlank()) null else Subscription(
                    channelId = id,
                    channelName = o.str("author"),
                    channelAvatar = o.thumbList("authorThumbnails")
                )
            }
    }

    /**
     * Authenticated subscription feed: GET /auth/feed?max_results=N.
     *
     * Invidious puts most fresh uploads under "notifications" instead of
     * "videos" (with many subscriptions nearly everything arrives as a
     * notification), so both lists are merged, deduped and sorted
     * newest-first — otherwise the feed looks almost empty.
     *
     * Returns null when the request itself failed (network problem, timeout,
     * or the instance rejected the credentials); an empty list means the
     * instance answered but the account has no feed items.
     */
    suspend fun getSubscriptionFeed(perChannel: Int = 5, channels: Int = 20, offset: Int = 0): List<VideoData>? {
        val maxResults = (perChannel * channels).coerceIn(10, 100)
        val body = getBody("auth/feed", mapOf("max_results" to maxResults.toString()), auth = true)
            ?: return null
        val element = try {
            json.parseToJsonElement(body)
        } catch (e: Exception) {
            Log.e(TAG, "GET auth/feed parse error: ${e.message}")
            return null
        }
        return parseSubscriptionFeed(element)
            .distinctBy { it.str("videoId") }
            .sortedBy { it.str("publishedText").relativeRecencyMinutes() }
            .map { it.toVideo() }
            .drop(offset)
    }

    /**
     * Remote subscribe: POST /auth/subscriptions/{channel_id} (204 on success).
     * Invidious reads the channel from the URL path — a JSON body on the
     * collection URL is rejected.
     */
    suspend fun subscribe(channelId: String, channelName: String, channelAvatar: String): Boolean {
        return try {
            client.post(api("auth/subscriptions/$channelId")) {
                applyAuth(this)
            }.status.isSuccess()
        } catch (e: Exception) {
            Log.e(TAG, "subscribe error: ${e.message}")
            false
        }
    }

    suspend fun unsubscribe(channelId: String): Boolean {
        return try {
            client.delete(api("auth/subscriptions/$channelId")) {
                applyAuth(this)
            }.status.isSuccess()
        } catch (e: Exception) {
            Log.e(TAG, "unsubscribe error: ${e.message}")
            false
        }
    }

    suspend fun isSubscribed(channelId: String): Boolean {
        return getJsonArray("auth/subscriptions", auth = true)
            .any { it.str("authorId") == channelId }
    }

    /** Outcome of an authenticated request against the instance. */
    enum class TokenCheck { VALID, REJECTED, UNREACHABLE }

    /**
     * Cheap authenticated probe (GET /auth/preferences, ~1 KB) used only when
     * the subscriptions page came back empty, to tell an expired/invalid
     * token apart from a server that is simply unreachable.
     */
    suspend fun checkToken(): TokenCheck {
        return try {
            val resp = client.get(api("auth/preferences")) { applyAuth(this) }
            when {
                resp.status.isSuccess() -> TokenCheck.VALID
                resp.status.value == 401 || resp.status.value == 403 -> TokenCheck.REJECTED
                else -> TokenCheck.UNREACHABLE
            }
        } catch (e: Exception) {
            TokenCheck.UNREACHABLE
        }
    }

    suspend fun checkServerStatus(): Boolean {
        return try {
            resolveGateway()
            client.get(api("stats")).status.isSuccess()
        } catch (e: Exception) {
            false
        }
    }
}
