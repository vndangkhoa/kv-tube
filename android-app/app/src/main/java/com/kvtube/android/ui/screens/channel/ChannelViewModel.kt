package com.kvtube.android.ui.screens.channel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.model.ChannelInfo
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.ChannelRepository
import com.kvtube.android.data.repository.SubscriptionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChannelUiState(
    val channel: ChannelInfo? = null,
    val videos: List<VideoData> = emptyList(),
    val isSubscribed: Boolean = false,
    val isLoading: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class ChannelViewModel @Inject constructor(
    private val channelRepository: ChannelRepository,
    private val subscriptionRepository: SubscriptionRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChannelUiState())
    val uiState: StateFlow<ChannelUiState> = _uiState.asStateFlow()

    fun loadChannel(channelId: String) {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true, error = null)
                val channelDeferred = async { channelRepository.getChannelWithVideos(channelId, 48) }
                val subDeferred = async { subscriptionRepository.isSubscribed(channelId) }

                var (channel, videos) = channelDeferred.await()
                val isSubscribed = subDeferred.await()

                if (channel == null && videos.isNotEmpty()) {
                    val first = videos.first()
                    channel = ChannelInfo(
                        id = channelId,
                        title = first.displayChannelTitle.ifBlank { "Channel" },
                        avatarUrl = first.channelThumbnail
                    )
                }

                if (channel != null && channel.avatarUrl.isBlank()) {
                    val fallbackAvatar = channelRepository.getChannelAvatarFallback(channelId)
                    if (!fallbackAvatar.isNullOrBlank()) {
                        channel = channel.copy(avatarUrl = fallbackAvatar)
                    }
                }

                val channelAvatar = channel?.avatarUrl.orEmpty()
                val enrichedVideos = if (channelAvatar.isNotBlank()) {
                    videos.map { video ->
                        if (video.channelThumbnail.isBlank()) video.copy(channelThumbnail = channelAvatar) else video
                    }
                } else videos

                _uiState.value = ChannelUiState(
                    channel = channel,
                    videos = enrichedVideos,
                    isSubscribed = isSubscribed,
                    isLoading = false,
                    error = if (channel == null) "Couldn't load this channel right now." else null
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load channel"
                )
            }
        }
    }

    fun toggleSubscription(channelId: String, channelName: String, channelAvatar: String) {
        viewModelScope.launch {
            try {
                if (_uiState.value.isSubscribed) {
                    subscriptionRepository.unsubscribe(channelId)
                    _uiState.value = _uiState.value.copy(isSubscribed = false)
                } else {
                    subscriptionRepository.subscribe(channelId, channelName, channelAvatar)
                    _uiState.value = _uiState.value.copy(isSubscribed = true)
                }
            } catch (_: Exception) { }
        }
    }
}
