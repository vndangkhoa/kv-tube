package com.kvtube.tv.data.repository

import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.model.InvidiousChannel
import com.kvtube.tv.data.model.InvidiousPlaylist
import com.kvtube.tv.data.model.InvidiousThumbnail
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.data.model.SearchResultItem
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.model.toTvVideo
import com.kvtube.tv.player.TvStreamUrls

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.Request

class InvidiousRepository {
    private val api get() = ApiClient.api

    suspend fun trending(region: String = "VN"): List<TvVideo> = try {
        api.getTrending(region).map { it.toTvVideo() }
    } catch (_: Exception) { emptyList() }

    // Invidious /api/v1/popular ignores region — keep it but home prefers region-scoped search.
    suspend fun popular(): List<TvVideo> = try {
        api.getPopular().map { it.toTvVideo() }
    } catch (_: Exception) { emptyList() }

    suspend fun search(
        query: String,
        region: String = "VN",
        page: Int = 1,
        sortBy: String = "relevance",
        date: String? = null,
    ): List<TvVideo> = try {
        api.search(query, page = page, region = region, type = "video", sortBy = sortBy, date = date).mapNotNull { it.toTvVideo() }
    } catch (_: Exception) { emptyList() }

    suspend fun searchRaw(query: String): List<SearchResultItem> = try {
        api.search(query)
    } catch (_: Exception) { emptyList() }

    // Resilient 3-stage video fetch: Invidious -> InnerTube -> direct DASH manifest probe
    suspend fun video(videoId: String): InvidiousVideo = coroutineScope {
        val id = videoId.trim()
        require(id.isNotBlank()) { "Empty videoId" }

        val innerTubeDeferred = async(Dispatchers.IO) {
            withTimeoutOrNull(8_000L) {
                runCatching { com.kvtube.tv.data.api.InnerTubeApi.getVideo(id) }.getOrNull()
            }
        }

        val invidiousDeferred = async(Dispatchers.IO) {
            withTimeoutOrNull(15_000L) {
                // Prefer default proxied endpoint first so streams aren't locked to server IP (avoids 403 on TV).
                val primary = runCatching { api.getVideo(id) }.getOrNull()
                if (primary != null && hasPlayableStreams(primary)) {
                    primary
                } else {
                    val direct = runCatching { api.getVideo(id, local = false) }.getOrNull()
                    when {
                        direct != null && hasPlayableStreams(direct) -> direct
                        primary != null -> primary
                        else -> direct
                    }
                }
            }
        }

        val invidious = invidiousDeferred.await()
        if (invidious != null && hasPlayableStreams(invidious)) {
            innerTubeDeferred.cancel()
            return@coroutineScope invidious
        }

        val fallback = innerTubeDeferred.await()
        if (fallback != null && hasPlayableStreams(fallback)) {
            if (invidious != null && invidious.title.isNotBlank()) {
                val merged = invidious.copy(
                    dashUrl = fallback.dashUrl ?: invidious.dashUrl,
                    hlsUrl = fallback.hlsUrl ?: invidious.hlsUrl,
                    formatStreams = fallback.formatStreams.ifEmpty { invidious.formatStreams },
                    adaptiveFormats = fallback.adaptiveFormats.ifEmpty { invidious.adaptiveFormats }
                )
                if (hasPlayableStreams(merged)) return@coroutineScope merged
            }
            return@coroutineScope fallback
        }

        // Stage 3: Probe direct Invidious DASH manifest endpoint in case /videos JSON endpoint
        // timed out or returned metadata without stream URLs.
        val manifestUrl = TvStreamUrls.dashManifestUrl(
            baseUrl = ApiClient.baseUrl,
            videoId = id,
            gateway = ApiClient.isGatewayMode,
        )
        if (probeDashManifest(manifestUrl)) {
            if (invidious != null) {
                return@coroutineScope invidious.copy(dashUrl = manifestUrl)
            }
            return@coroutineScope InvidiousVideo(
                videoId = id,
                title = "",
                dashUrl = manifestUrl,
                videoThumbnails = listOf(
                    InvidiousThumbnail(url = "https://i.ytimg.com/vi/$id/hqdefault.jpg")
                ),
            )
        }

        throw IllegalStateException("Unable to resolve playable video streams for $id")
    }

