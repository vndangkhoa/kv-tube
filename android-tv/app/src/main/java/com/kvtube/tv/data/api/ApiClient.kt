package com.kvtube.tv.data.api

import android.net.Uri
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Invidious API client — production-grade with dynamic instance switching,
 * URL normalization, gateway mode support, and stream URL rewriting.
 *
 * Default instance: https://yt.khoavo.myds.me (from docker-compose domain).
 */
object ApiClient {
    const val DEFAULT_INSTANCE = "https://yt.khoavo.myds.me"

    private var _baseUrl: String = "https://yt.khoavo.myds.me/"
    private var _token: String? = null

    private val _instanceFlow = MutableStateFlow(_baseUrl.trimEnd('/'))
    val instanceFlow: StateFlow<String> = _instanceFlow.asStateFlow()

    @Volatile
    var isGatewayMode: Boolean = false
        private set

    var baseUrl: String
        get() = _baseUrl
        set(v) {
            val normalized = normalizeInstanceUrl(v)
            _baseUrl = if (normalized.endsWith("/")) normalized else "$normalized/"
            _instanceFlow.value = normalized.trimEnd('/')
            synchronized(this) { _api = null }
        }

    var token: String?
        get() = _token
        set(v) {
            _token = v?.trim()?.ifBlank { null }
            synchronized(this) { _api = null }
        }

    fun setInstance(url: String, tok: String? = null) {
        val clean = normalizeInstanceUrl(url)
        _baseUrl = "$clean/"
        _token = tok?.trim()?.ifBlank { null }
        _instanceFlow.value = clean
        isGatewayMode = false
        synchronized(this) { _api = null }
    }

    /**
     * Normalizes user-entered instance URLs:
     * - Trims whitespace and trailing slashes
     * - Removes redundant /api/v1 or /api/invidious/api/v1 suffixes
     * - Adds scheme (http:// for LAN/local IPs, https:// for domains) if missing
     */
    fun normalizeInstanceUrl(raw: String): String {
        var s = raw.trim()
        if (s.isBlank()) return DEFAULT_INSTANCE

        // Add scheme if omitted
        if (!s.startsWith("http://", ignoreCase = true) && !s.startsWith("https://", ignoreCase = true)) {
            val isLocalOrIp = s.startsWith("192.168.") || s.startsWith("10.") ||
                    s.startsWith("172.") || s.startsWith("127.0.0.1") ||
                    s.startsWith("localhost") || s.contains(":")
            s = if (isLocalOrIp) "http://$s" else "https://$s"
        }

        // Strip trailing slashes
        s = s.trimEnd('/')

        // Strip trailing API endpoints if accidentally entered
        val apiSuffixes = listOf(
            "/api/invidious/api/v1",
            "/api/invidious/api",
            "/api/invidious",
            "/api/v1",
            "/api"
        )
        for (suffix in apiSuffixes) {
            if (s.endsWith(suffix, ignoreCase = true)) {
                if (suffix.contains("invidious")) {
                    isGatewayMode = true
                }
                s = s.substring(0, s.length - suffix.length).trimEnd('/')
                break
            }
        }

        return s.ifBlank { DEFAULT_INSTANCE }
    }

    private val moshi: Moshi = Moshi.Builder()
        .add(LenientLongAdapter())
        .addLast(KotlinJsonAdapterFactory())
        .build()

    private val authInterceptor = Interceptor { chain ->
        val req = chain.request().newBuilder()
            .header("User-Agent", "Mozilla/5.0 (Linux; Android TV) KV-Tube TV")
            .header("Accept", "application/json")
        _token?.let { t ->
            val trimmed = t.trim()
            if (trimmed.startsWith("{")) {
                req.header("Authorization", "Bearer $trimmed")
            } else {
                req.header("Cookie", "SID=$trimmed")
                req.header("Authorization", "Bearer $trimmed")
            }
            req.header("x-invidious-token", trimmed)
        }
        chain.proceed(req.build())
    }

