package com.kvtube.tv.data.api

import android.net.Uri
import android.util.Log
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
    private const val TAG = "TvPairApi"
    const val PRIMARY_BASE_URL = "https://ut.khoavo.myds.me"

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
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    private fun candidateUrls(baseUrl: String): List<String> {
        val list = mutableListOf<String>()
        val norm = normalizeUrl(baseUrl)
        if (norm.isNotBlank()) {
            list.add(norm)
        }
        if (!list.contains(PRIMARY_BASE_URL)) {
            list.add(PRIMARY_BASE_URL)
        }
        return list
    }

    private fun normalizeUrl(raw: String): String {
        var s = raw.trim().removeSuffix("/")
        if (s.isBlank()) return ""
        if (!s.startsWith("http://") && !s.startsWith("https://")) {
            s = "https://$s"
        }
        // Force HTTPS for non-LAN addresses to avoid reverse proxy redirects
        if (s.startsWith("http://") && !s.contains("192.168.") && !s.contains("127.0.0.1") && !s.contains("localhost")) {
            s = s.replaceFirst("http://", "https://")
        }
        return s
    }

    /** Asks the frontend for a fresh pairing code (6 chars, ~15 min TTL). */
    fun createCode(baseUrl: String): String {
        val urls = candidateUrls(baseUrl)
        var lastErr: Exception? = null

        for (base in urls) {
            try {
                val body = "{\"action\":\"create\"}".toRequestBody(jsonMedia)
                val req = Request.Builder()
                    .url("$base/api/tv-pair")
                    .post(body)
                    .header("Accept", "application/json")
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android TV) KV-Tube TV")
                    .build()
                client.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val text = resp.body?.string().orEmpty()
                        val code = moshi.adapter(CreateResp::class.java).lenient()
                            .fromJson(text)?.code?.takeIf { it.isNotBlank() }
                        if (code != null) return code
                    } else {
                        Log.w(TAG, "createCode on $base returned HTTP ${resp.code}")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "createCode failed on $base: ${e.message}")
                lastErr = e
            }
        }
        throw (lastErr ?: IOException("Could not reach pairing service on any server"))
    }

    fun checkStatus(baseUrl: String, code: String): Status {
        val urls = candidateUrls(baseUrl)
        for (base in urls) {
            try {
                val url = "$base/api/tv-pair?code=" + Uri.encode(code)
                val req = Request.Builder()
                    .url(url)
                    .get()
                    .header("Accept", "application/json")
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android TV) KV-Tube TV")
                    .build()
                client.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val text = resp.body?.string().orEmpty()
                        val s = moshi.adapter(StatusResp::class.java).lenient().fromJson(text)
                        if (s != null && s.status != null) {
                            return when {
                                s.status == "linked" -> Status.Paired(Linked(s.instanceUrl, s.token))
                                s.status == "expired" || s.status == "consumed" -> Status.Expired
                                else -> Status.Waiting
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "checkStatus error on $base: ${e.message}")
            }
        }
        return Status.Waiting
    }
}
