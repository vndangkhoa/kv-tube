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
                _uiState.value = _uiState.value.copy(isLoading = true)
                val channelDeferred = async { channelRepository.getChannelInfo(channelId) }
                val videosDeferred = async { channelRepository.getChannelVideos(channelId, 48) }
                val subDeferred = async { subscriptionRepository.isSubscribed(channelId) }

                var channel = channelDeferred.await()
                val videos = videosDeferred.await()
                val isSubscribed = subDeferred.await()

                if (channel != null && channel.avatarUrl.isNullOrBlank()) {
                    val fallbackAvatar = channelRepository.getChannelAvatarFallback(channelId)
                    if (!fallbackAvatar.isNullOrBlank()) {
                        channel = channel.copy(avatarUrl = fallbackAvatar)
                    }
                }

                _uiState.value = ChannelUiState(
                    channel = channel,
                    videos = videos,
                    isSubscribed = isSubscribed,
                    isLoading = false
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
