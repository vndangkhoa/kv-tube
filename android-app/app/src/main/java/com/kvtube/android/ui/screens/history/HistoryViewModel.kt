package com.kvtube.android.ui.screens.history

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

@HiltViewModel
class HistoryViewModel @Inject constructor(
    private val historyRepository: HistoryRepository
) : ViewModel() {

    private val _history = MutableStateFlow<List<VideoData>>(emptyList())
    val history: StateFlow<List<VideoData>> = _history.asStateFlow()

    init {
        viewModelScope.launch {
            historyRepository.observeAll().collect { videos ->
                _history.value = videos
            }
        }
    }

    fun remove(videoId: String) {
        viewModelScope.launch { historyRepository.remove(videoId) }
    }

    fun clearAll() {
        viewModelScope.launch { historyRepository.clearAll() }
    }
}
