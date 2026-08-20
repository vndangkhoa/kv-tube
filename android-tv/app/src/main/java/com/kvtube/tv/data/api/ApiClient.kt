package com.kvtube.tv.data.api

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Invidious API client — mirrors frontend's InvidiousService.
 * Default instance: https://yt.khoavo.myds.me (from docker-compose domain).
 * Stored overrides: DataStore keys kv_invidious_instance / kv_invidious_token.
 */
object ApiClient {
    private var _baseUrl: String = "https://yt.khoavo.myds.me/"
    private var _token: String? = null

    var baseUrl: String
        get() = _baseUrl
        set(v) {
            _baseUrl = if (v.endsWith("/")) v else "$v/"
            synchronized(this) { _api = null }
        }

    var token: String?
        get() = _token
        set(v) {
            _token = v?.trim()?.ifBlank { null }
            synchronized(this) { _api = null }
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
            // Mirror frontend fetchAuthApi: Bearer for JSON tokens, SID for legacy
            if (trimmed.startsWith("{")) {
                req.header("Authorization", "Bearer $trimmed")
            } else {
                req.header("Cookie", "SID=$trimmed")
                // also as Bearer for compatibility with some Invidious builds
                req.header("Authorization", "Bearer $trimmed")
            }
            // extra header for Next proxy parity
            req.header("x-invidious-token", trimmed)
        }
        chain.proceed(req.build())
    }

    private val okHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
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

    fun reset() { synchronized(this) { _api = null } }
}
