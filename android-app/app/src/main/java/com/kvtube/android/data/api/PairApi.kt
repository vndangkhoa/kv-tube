package com.kvtube.android.data.api

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Device pairing against the KV-Tube web frontend (/api/tv-pair).
 *
 * Same flow as the TV app: a device that needs credentials shows a short
 * 6-character code and polls; an already-signed-in device (Web → Settings,
 * another phone, or this app via [sendCredentials]) pushes the instance URL +
 * Invidious token over. Credentials change hands exactly once per code.
 */
@Singleton
class PairApi @Inject constructor(
    private val okHttpClient: OkHttpClient,
    private val json: Json,
) {
    companion object {
        private const val TAG = "PairApi"
        const val PRIMARY_BASE_URL = "https://ut.khoavo.myds.me"
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }

    /** Poll result for the device waiting to be paired. */
    sealed interface Status {
        object Waiting : Status
        data class Paired(val instanceUrl: String?, val token: String?) : Status
        object Expired : Status
    }

    /** Result of pushing credentials to a code shown on another device. */
    sealed interface SendResult {
        object Ok : SendResult
        data class Error(val message: String) : SendResult
    }

    /**
     * Builds candidate URLs to try in order:
     * 1. The normalized user-provided baseUrl (if non-blank)
     * 2. The primary production KV-Tube web frontend URL (https://ut.khoavo.myds.me)
     */
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
    suspend fun createCode(baseUrl: String): String = withContext(Dispatchers.IO) {
        val urls = candidateUrls(baseUrl)
        var lastErr: Exception? = null

        for (base in urls) {
            try {
                val ep = "$base/api/tv-pair"
                val body = """{"action":"create"}""".toRequestBody(JSON_MEDIA)
                val req = Request.Builder()
                    .url(ep)
                    .post(body)
                    .header("Accept", "application/json")
                    .header("User-Agent", "KV-Tube Android")
                    .build()

                okHttpClient.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val text = resp.body?.string().orEmpty()
                        val code = runCatching {
                            json.parseToJsonElement(text).jsonObject["code"]?.jsonPrimitive?.content
                        }.getOrNull()
                        if (!code.isNullOrBlank()) {
                            return@withContext code
                        }
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

    suspend fun checkStatus(baseUrl: String, code: String): Status = withContext(Dispatchers.IO) {
        val urls = candidateUrls(baseUrl)
        for (base in urls) {
            try {
                val ep = "$base/api/tv-pair?code=${URLEncoder.encode(code, "UTF-8")}"
                val req = Request.Builder()
                    .url(ep)
                    .get()
                    .header("Accept", "application/json")
                    .header("User-Agent", "KV-Tube Android")
                    .build()

                okHttpClient.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val text = resp.body?.string().orEmpty()
                        val o = runCatching {
                            json.parseToJsonElement(text).jsonObject
                        }.getOrNull()
                        if (o != null) {
                            val statusStr = o["status"]?.jsonPrimitive?.content
                            if (statusStr != null) {
                                return@withContext when (statusStr) {
                                    "linked" -> Status.Paired(
                                        instanceUrl = o["instanceUrl"]?.jsonPrimitive?.content,
                                        token = o["token"]?.jsonPrimitive?.content,
                                    )
                                    "expired", "consumed" -> Status.Expired
                                    else -> Status.Waiting
                                }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "checkStatus error on $base: ${e.message}")
            }
        }
        Status.Waiting
    }

    /**
     * Pushes this device's connection to a code shown on another device
     * (TV → "Pair device", web Settings → pair form). Server errors surface
     * their message so the user can tell a typo from an expired code.
     */
    suspend fun sendCredentials(
        baseUrl: String,
        code: String,
        instanceUrl: String,
        token: String,
    ): SendResult = withContext(Dispatchers.IO) {
        val urls = candidateUrls(baseUrl)
        var lastErr = "Could not reach the pairing service"

        for (base in urls) {
            try {
                val ep = "$base/api/tv-pair"
                val jsonPayload = buildJsonObject {
                    put("action", "link")
                    put("code", code)
                    put("instanceUrl", instanceUrl)
                    put("token", token)
                }.toString()

                val body = jsonPayload.toRequestBody(JSON_MEDIA)
                val req = Request.Builder()
                    .url(ep)
                    .post(body)
                    .header("Accept", "application/json")
                    .header("User-Agent", "KV-Tube Android")
                    .build()

                okHttpClient.newCall(req).execute().use { resp ->
                    val text = resp.body?.string().orEmpty()
                    if (resp.isSuccessful) {
                        return@withContext SendResult.Ok
                    } else {
                        val error = runCatching {
                            json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content
                        }.getOrNull()
                        if (error != null) {
                            return@withContext SendResult.Error(error)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "sendCredentials error on $base: ${e.message}")
                lastErr = e.message ?: lastErr
            }
        }
        SendResult.Error(lastErr)
    }
}
