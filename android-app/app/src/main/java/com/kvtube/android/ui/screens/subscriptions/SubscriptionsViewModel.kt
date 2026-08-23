package com.kvtube.android.ui.screens.subscriptions

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.model.Subscription
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.SubscriptionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

private const val TAG = "SubscriptionsVM"

data class SubscriptionsUiState(
    val subscriptions: List<Subscription> = emptyList(),
    val feedVideos: List<VideoData> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class SubscriptionsViewModel @Inject constructor(
    private val subscriptionRepository: SubscriptionRepository,
    private val api: KVApi
) : ViewModel() {

    private val _uiState = MutableStateFlow(SubscriptionsUiState())
    val uiState: StateFlow<SubscriptionsUiState> = _uiState.asStateFlow()

    fun refresh() {
        loadData()
    }

    /** Appends the next page of the subscription feed ("Show more videos"). */
    fun loadMore() {
        val state = _uiState.value
        if (state.isLoading || state.isLoadingMore || !state.hasMore || state.feedVideos.isEmpty()) return

        _uiState.value = state.copy(isLoadingMore = true)
        viewModelScope.launch(Dispatchers.IO) {
            val more = try {
                subscriptionRepository.getFeed(offset = state.feedVideos.size)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load more feed", e)
                emptyList()
            }
            val combined = (state.feedVideos + more).distinctBy { it.id }
            _uiState.value = _uiState.value.copy(
                feedVideos = combined,
                isLoadingMore = false,
                hasMore = more.isNotEmpty()
            )
        }
    }

    private fun loadData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null, hasMore = true, isLoadingMore = false)

            // Load subs and feed in parallel
            val subsDeferred = async(Dispatchers.IO) {
                try {
                    subscriptionRepository.getSubscriptions()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to load subscriptions", e)
                    emptyList()
                }
            }

            val feedDeferred = async(Dispatchers.IO) {
                try {
                    subscriptionRepository.getFeed()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to load feed", e)
                    emptyList()
                }
            }

            val subs = subsDeferred.await()
            val feed = feedDeferred.await()

            // Show data immediately without avatars
            val sortedSubs = subs.sortedBy { it.channelName }

            _uiState.value = SubscriptionsUiState(
                subscriptions = sortedSubs,
                feedVideos = feed,
                isLoading = false,
                hasMore = feed.isNotEmpty(),
                error = if (sortedSubs.isEmpty() && feed.isEmpty()) {
                    "No subscriptions found"
                } else null
            )

            // Fetch avatars for first 20 visible channels only
            launch(Dispatchers.IO) {
                val visibleSubs = sortedSubs.take(20)
                val missingIds = visibleSubs.filter { it.channelAvatar.isBlank() }.map { it.channelId }
                if (missingIds.isEmpty()) return@launch

                val batchSize = 3
                val allAvatars = mutableMapOf<String, String>()

                missingIds.chunked(batchSize).forEach { batch ->
                    try {
                        val idsStr = batch.joinToString(",")
                        val result = api.getChannelAvatars(idsStr)
                        result.forEach { (id, info) ->
                            if (!info.avatarUrl.isNullOrBlank()) {
                                allAvatars[id] = info.avatarUrl
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Avatar batch failed for ${batch.size} ids", e)
                    }

                    // Update UI after each batch
                    val updatedSubs = sortedSubs.map { sub ->
                        if (sub.channelAvatar.isBlank()) {
                            val url = allAvatars[sub.channelId]
                            if (url != null) sub.copy(channelAvatar = url) else sub
                        } else sub
                    }
                    _uiState.value = _uiState.value.copy(subscriptions = updatedSubs.sortedBy { it.channelName })
                }

                Log.d(TAG, "Fetched ${allAvatars.size} avatars total")
            }
        }
    }
}
