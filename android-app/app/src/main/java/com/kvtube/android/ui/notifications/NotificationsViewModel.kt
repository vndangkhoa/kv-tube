package com.kvtube.android.ui.notifications

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.relativeRecencyMinutes
import com.kvtube.android.data.repository.SubscriptionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val TAG = "NotificationsVM"

/**
 * Powers the bell icon next to the search bar: polls the subscription feed and
 * counts videos uploaded since the last time the panel was opened. A video is
 * "new" when its relative age ("3 hours ago") is smaller than the time elapsed
 * since the user last checked — i.e. it appeared after the previous look.
 */
data class NotificationsUiState(
    val latest: List<VideoData> = emptyList(),
    val unseenIds: Set<String> = emptySet(),
    val isLoading: Boolean = false,
    val hasSubscriptionsHint: Boolean = false
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val subscriptionRepository: SubscriptionRepository,
    private val settingsDataStore: SettingsDataStore
) : ViewModel() {

    companion object {
        /** Poll cadence for the badge while the app is open. */
        private const val REFRESH_INTERVAL_MS = 5 * 60_000L
        /** Feed page pulled for the panel (newest first). */
        private const val FEED_LIMIT = 24
    }

    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    /** Consecutive refreshes that produced nothing — drives the backoff. */
    private var consecutiveEmpty = 0

    init {
        viewModelScope.launch(Dispatchers.IO) {
            while (true) {
                refresh()
                // Back off when the server keeps failing (down / unreachable):
                // 5 min → 10 → 20 → capped at ~30 min, so an outage never
                // turns into a request storm.
                val factor = 1L shl minOf(consecutiveEmpty, 3)
                delay(REFRESH_INTERVAL_MS * factor)
            }
        }
    }

    fun refresh() {
        viewModelScope.launch(Dispatchers.IO) {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val feed = try {
                subscriptionRepository.getFeed(pageSize = FEED_LIMIT)
            } catch (e: Exception) {
                Log.w(TAG, "Notification feed refresh failed: ${e.message}")
                emptyList()
            }

            if (feed.isEmpty()) {
                consecutiveEmpty++
                _uiState.value = _uiState.value.copy(
                    latest = _uiState.value.latest,
                    unseenIds = _uiState.value.unseenIds,
                    isLoading = false,
                    hasSubscriptionsHint = consecutiveEmpty == 1
                )
                return@launch
            }
            consecutiveEmpty = 0

            val lastSeen = settingsDataStore.lastSubscriptionSeenMillis.first()
            val elapsedMinutes =
                ((System.currentTimeMillis() - lastSeen) / 60_000L).coerceAtLeast(0L)

            // A video is unseen when it was uploaded after the previous check.
            // Items without any age label can't be classified — skip them so a
            // live stream never keeps the badge lit forever.
            val unseen = feed.filter { video ->
                val age = video.published.orEmpty().relativeRecencyMinutes()
                video.published.isNotBlank() && age in 1 until elapsedMinutes.coerceAtLeast(1L)
            }.map { it.id }.toSet()

            _uiState.value = _uiState.value.copy(
                latest = feed,
                unseenIds = unseen,
                isLoading = false,
                hasSubscriptionsHint = false
            )
        }
    }

    /** Called when the panel is opened — everything visible becomes seen. */
    fun markAllSeen() {
        viewModelScope.launch(Dispatchers.IO) {
            settingsDataStore.setLastSubscriptionSeenMillis(System.currentTimeMillis())
            _uiState.value = _uiState.value.copy(unseenIds = emptySet())
        }
    }
}