    /**
     * Supports both raw Invidious (/api/v1/...) and KV-Tube web frontend gateway
     * (/api/invidious/api/v1/...). If a request to /api/v1/ fails with 404/HTML,
     * automatically retries under the gateway path.
     */
    private val gatewayInterceptor = Interceptor { chain ->
        val original = chain.request()
        val path = original.url.encodedPath

        if (isGatewayMode && path.startsWith("/api/v1/")) {
            val newPath = "/api/invidious$path"
            val newUrl = original.url.newBuilder().encodedPath(newPath).build()
            return@Interceptor chain.proceed(original.newBuilder().url(newUrl).build())
        }

        val response = chain.proceed(original)
        val contentType = response.header("Content-Type")?.lowercase().orEmpty()
        val isHtmlOr404 = response.code == 404 || (!response.isSuccessful && contentType.contains("text/html"))

        if (isHtmlOr404 && path.startsWith("/api/v1/")) {
            // Server might be KV-Tube web UI gateway — try /api/invidious/api/v1/
            response.close()
            val newPath = "/api/invidious$path"
            val newUrl = original.url.newBuilder().encodedPath(newPath).build()
            val retryResp = chain.proceed(original.newBuilder().url(newUrl).build())
            if (retryResp.isSuccessful) {
                isGatewayMode = true
            }
            return@Interceptor retryResp
        }

        response
    }

    val okHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .addInterceptor(authInterceptor)
        .addInterceptor(gatewayInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
        .build()

    @Volatile private var _api: InvidiousApi? = null

    val api: InvidiousApi
        get() = synchronized(this) {
            if (_api == null) {
                _api = Retrofit.Builder()
                    .baseUrl(_baseUrl)
                    .client(okHttp)
                    .addConverterFactory(MoshiConverterFactory.create(moshi))
                    .build()
                    .create(InvidiousApi::class.java)
            }
            _api!!
        }

    fun thumbnailProxyUrl(videoId: String): String =
        if (videoId.isBlank()) "" else "https://i.ytimg.com/vi/$videoId/mqdefault.jpg"

    /**
     * Rewrites media and manifest URLs returned by Invidious to use the currently
     * active instance's scheme and host. This prevents failures when an Invidious
     * server embeds its own internal/configured domain (e.g. yt.khoavo.myds.me)
     * instead of the host the user connected to (e.g. 192.168.31.71:7601).
     */
    fun rewriteStreamUrl(rawUrl: String): String {
        val u = rawUrl.trim()
        if (u.isBlank()) return ""
        val base = _baseUrl.trimEnd('/')

        // Protocol-relative URL
        if (u.startsWith("//")) {
            val scheme = if (base.startsWith("http://", ignoreCase = true)) "http" else "https"
            return "$scheme:$u"
        }

        // Relative path
        if (u.startsWith("/")) {
            return "$base$u"
        }

        val host = try { java.net.URI(u).host.orEmpty() } catch (_: Exception) { "" }
        val isGoogleVideo = host.contains("googlevideo.com", ignoreCase = true) ||
                host.contains("youtube.com", ignoreCase = true) ||
                host.contains("ytimg.com", ignoreCase = true)

        val isInvidiousEndpoint = !isGoogleVideo && (
            u.contains("/api/manifest/") ||
            u.contains("/videoplayback") ||
            u.contains("/latest_version")
        )

        if (isInvidiousEndpoint) {
            return try {
                val baseUri = java.net.URI(base)
                val baseScheme = baseUri.scheme ?: "https"
                val baseHost = baseUri.host ?: ""
                val basePort = baseUri.port
                val baseAuth = if (basePort > 0) "$baseHost:$basePort" else baseHost

                val streamUri = java.net.URI(u)
                val path = streamUri.rawPath.orEmpty()
                val query = if (streamUri.rawQuery != null) "?${streamUri.rawQuery}" else ""
                "$baseScheme://$baseAuth$path$query"
            } catch (_: Exception) {
                // Fallback: replace scheme and authority up to the path
                val slashIdx = u.indexOf('/', 8)
                if (slashIdx != -1) "$base${u.substring(slashIdx)}" else u
            }
        }

        // For non-LAN http URLs, upgrade to https
        if (u.startsWith("http://", ignoreCase = true)) {
            val isLan = host == "localhost" || host == "127.0.0.1" ||
                    host.startsWith("192.168.") || host.startsWith("10.") ||
                    host.startsWith("172.16.") || host.startsWith("172.17.") ||
                    host.startsWith("172.18.") || host.startsWith("172.19.") ||
                    host.startsWith("172.20.") || host.startsWith("172.21.") ||
                    host.startsWith("172.22.") || host.startsWith("172.23.") ||
                    host.startsWith("172.24.") || host.startsWith("172.25.") ||
                    host.startsWith("172.26.") || host.startsWith("172.27.") ||
                    host.startsWith("172.28.") || host.startsWith("172.29.") ||
                    host.startsWith("172.30.") || host.startsWith("172.31.") ||
                    host.endsWith(".local")
            if (!isLan && host.isNotBlank()) {
                return u.replaceFirst("http://", "https://", ignoreCase = true)
            }
        }

        return u
    }

    fun reset() { synchronized(this) { _api = null } }
}
