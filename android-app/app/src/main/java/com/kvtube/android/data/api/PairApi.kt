package com.kvtube.android.data.api

import android.util.Log
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException

/**
 * Device pairing against the KV-Tube web frontend (/api/tv-pair).
 *
 * Same flow as the TV app: a device that needs credentials shows a short
 * 6-character code and polls; an already-signed-in device (Web → Settings,
 * another phone, or this app via [sendCredentials]) pushes the instance URL +
 * Invidious token over. Credentials change hands exactly once per code.
 */
class PairApi(
    private val client: HttpClient,
    private val json: Json,
) {
    companion object {
        private const val TAG = "PairApi"
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

    /** Asks the frontend for a fresh pairing code (6 chars, ~15 min TTL). */
    suspend fun createCode(baseUrl: String): String {
        val resp = client.post(endpoint(baseUrl)) {
            setBody("""{"action":"create"}""")
        }
        if (!resp.status.isSuccess()) throw IOException("Pair create HTTP ${resp.status.value}")
        val body = resp.bodyAsText()
        val code = runCatching {
            json.parseToJsonElement(body).jsonObject["code"]?.jsonPrimitive?.content
        }.getOrNull()
        return code?.takeIf { it.isNotBlank() } ?: throw IOException("No code in response")
    }

    suspend fun checkStatus(baseUrl: String, code: String): Status {
        val resp = client.get(endpoint(baseUrl)) {
            parameter("code", code)
        }
        if (!resp.status.isSuccess()) throw IOException("Pair status HTTP ${resp.status.value}")
        val o = runCatching {
            json.parseToJsonElement(resp.bodyAsText()).jsonObject
        }.getOrNull() ?: return Status.Waiting
        return when (o["status"]?.jsonPrimitive?.content) {
            "linked" -> Status.Paired(
                instanceUrl = o["instanceUrl"]?.jsonPrimitive?.content,
                token = o["token"]?.jsonPrimitive?.content,
            )
            // expired AND consumed both mean "this code will never link now"
            // → callers respond by generating a fresh code
            "expired", "consumed" -> Status.Expired
            else -> Status.Waiting
        }
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
    ): SendResult {
        val resp = try {
            client.post(endpoint(baseUrl)) {
                setBody(
                    buildJsonObject {
                        put("action", "link")
                        put("code", code)
                        put("instanceUrl", instanceUrl)
                        put("token", token)
                    }.toString()
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "send error: ${e.message}")
            return SendResult.Error("Could not reach the pairing service")
        }
        val body = resp.bodyAsText()
        val error = runCatching {
            json.parseToJsonElement(body).jsonObject["error"]?.jsonPrimitive?.content
        }.getOrNull()
        if (!resp.status.isSuccess()) {
            return SendResult.Error(error ?: "Failed to send (HTTP ${resp.status.value})")
        }
        return SendResult.Ok
    }

    private fun endpoint(baseUrl: String): String {
        val base = baseUrl.trim().removeSuffix("/")
        return "$base/api/tv-pair"
    }
}
