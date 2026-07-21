package com.kvtube.android.ui.screens.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.HistoryRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LibraryUiState(
    val history: List<VideoData> = emptyList(),
    val liked: List<VideoData> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val historyRepository: HistoryRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LibraryUiState())
    val uiState: StateFlow<LibraryUiState> = _uiState.asStateFlow()

    init {
        loadLibrary()
    }

    fun refresh() {
        loadLibrary()
    }

    private fun loadLibrary() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            val history = try {
                historyRepository.getHistory(20)
            } catch (e: Exception) {
                emptyList()
            }

            val liked = try {
                historyRepository.getLiked(20)
            } catch (e: Exception) {
                emptyList()
            }

            _uiState.value = LibraryUiState(
                history = history,
                liked = liked,
                isLoading = false,
                error = if (history.isEmpty() && liked.isEmpty()) "Failed to load library" else null
            )
        }
    }
}
