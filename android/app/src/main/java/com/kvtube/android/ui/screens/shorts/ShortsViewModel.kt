package com.kvtube.android.ui.screens.shorts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ShortsUiState(
    val videos: List<VideoData> = emptyList(),
    val isLoading: Boolean = true
)

@HiltViewModel
class ShortsViewModel @Inject constructor(
    private val videoRepository: VideoRepository,
    private val settingsDataStore: SettingsDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(ShortsUiState())
    val uiState: StateFlow<ShortsUiState> = _uiState.asStateFlow()
    private var currentRegion: String = "GLOBAL"

    init {
        viewModelScope.launch {
            currentRegion = settingsDataStore.region.first()
            loadShorts()
        }
    }

    fun refresh() {
        loadShorts()
    }

    private fun loadShorts() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isLoading = true)
                val videos = videoRepository.search("shorts", 20, currentRegion)
                _uiState.value = ShortsUiState(
                    videos = videos,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = ShortsUiState(isLoading = false)
            }
        }
    }
}
