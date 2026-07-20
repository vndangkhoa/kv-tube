package com.kvtube.android.ui.screens.downloads

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.DownloadedVideoEntity
import com.kvtube.android.data.model.DownloadProgress
import com.kvtube.android.data.model.SortCriteria
import com.kvtube.android.data.repository.DownloadRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

data class DownloadsUiState(
    val downloads: List<DownloadedVideoEntity> = emptyList(),
    val searchQuery: String = "",
    val sortCriteria: SortCriteria = SortCriteria.DATE,
    val sortAscending: Boolean = false,
    val isLoading: Boolean = true,
    val isGridView: Boolean = false,
    val activeProgress: Map<String, DownloadProgress> = emptyMap(),
    val videoToDelete: DownloadedVideoEntity? = null,
    val videoToRename: DownloadedVideoEntity? = null
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class DownloadsViewModel @Inject constructor(
    private val downloadRepository: DownloadRepository
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    private val _sortCriteria = MutableStateFlow(SortCriteria.DATE)
    private val _sortAscending = MutableStateFlow(false)
    private val _isGridView = MutableStateFlow(false)

    private val _uiState = MutableStateFlow(DownloadsUiState())
    val uiState: StateFlow<DownloadsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            // Combine the 5 non-progress flows first
            combine(
                downloadRepository.getAllDownloads(),
                _searchQuery,
                _sortCriteria,
                _sortAscending,
                _isGridView
            ) { downloads, query, sort, asc, grid ->
                val filtered = if (query.isBlank()) downloads
                else downloads.filter {
                    it.title.contains(query, ignoreCase = true) ||
                            it.channelTitle.contains(query, ignoreCase = true)
                }
                DownloadsUiState(
                    downloads = filtered,
                    searchQuery = query,
                    sortCriteria = sort,
                    sortAscending = asc,
                    isLoading = false,
                    isGridView = grid
                )
            }
            // Then combine with the active downloads progress (6th flow)
            .combine(downloadRepository.activeDownloads) { state, progress ->
                state.copy(activeProgress = progress)
            }
            .collect { state ->
                _uiState.value = state
            }
        }
    }

    fun onSearchQueryChanged(query: String) {
        _searchQuery.value = query
    }

    fun onSortChanged(criteria: SortCriteria) {
        if (_sortCriteria.value == criteria) {
            _sortAscending.value = !_sortAscending.value
        } else {
            _sortCriteria.value = criteria
            _sortAscending.value = false
        }
    }

    fun toggleViewMode() {
        _isGridView.value = !_isGridView.value
    }

    fun deleteVideo(videoId: String) {
        viewModelScope.launch {
            downloadRepository.deleteByVideoId(videoId)
            _uiState.value = _uiState.value.copy(videoToDelete = null)
        }
    }

    fun showDeleteConfirmation(video: DownloadedVideoEntity) {
        _uiState.value = _uiState.value.copy(videoToDelete = video)
    }

    fun dismissDeleteConfirmation() {
        _uiState.value = _uiState.value.copy(videoToDelete = null)
    }

    fun showRenameDialog(video: DownloadedVideoEntity) {
        _uiState.value = _uiState.value.copy(videoToRename = video)
    }

    fun dismissRenameDialog() {
        _uiState.value = _uiState.value.copy(videoToRename = null)
    }

    fun renameVideo(videoId: String, newName: String) {
        viewModelScope.launch {
            downloadRepository.renameDownload(videoId, newName)
            _uiState.value = _uiState.value.copy(videoToRename = null)
        }
    }

    fun playVideo(context: Context, video: DownloadedVideoEntity) {
        val file = File(video.filePath)
        if (!file.exists()) return

        val uri = if (android.os.Build.VERSION.SDK_INT >= 24) {
            FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )
        } else {
            Uri.fromFile(file)
        }

        val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "video/mp4")
            addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        if (intent.resolveActivity(context.packageManager) != null) {
            context.startActivity(intent)
        }
    }
}
