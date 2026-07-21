package com.kvtube.android.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val videos: List<VideoData> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val selectedCategory: String = "All",
    val hasMore: Boolean = true,
    val currentRegion: String = "GLOBAL"
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val videoRepository: VideoRepository,
    private val settingsDataStore: SettingsDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var currentPage = 0
    private var currentRegion = "GLOBAL"
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            settingsDataStore.region
                .distinctUntilChanged()
                .drop(1)
                .collect { region ->
                    currentRegion = region
                    currentPage = 0
                    _uiState.value = _uiState.value.copy(
                        currentRegion = region,
                        videos = emptyList(),
                        isLoading = true,
                        hasMore = true
                    )
                    loadVideos()
                }
        }

        viewModelScope.launch {
            val region = settingsDataStore.region.first()
            currentRegion = region
            _uiState.value = _uiState.value.copy(currentRegion = region)
            loadVideos()
        }
    }

    fun setRegion(region: String) {
        currentRegion = region
        selectCategory(_uiState.value.selectedCategory)
    }

    fun selectCategory(category: String) {
        if (_uiState.value.selectedCategory == category) return
        _uiState.value = _uiState.value.copy(
            selectedCategory = category,
            videos = emptyList(),
            isLoading = true,
            hasMore = true
        )
        currentPage = 0
        loadVideos()
    }

    fun loadMore() {
        if (_uiState.value.isLoadingMore || !_uiState.value.hasMore) return
        _uiState.value = _uiState.value.copy(isLoadingMore = true)
        currentPage++
        loadVideos()
    }

    fun refresh() {
        _uiState.value = _uiState.value.copy(isLoading = true, hasMore = true)
        currentPage = 0
        loadVideos()
    }

    private fun loadVideos() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val category = _uiState.value.selectedCategory
                val videos = if (category == "All" || category == "Trending") {
                    videoRepository.trending(20, currentRegion)
                } else {
                    videoRepository.search(category, 20, currentRegion)
                }

                val currentVideos = _uiState.value.videos
                _uiState.value = _uiState.value.copy(
                    videos = if (currentPage == 0) videos else currentVideos + videos,
                    isLoading = false,
                    isLoadingMore = false,
                    error = null,
                    hasMore = videos.size >= 20
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isLoadingMore = false,
                    error = e.message ?: "Failed to load videos"
                )
            }
        }
    }
}
