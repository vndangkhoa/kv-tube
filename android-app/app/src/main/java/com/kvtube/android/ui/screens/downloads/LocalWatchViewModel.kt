package com.kvtube.android.ui.screens.downloads

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.DownloadedVideoDao
import com.kvtube.android.data.local.DownloadedVideoEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LocalWatchUiState(
    val video: DownloadedVideoEntity? = null,
    val isLoading: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class LocalWatchViewModel @Inject constructor(
    private val downloadDao: DownloadedVideoDao
) : ViewModel() {

    private val _uiState = MutableStateFlow(LocalWatchUiState())
    val uiState: StateFlow<LocalWatchUiState> = _uiState.asStateFlow()

    fun loadVideo(videoId: String) {
        viewModelScope.launch {
            try {
                _uiState.value = LocalWatchUiState(isLoading = true)
                val video = downloadDao.getByVideoId(videoId)
                if (video != null) {
                    _uiState.value = LocalWatchUiState(video = video, isLoading = false)
                } else {
                    _uiState.value = LocalWatchUiState(
                        isLoading = false,
                        error = "Video not found in downloads"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = LocalWatchUiState(
                    isLoading = false,
                    error = e.message ?: "Failed to load video"
                )
            }
        }
    }
}
