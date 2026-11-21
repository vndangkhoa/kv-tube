package com.kvtube.android.data.net

import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.Protocol
import java.util.concurrent.TimeUnit

/**
 * One shared OkHttp client for the media path (ExoPlayer segments) and image
 * loading (Coil). HTTP/2 multiplexes the many small DASH / thumbnail requests
 * over a single warm TLS connection to the gateway instead of opening a new
 * HttpURLConnection + TLS handshake for each one, which is a large part of
 * perceived start-up time on mobile networks.
 */
object KvHttp {
    val client: OkHttpClient by lazy {
        val dispatcher = Dispatcher().apply {
            maxRequests = 64
            maxRequestsPerHost = 24
        }
        OkHttpClient.Builder()
            .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
            .dispatcher(dispatcher)
            .connectionPool(ConnectionPool(8, 5, TimeUnit.MINUTES))
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}
