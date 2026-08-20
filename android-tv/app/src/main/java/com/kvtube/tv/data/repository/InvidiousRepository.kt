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

    // Let HTTP errors propagate so DetailScreen can show the real Invidious error body (403 age-restricted, 429 rate-limit, 500 companion).
    suspend fun video(videoId: String): InvidiousVideo = api.getVideo(videoId.trim())

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
