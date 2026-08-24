package com.kvtube.tv.data.api

import android.net.Uri
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Device pairing against the KV-Tube web frontend (/api/tv-pair).
 *
 * Flow: TV asks for a short code, displays it; the user types that code in
 * Web → Settings → "Pair Android TV", which pushes this server's instance URL
 * + Invidious token to the TV. No long token typing on the remote.
 */
object TvPairApi {
    private class CreateResp(val code: String?)
    private class StatusResp(
        val status: String?,
        val instanceUrl: String?,
        val token: String?,
    )

    data class Linked(val instanceUrl: String?, val token: String?)

    sealed interface Status {
        object Waiting : Status
        data class Paired(val linked: Linked) : Status
        object Expired : Status
    }

    private val moshi: Moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
    private val jsonMedia = "application/json".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    /** Asks the frontend for a fresh pairing code (6 chars, ~15 min TTL). */
    fun createCode(baseUrl: String): String {
        val body = "{\"action\":\"create\"}".toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url(endpoint(baseUrl))
            .post(body)
            .header("User-Agent", "Mozilla/5.0 (Linux; Android TV) KV-Tube TV")
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("Pair create HTTP ${resp.code}")
            val text = resp.body?.string() ?: throw IOException("Empty response")
            return moshi.adapter(CreateResp::class.java).lenient()
                .fromJson(text)?.code?.takeIf { it.isNotBlank() }
                ?: throw IOException("No code in response")
        }
    }

    fun checkStatus(baseUrl: String, code: String): Status {
        val url = endpoint(baseUrl) + "?code=" + Uri.encode(code)
        val req = Request.Builder()
            .url(url)
            .get()
            .header("User-Agent", "Mozilla/5.0 (Linux; Android TV) KV-Tube TV")
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("Pair status HTTP ${resp.code}")
            val text = resp.body?.string() ?: throw IOException("Empty response")
            val s = moshi.adapter(StatusResp::class.java).lenient().fromJson(text)
            return when {
                s?.status == "linked" -> Status.Paired(Linked(s.instanceUrl, s.token))
                s?.status == "expired" -> Status.Expired
                else -> Status.Waiting
            }
        }
    }

    private fun endpoint(baseUrl: String): String {
        val base = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return base + "api/tv-pair"
    }
}
