package com.kvtube.tv.data.api

import com.kvtube.tv.data.model.InvidiousChannel
import com.kvtube.tv.data.model.InvidiousComment
import com.kvtube.tv.data.model.InvidiousPlaylist
import com.kvtube.tv.data.model.InvidiousVideo
import com.kvtube.tv.data.model.SearchResultItem
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface InvidiousApi {
    // --- Video ---
    @GET("api/v1/videos/{videoId}")
    suspend fun getVideo(
        @Path("videoId") videoId: String,
        @Query("region") region: String? = null,
    ): InvidiousVideo

    @GET("api/v1/comments/{videoId}")
    suspend fun getComments(
        @Path("videoId") videoId: String,
        @Query("continuation") continuation: String? = null,
        @Query("sort_by") sortBy: String? = null,
    ): CommentsResponse

    // --- Discovery / Trending ---
    @GET("api/v1/trending")
    suspend fun getTrending(
        @Query("region") region: String? = null,
        @Query("type") type: String? = null,
    ): List<InvidiousVideo>

    @GET("api/v1/popular")
    suspend fun getPopular(): List<InvidiousVideo>

    // --- Search ---
    @GET("api/v1/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("page") page: Int = 1,
        @Query("sort_by") sortBy: String = "relevance",
        @Query("type") type: String = "all",
        @Query("region") region: String? = null,
    ): List<SearchResultItem>

    @GET("api/v1/search/suggestions")
    suspend fun getSuggestions(@Query("q") query: String): SuggestionResponse

    // --- Channel ---
    @GET("api/v1/channels/{channelId}")
    suspend fun getChannel(@Path("channelId") channelId: String): InvidiousChannel

    @GET("api/v1/channels/{channelId}/videos")
    suspend fun getChannelVideos(
        @Path("channelId") channelId: String,
        @Query("continuation") continuation: String? = null,
        @Query("sort_by") sortBy: String = "newest",
    ): ChannelVideosResponse

    @GET("api/v1/channels/{channelId}/playlists")
    suspend fun getChannelPlaylists(
        @Path("channelId") channelId: String,
    ): ChannelPlaylistsResponse

    // --- Playlist ---
    @GET("api/v1/playlists/{playlistId}")
    suspend fun getPlaylist(
        @Path("playlistId") playlistId: String,
        @Query("page") page: Int = 1,
    ): InvidiousPlaylist

    // --- Auth (subscriptions/feed/history/playlists) — scoped under /api/v1/auth ---
    @GET("api/v1/auth/feed")
    suspend fun getAuthFeed(
        @Query("page") page: Int = 1,
        @Query("max_results") maxResults: Int? = null,
    ): List<InvidiousVideo>

    @GET("api/v1/auth/subscriptions")
    suspend fun getAuthSubscriptions(): List<InvidiousChannel>

    @GET("api/v1/auth/history")
    suspend fun getAuthHistory(): List<InvidiousVideo>

    @POST("api/v1/auth/history/{videoId}")
    suspend fun postAuthHistory(@Path("videoId") videoId: String)

    @DELETE("api/v1/auth/history/{videoId}")
    suspend fun deleteAuthHistory(@Path("videoId") videoId: String)

    @GET("api/v1/auth/playlists")
    suspend fun getAuthPlaylists(): List<InvidiousPlaylist>

    @GET("api/v1/stats")
    suspend fun getStats(): Map<String, Any>
}

// Lightweight response wrappers where Invidious returns envelopes
data class CommentsResponse(
    val comments: List<InvidiousComment> = emptyList(),
    val continuation: String? = null,
)

data class SuggestionResponse(
    val query: String = "",
    val suggestions: List<String> = emptyList(),
)

data class ChannelVideosResponse(
    val videos: List<InvidiousVideo> = emptyList(),
    val continuation: String? = null,
)

data class ChannelPlaylistsResponse(
    val playlists: List<InvidiousPlaylist> = emptyList(),
    val continuation: String? = null,
)
