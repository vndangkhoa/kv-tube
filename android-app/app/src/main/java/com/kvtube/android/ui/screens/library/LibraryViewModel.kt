package com.kvtube.android.ui.screens.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.HistoryRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LibraryUiState(
    val history: List<VideoData> = emptyList(),
    val serverDomain: String = "",
    val hasToken: Boolean = false,
    val isLoading: Boolean = true
)

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val historyRepository: HistoryRepository,
    private val settingsDataStore: SettingsDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(LibraryUiState())
    val uiState: StateFlow<LibraryUiState> = _uiState.asStateFlow()

    init {
        // Live observation: history and settings update instantly
        viewModelScope.launch {
            combine(
                historyRepository.observeAll(),
                settingsDataStore.serverUrl,
                settingsDataStore.invidiousToken
            ) { videos, serverUrl, token ->
                val domain = serverUrl.trim()
                    .removePrefix("https://")
                    .removePrefix("http://")
                    .trimEnd('/')
                LibraryUiState(
                    history = videos.take(20),
                    serverDomain = domain,
                    hasToken = token.isNotBlank(),
                    isLoading = false
                )
            }.collect { state ->
                _uiState.value = state
            }
        }
    }
}
