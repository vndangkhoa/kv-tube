package com.kvtube.android.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.model.DownloadStatus
import com.kvtube.android.data.repository.VideoRepository
import com.kvtube.android.data.repository.DownloadRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SearchUiState(
    val query: String = "",
    val results: List<VideoData> = emptyList(),
    val isLoading: Boolean = false,
    val hasSearched: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val videoRepository: VideoRepository,
    private val settingsDataStore: SettingsDataStore,
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    val activeDownloadsCount: StateFlow<Int> = downloadRepository.activeDownloads
        .map { progressMap ->
            progressMap.values.count { 
                it.status != DownloadStatus.COMPLETED && 
                it.status != DownloadStatus.CANCELLED &&
                it.status != DownloadStatus.ERROR 
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = 0
        )

    private var searchJob: Job? = null
    private var lastCompletedQuery: String = ""

    fun onQueryChanged(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        searchJob?.cancel()
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            lastCompletedQuery = ""
            _uiState.value = _uiState.value.copy(
                results = emptyList(),
                isLoading = false,
                hasSearched = false,
                error = null
            )
            return
        }
        if (trimmed == lastCompletedQuery && _uiState.value.results.isNotEmpty() && _uiState.value.error == null) {
            return
        }
        searchJob = viewModelScope.launch {
            delay(400)
            searchInternal(trimmed)
        }
    }

    fun searchImmediate(query: String) {
        searchJob?.cancel()
        _uiState.value = _uiState.value.copy(query = query)
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            lastCompletedQuery = ""
            _uiState.value = _uiState.value.copy(
                results = emptyList(),
                isLoading = false,
                hasSearched = false,
                error = null
            )
            return
        }
        searchJob = viewModelScope.launch {
            searchInternal(trimmed)
        }
    }

    fun retry() {
        searchImmediate(_uiState.value.query)
    }

    private suspend fun searchInternal(query: String) {
        if (query.isBlank()) return
        try {
            _uiState.value = _uiState.value.copy(isLoading = true, hasSearched = true, error = null)
            val region = settingsDataStore.region.first()
            val results = videoRepository.search(query, 30, region)
            lastCompletedQuery = query
            _uiState.value = _uiState.value.copy(
                results = results,
                isLoading = false,
                error = null
            )
        } catch (e: kotlinx.coroutines.CancellationException) {
            // Typing fast / re-searching cancels the previous request — that is
            // normal flow control, never an error worth showing in red.
            throw e
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = e.message ?: "Search failed"
            )
        }
    }
}