    private suspend fun probeDashManifest(manifestUrl: String): Boolean = withContext(Dispatchers.IO) {
        if (manifestUrl.isBlank()) return@withContext false
        withTimeoutOrNull(8_000L) {
            runCatching {
                val req = Request.Builder()
                    .url(manifestUrl)
                    .get()
                    .header("Range", "bytes=0-1023")
                    .build()
                ApiClient.okHttp.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful && resp.code != 206) return@use false
                    val peek = resp.body?.charStream()?.let { reader ->
                        val buf = CharArray(512)
                        val n = reader.read(buf)
                        if (n > 0) String(buf, 0, n) else ""
                    }.orEmpty()
                    peek.contains("<MPD", ignoreCase = true)
                }
            }.getOrDefault(false)
        } ?: false
    }

    private fun hasPlayableStreams(v: InvidiousVideo): Boolean =
        !v.dashUrl.isNullOrBlank() || !v.hlsUrl.isNullOrBlank() ||
            v.formatStreams.any { it.url.isNotBlank() } ||
            v.adaptiveFormats.any { it.url.isNotBlank() }

    /**
     * Same as [video] but returns null instead of throwing — useful for
     * best-effort callers that already handle empty state.
     */
    suspend fun videoOrNull(videoId: String): InvidiousVideo? = try { video(videoId) } catch (_: Exception) { null }

    suspend fun channel(channelId: String): InvidiousChannel? = try { api.getChannel(channelId) } catch (_: Exception) { null }

    suspend fun channelVideos(channelId: String): List<TvVideo> = try {
        api.getChannelVideos(channelId).videos.map { it.toTvVideo() }
    } catch (_: Exception) { emptyList() }

    suspend fun playlist(playlistId: String): InvidiousPlaylist? = try { api.getPlaylist(playlistId) } catch (_: Exception) { null }

    suspend fun related(video: InvidiousVideo): List<TvVideo> = video.recommendedVideos.map { it.toTvVideo() }

    suspend fun authFeed(): List<TvVideo> = try { api.getAuthFeed().map { it.toTvVideo() } } catch (_: Exception) { emptyList() }
    suspend fun authSubscriptions(): List<InvidiousChannel> = try { api.getAuthSubscriptions() } catch (_: Exception) { emptyList() }
    suspend fun authHistory(): List<TvVideo> = try { api.getAuthHistory().map { it.toTvVideo() } } catch (_: Exception) { emptyList() }
    suspend fun authPlaylists(): List<InvidiousPlaylist> = try { api.getAuthPlaylists() } catch (_: Exception) { emptyList() }

    suspend fun categoryRows(region: String = "VN"): Map<String, List<TvVideo>> {
        val queries = linkedMapOf(
            "Trending Now" to suspend { trending(region) },
            "Music Hits" to suspend { search("official music video top hits", region) },
            "Gaming" to suspend { search("gaming gameplay walkthrough", region) },
            "Movies & Trailers" to suspend { search("official movie trailer teaser", region) },
            "Tech & Gadgets" to suspend { search("technology gadgets smartphone review tech", region) },
            "Sports Highlights" to suspend { search("sports match highlights top plays", region) },
        )
        val out = linkedMapOf<String, List<TvVideo>>()
        for ((title, block) in queries) {
            val list = try { block() } catch (_: Exception) { emptyList() }
            if (list.isNotEmpty()) out[title] = list.take(18)
        }
        return out
    }

    suspend fun getSmartSuggestions(seedIds: List<String>, limit: Int = 12): List<TvVideo> {
        if (seedIds.isEmpty()) return emptyList()
        val seeds = seedIds.take(4)
        val watchedSet = seedIds.toSet()

        return coroutineScope {
            val jobs = seeds.map { seedId ->
                async {
                    val v = videoOrNull(seedId)
                    v?.recommendedVideos?.map { it.toTvVideo() } ?: emptyList()
                }
            }
            val pools = jobs.awaitAll()

            val seen = mutableSetOf<String>()
            seen.addAll(watchedSet)

            val suggestions = mutableListOf<TvVideo>()
            val maxDepth = 12
            for (depth in 0 until maxDepth) {
                for (pool in pools) {
                    if (depth < pool.size) {
                        val video = pool[depth]
                        if (video.id.isNotBlank() && seen.add(video.id)) {
                            suggestions.add(video)
                            if (suggestions.size >= limit) {
                                return@coroutineScope suggestions
                            }
                        }
                    }
                }
            }
            suggestions
        }
    }
}
