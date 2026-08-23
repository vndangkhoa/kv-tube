package com.kvtube.android.data.repository

import android.util.Log
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.bounded
import com.kvtube.android.data.local.SubscribedChannelDao
import com.kvtube.android.data.local.SubscribedChannelEntity
import com.kvtube.android.data.model.Subscription
import com.kvtube.android.data.model.VideoData
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Subscriptions work in two modes:
 *  1. Account mode — an Invidious session token is configured (or the instance
 *     injects one): /auth/subscriptions + /auth/feed power the page.
 *  2. Local mode — subscribed channels are stored on-device (Room). The feed is
 *     built from the newest uploads of each channel via the public
 *     /channels/{id}/videos endpoint, which needs no authentication.
 * Both sources are merged so the Subscriptions page works everywhere.
 */
@Singleton
class SubscriptionRepository @Inject constructor(
    private val api: KVApi,
    private val subscribedChannelDao: SubscribedChannelDao
) {
    companion object {
        private const val TAG = "SubscriptionRepo"
        /** How many latest videos to pull per channel when aggregating locally. */
        private const val PER_CHANNEL_DEPTH = 10
    }

    /** Cached aggregated local feed so paging doesn't refetch every channel. */
    private var localFeedCache: List<VideoData>? = null

    suspend fun getSubscriptions(): List<Subscription> {
        val remote = bounded(8_000L) { api.getSubscriptions() } ?: emptyList()
        val local = subscribedChannelDao.getAll().map { it.toModel() }
        return mergeSubs(remote, local)
    }

    /**
     * Returns the subscription feed page starting at [offset].
     * Prefers the authenticated Invidious feed; falls back to aggregating the
     * newest uploads of every subscribed channel (works without any token).
     */
    suspend fun getFeed(offset: Int = 0, pageSize: Int = 24): List<VideoData> {
        val authFeed = bounded(10_000L) {
            api.getSubscriptionFeed(perChannel = PER_CHANNEL_DEPTH, channels = 30)
        } ?: emptyList()

        if (authFeed.isNotEmpty()) {
            localFeedCache = null
            return authFeed.drop(offset).take(pageSize)
        }

        return getLocalAggregatedFeed(offset, pageSize)
    }

    private suspend fun getLocalAggregatedFeed(offset: Int, pageSize: Int): List<VideoData> {
        val cached = localFeedCache
        if (cached == null || cached.size < offset + pageSize) {
            val subs = getSubscriptions()
            if (subs.isEmpty()) {
                localFeedCache = emptyList()
                return emptyList()
            }

            Log.d(TAG, "Building subscription feed from ${subs.size} channels")
            val perChannel = subs.mapNotNull { sub ->
                bounded(8_000L) {
                    api.getChannelVideos(sub.channelId, PER_CHANNEL_DEPTH)
                } ?: emptyList()
            }
            val merged = perChannel.flatten()
                .filter { it.id.isNotBlank() }
                .distinctBy { it.id }
                .sortedBy { it.published.orEmpty().relativeRecencyMinutes() }
            localFeedCache = merged
        }
        return localFeedCache.orEmpty().drop(offset).take(pageSize)
    }

    suspend fun subscribe(channelId: String, channelName: String, channelAvatar: String): Boolean {
        if (channelId.isBlank()) return false

        // Always persist on-device first: this alone makes subscriptions work.
        runCatching { subscribedChannelDao.upsert(SubscribedChannelEntity(channelId, channelName, channelAvatar)) }
            .onFailure { Log.e(TAG, "Local subscribe failed: ${it.message}") }
        localFeedCache = null

        // Best-effort sync to the Invidious account (no-op without a token).
        val remoteOk = runCatching { bounded(5_000L) { api.subscribe(channelId, channelName, channelAvatar) } }
            .getOrNull() ?: false
        Log.d(TAG, "Subscribed $channelId (remote=$remoteOk)")
        return true
    }

    suspend fun unsubscribe(channelId: String): Boolean {
        runCatching { subscribedChannelDao.delete(channelId) }
        localFeedCache = null
        return runCatching { bounded(5_000L) { api.unsubscribe(channelId) } }.getOrNull() ?: false
    }

    suspend fun isSubscribed(channelId: String): Boolean {
        if (channelId.isBlank()) return false
        return runCatching { subscribedChannelDao.exists(channelId) }.getOrDefault(false) ||
            (bounded(4_000L) { api.isSubscribed(channelId) } ?: false)
    }

    private fun SubscribedChannelEntity.toModel() = Subscription(
        channelId = channelId,
        channelName = channelName,
        channelAvatar = channelAvatar
    )
}

/** Invidious account subs + device-local subs, deduped and name-sorted. */
internal fun mergeSubs(remote: List<Subscription>, local: List<Subscription>): List<Subscription> =
    (remote + local)
        .distinctBy { it.channelId }
        .sortedBy { it.channelName.lowercase() }

/**
 * Rough recency score (in minutes) parsed from Invidious "publishedText"
 * labels like "3 hours ago", "2 weeks ago", "Streamed 1 day ago".
 * Newer videos yield smaller values (0 = just now / live).
 */
internal fun String.relativeRecencyMinutes(): Long {
    val text = lowercase()
    val number = Regex("(\\d+)").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
    return when {
        "second" in text -> number / 60L
        "minute" in text -> number
        "hour" in text -> number * 60L
        "day" in text -> number * 60L * 24L
        "week" in text -> number * 60L * 24L * 7L
        "month" in text -> number * 60L * 24L * 30L
        "year" in text -> number * 60L * 24L * 365L
        else -> 0L // live now or unknown → treat as freshest
    }
}
