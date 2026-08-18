package com.kvtube.android.data.api

import android.util.Log
import com.kvtube.android.data.model.ChannelInfo
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.Subscription
import com.kvtube.android.data.model.VideoData
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class KVApi(
    private val client: HttpClient,
    private val json: Json
) {
    companion object {
        private const val TAG = "KVApi"
        private const val DEFAULT_BASE_URL = "https://ut.khoavo.myds.me"
    }

    @Volatile
    private var baseUrl: String = DEFAULT_BASE_URL

    fun setServerUrl(url: String) {
        val clean = url.trim().removeSuffix("/")
        baseUrl = if (clean.isNotEmpty()) clean else DEFAULT_BASE_URL
        Log.d(TAG, "Server URL set to: $baseUrl")
    }

    fun getServerUrl(): String = baseUrl

    private fun url(path: String): String {
        val p = if (path.startsWith("/")) path else "/$path"
        return "$baseUrl$p"
    }

    suspend fun search(query: String, limit: Int = 20, region: String = ""): List<VideoData> {
        return try {
            client.get(url("/api/search")) {
                parameter("q", query)
                parameter("limit", limit)
                if (region.isNotBlank() && region != "GLOBAL") {
                    parameter("region", region)
                }
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "search error for $query: ${e.message}")
            emptyList()
        }
    }

    suspend fun getHomeFeed(limit: Int = 30, offset: Int = 0, region: String = ""): List<VideoData> {
        return try {
            val response = client.get(url("/api/home")) {
                parameter("limit", limit)
                parameter("offset", offset)
                if (region.isNotBlank() && region != "GLOBAL") {
                    parameter("region", region)
                }
            }
            val text = response.bodyAsText()
            val parsedElement = json.parseToJsonElement(text)
            when (parsedElement) {
                is JsonArray -> json.decodeFromJsonElement<List<VideoData>>(parsedElement)
                is JsonObject -> {
                    val videosArray = parsedElement["videos"]?.jsonArray
                    if (videosArray != null) {
                        json.decodeFromJsonElement<List<VideoData>>(videosArray)
                    } else {
                        emptyList()
                    }
                }
                else -> emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "getHomeFeed error: ${e.message}")
            emptyList()
        }
    }

    suspend fun getTrending(limit: Int = 20, region: String = ""): List<VideoData> {
        return try {
            client.get(url("/api/trending")) {
                parameter("limit", limit)
                if (region.isNotBlank() && region != "GLOBAL") {
                    parameter("region", region)
                }
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "getTrending error: ${e.message}")
            emptyList()
        }
    }

    suspend fun getVideoInfo(videoId: String): VideoData {
        return client.get(url("/api/video/$videoId")).body()
    }

    suspend fun getPlaybackInfo(videoId: String, audio: String = "opus"): PlaybackInfo {
        return client.get(url("/api/video/$videoId/playback-info")) {
            parameter("audio", audio)
        }.body()
    }

    suspend fun getRelatedVideos(videoId: String, limit: Int = 15): List<VideoData> {
        return try {
            client.get(url("/api/video/$videoId/related")) {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "getRelatedVideos error for $videoId: ${e.message}")
            emptyList()
        }
    }

    suspend fun getComments(videoId: String, limit: Int = 20): List<Comment> {
        return try {
            client.get(url("/api/video/$videoId/comments")) {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "getComments error for $videoId: ${e.message}")
            emptyList()
        }
    }

    suspend fun getChannelInfo(channelId: String): ChannelInfo? {
        return try {
            client.get(url("/api/channel/info")) {
                parameter("id", channelId)
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "getChannelInfo error for $channelId: ${e.message}")
            null
        }
    }

    suspend fun getChannelPage(channelId: String, limit: Int = 48): ChannelInfo? {
        return try {
            val response = client.get(url("/api/channel/page")) {
                parameter("id", channelId)
                parameter("limit", limit)
            }
            response.body<ChannelInfo>()
        } catch (e: Exception) {
            Log.e(TAG, "getChannelPage error for $channelId: ${e.message}")
            null
        }
    }

    suspend fun getChannelVideos(channelId: String, limit: Int = 48): List<VideoData> {
        return try {
            client.get(url("/api/channel/videos")) {
                parameter("id", channelId)
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "getChannelVideos error for $channelId: ${e.message}")
            emptyList()
        }
    }

    suspend fun getChannelAvatars(ids: String): Map<String, ChannelInfo> {
        return try {
            val response = client.get(url("/api/channel/avatars")) {
                parameter("ids", ids)
            }
            val text = response.bodyAsText()
            val parsedObj = json.parseToJsonElement(text).jsonObject
            val result = mutableMapOf<String, ChannelInfo>()
            for ((key, value) in parsedObj) {
                val avatarObj = value.jsonObject
                val avatarUrl = avatarObj["avatar_url"]?.jsonPrimitive?.content ?: ""
                val name = avatarObj["name"]?.jsonPrimitive?.content ?: ""
                result[key] = ChannelInfo(
                    id = key,
                    title = name,
                    avatarUrl = avatarUrl,
                    avatar = avatarUrl
                )
            }
            result
        } catch (e: Exception) {
            Log.e(TAG, "getChannelAvatars error: ${e.message}")
            emptyMap()
        }
    }

    suspend fun getHistory(limit: Int = 50): List<VideoData> {
        return try {
            client.get(url("/api/history")) {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "getHistory error: ${e.message}")
            emptyList()
        }
    }

    suspend fun addToHistory(videoId: String, title: String, thumbnail: String, uploader: String): Boolean {
        return try {
            val resp = client.post(url("/api/history")) {
                contentType(ContentType.Application.Json)
                setBody(
                    mapOf(
                        "video_id" to videoId,
                        "title" to title,
                        "thumbnail" to thumbnail,
                        "uploader" to uploader
                    )
                )
            }
            resp.status.isSuccess()
        } catch (e: Exception) {
            Log.e(TAG, "addToHistory error: ${e.message}")
            false
        }
    }

    suspend fun getLiked(limit: Int = 50): List<VideoData> {
        return try {
            client.get(url("/api/liked")) {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "getLiked error: ${e.message}")
            emptyList()
        }
    }

    suspend fun getSubscriptions(): List<Subscription> {
        return try {
            client.get(url("/api/subscriptions")).body()
        } catch (e: Exception) {
            Log.e(TAG, "getSubscriptions error: ${e.message}")
            emptyList()
        }
    }

    suspend fun getSubscriptionFeed(perChannel: Int = 5, channels: Int = 20, offset: Int = 0): List<VideoData> {
        return try {
            client.get(url("/api/subscriptions/feed")) {
                parameter("per_channel", perChannel)
                parameter("channels", channels)
                parameter("offset", offset)
            }.body()
        } catch (e: Exception) {
            Log.e(TAG, "getSubscriptionFeed error: ${e.message}")
            emptyList()
        }
    }

    suspend fun subscribe(channelId: String, channelName: String, channelAvatar: String): Boolean {
        return try {
            val resp = client.post(url("/api/subscribe")) {
                contentType(ContentType.Application.Json)
                setBody(
                    mapOf(
                        "channel_id" to channelId,
                        "channel_name" to channelName,
                        "channel_avatar" to channelAvatar
                    )
                )
            }
            resp.status.isSuccess()
        } catch (e: Exception) {
            Log.e(TAG, "subscribe error: ${e.message}")
            false
        }
    }

    suspend fun unsubscribe(channelId: String): Boolean {
        return try {
            val resp = client.delete(url("/api/subscribe")) {
                parameter("channel_id", channelId)
            }
            resp.status.isSuccess()
        } catch (e: Exception) {
            Log.e(TAG, "unsubscribe error: ${e.message}")
            false
        }
    }

    suspend fun isSubscribed(channelId: String): Boolean {
        return try {
            val resp = client.get(url("/api/subscribe")) {
                parameter("channel_id", channelId)
            }
            val text = resp.bodyAsText()
            val parsedObj = json.parseToJsonElement(text).jsonObject
            parsedObj["subscribed"]?.jsonPrimitive?.booleanOrNull ?: false
        } catch (e: Exception) {
            false
        }
    }

    suspend fun checkServerStatus(): Boolean {
        return try {
            val resp = client.get(url("/api/health"))
            resp.status.isSuccess()
        } catch (e: Exception) {
            false
        }
    }
}
