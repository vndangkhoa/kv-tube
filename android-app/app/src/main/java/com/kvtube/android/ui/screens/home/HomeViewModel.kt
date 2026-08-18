package com.kvtube.android.ui.screens.home

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
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

    companion object {
        private const val TAG = "HomeViewModel"
    }

    private val _uiState = MutableStateFlow(HomeUiState(isLoading = true))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var currentPage = 0
    private var currentRegion = "GLOBAL"
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            settingsDataStore.region
                .distinctUntilChanged()
                .collect { region ->
                    currentRegion = region
                    currentPage = 0
                    _uiState.value = _uiState.value.copy(
                        currentRegion = region,
                        isLoading = true,
                        hasMore = true,
                        error = null
                    )
                    loadVideos()
                }
        }
    }

    fun setRegion(region: String) {
        currentRegion = region
        selectCategory(_uiState.value.selectedCategory)
    }

    fun selectCategory(category: String) {
        if (_uiState.value.selectedCategory == category && _uiState.value.videos.isNotEmpty()) return
        _uiState.value = _uiState.value.copy(
            selectedCategory = category,
            videos = emptyList(),
            isLoading = true,
            hasMore = true,
            error = null
        )
        currentPage = 0
        loadVideos()
    }

    fun loadMore() {
        if (_uiState.value.isLoadingMore || !_uiState.value.hasMore || _uiState.value.isLoading) return
        _uiState.value = _uiState.value.copy(isLoadingMore = true)
        currentPage++
        loadVideos()
    }

    fun refresh() {
        _uiState.value = _uiState.value.copy(isLoading = true, hasMore = true, error = null)
        currentPage = 0
        loadVideos()
    }

    private fun loadVideos() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val category = _uiState.value.selectedCategory
                val offset = currentPage * 30

                val fetchedVideos = if (category == "All") {
                    videoRepository.getHomeFeed(limit = 30, offset = offset, region = currentRegion)
                } else if (category == "Trending") {
                    videoRepository.getTrending(limit = 30, region = currentRegion)
                } else {
                    val query = getCategoryQuery(currentRegion, category)
                    videoRepository.search(query, limit = 30, region = currentRegion)
                }

                val currentVideos = if (currentPage == 0) emptyList() else _uiState.value.videos
                val combined = (currentVideos + fetchedVideos).distinctBy { it.id }

                _uiState.value = _uiState.value.copy(
                    videos = combined,
                    isLoading = false,
                    isLoadingMore = false,
                    error = if (combined.isEmpty()) "No videos found. Pull down to refresh." else null,
                    hasMore = fetchedVideos.isNotEmpty()
                )
            } catch (e: CancellationException) {
                // Ignore coroutine cancellation, do not report as error
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Error loading videos: ${e.message}", e)
                val hasVideos = _uiState.value.videos.isNotEmpty()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isLoadingMore = false,
                    error = if (!hasVideos) "Unable to load videos. Tap to retry." else null
                )
            }
        }
    }

    private fun getCategoryQuery(regionCode: String, category: String): String {
        return when (category) {
            "Music" -> if (regionCode == "VN") "nhạc trẻ mới nhất 2026" else "music 2026 trending"
            "Gaming" -> if (regionCode == "VN") "gaming việt nam" else "gaming gameplay 2026"
            "News" -> if (regionCode == "VN") "tin tức 24h" else "news today"
            "Sports" -> if (regionCode == "VN") "bóng đá việt nam" else "sports highlights"
            "Live" -> "live stream"
            "Education" -> "educational video tutorial"
            "Comedy" -> if (regionCode == "VN") "phim hài việt nam" else "comedy sketch funny"
            "Tech" -> "tech review gadget 2026"
            "Food" -> if (regionCode == "VN") "món ăn ngon ẩm thực" else "cooking recipe"
            "Travel" -> "travel vlog 4k"
            "Fashion" -> "fashion style"
            "Science" -> "science documentary"
            else -> category
        }
    }
}
