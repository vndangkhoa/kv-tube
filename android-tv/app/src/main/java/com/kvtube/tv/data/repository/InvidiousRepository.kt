package com.kvtube.tv.data.repository

import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.model.InvidiousChannel
import com.kvtube.tv.data.model.InvidiousPlaylist
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.data.model.SearchResultItem
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.model.toTvVideo

class InvidiousRepository {
    private val api get() = ApiClient.api

    suspend fun trending(region: String = "VN"): List<TvVideo> = try {
        api.getTrending(region).map { it.toTvVideo() }
    } catch (_: Exception) { emptyList() }

    // Invidious /api/v1/popular ignores region — keep it but home prefers region-scoped search.
    suspend fun popular(): List<TvVideo> = try {
        api.getPopular().map { it.toTvVideo() }
    } catch (_: Exception) { emptyList() }

    suspend fun search(query: String, region: String = "VN", page: Int = 1, sortBy: String = "relevance"): List<TvVideo> = try {
        api.search(query, page = page, region = region, type = "video", sortBy = sortBy).mapNotNull { it.toTvVideo() }
    } catch (_: Exception) { emptyList() }

    suspend fun searchRaw(query: String): List<SearchResultItem> = try {
        api.search(query)
    } catch (_: Exception) { emptyList() }

    // Resilient video fetch: try Invidious first, then fall back to direct InnerTube ANDROID client
    // when Invidious returns 500 "This content isn't available" (broken companion signature).
    suspend fun video(videoId: String): InvidiousVideo {
        val id = videoId.trim()
        require(id.isNotBlank()) { "Empty videoId" }
        var lastInvidiousError: Exception? = null
        var invidiousVideo: InvidiousVideo? = null
        try {
            invidiousVideo = api.getVideo(id)
            // Invidious sometimes returns 200 but with no playable streams (companion silently failed).
            // Treat that as broken and fall through to InnerTube.
            if (hasPlayableStreams(invidiousVideo)) return invidiousVideo
            lastInvidiousError = IllegalStateException("Invidious returned no playable streams")
        } catch (e: retrofit2.HttpException) {
            val body = try { e.response()?.errorBody()?.string() } catch (_: Exception) { null }
            val isInvidiousBroken = e.code() == 500 && body != null && (
                body.contains("This content isn't available", ignoreCase = true) ||
                body.contains("companion", ignoreCase = true) ||
                body.contains("rate-limit", ignoreCase = true)
            )
            val isRetriable = isInvidiousBroken || e.code() == 429 || e.code() == 502 || e.code() == 503 || e.code() == 403
            if (!isRetriable) throw e
            lastInvidiousError = e
        } catch (e: Exception) {
            // Network failure talking to Invidious — try InnerTube before giving up
            lastInvidiousError = e
        }

        // --- InnerTube fallback (ANDROID client, no PO token, no decipher) ---
        try {
            val fallback = com.kvtube.tv.data.api.InnerTubeApi.getVideo(id)
            // If Invidious gave us metadata (title/channel) but no streams, merge it
            if (invidiousVideo != null && fallback.title.isBlank().not() ) {
                // Prefer Invidious metadata (more complete) + InnerTube streams
                return invidiousVideo.copy(
                    dashUrl = fallback.dashUrl ?: invidiousVideo.dashUrl,
                    hlsUrl = fallback.hlsUrl ?: invidiousVideo.hlsUrl,
                    formatStreams = if (invidiousVideo.formatStreams.isEmpty()) fallback.formatStreams else invidiousVideo.formatStreams,
                    adaptiveFormats = if (invidiousVideo.adaptiveFormats.isEmpty()) fallback.adaptiveFormats else invidiousVideo.adaptiveFormats
                ).let { merged ->
                    if (hasPlayableStreams(merged)) merged else fallback
                }
            }
            return fallback
        } catch (fallbackErr: Exception) {
            // Both failed — throw the more informative Invidious error if available
            lastInvidiousError?.let { throw it }
            throw fallbackErr
        }
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
}
