package com.kvtube.tv.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class LatestUiState(
    val hero: List<TvVideo> = emptyList(),
    val rows: Map<String, List<TvVideo>> = emptyMap(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

class LatestViewModel : ViewModel() {
    private val repo = InvidiousRepository()
    private val _state = MutableStateFlow(LatestUiState())
    val state: StateFlow<LatestUiState> = _state

    private val defaultRegion = "VN"

    private var refreshJob: kotlinx.coroutines.Job? = null

    init {
        refresh()
        viewModelScope.launch {
            var lastInstance = com.kvtube.tv.data.api.ApiClient.instanceFlow.value
            com.kvtube.tv.data.api.ApiClient.instanceFlow.collect { newInst ->
                if (newInst != lastInstance) {
                    lastInstance = newInst
                    refresh()
                }
            }
        }
    }

    fun refresh() {
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                // Fetch genuinely latest videos across categories using upload_date and date filters
                val latest = async { repo.search("tin tức việt nam mới nhất", region = defaultRegion, sortBy = "upload_date", date = "week") }
                val music = async { repo.search("nhạc mới nhất", region = defaultRegion, sortBy = "upload_date", date = "week") }
                val gaming = async { repo.search("game việt nam mới nhất", region = defaultRegion, sortBy = "upload_date", date = "week") }
                val tech = async { repo.search("review công nghệ mới nhất", region = defaultRegion, sortBy = "upload_date", date = "month") }
                val sports = async { repo.search("bóng đá việt nam mới nhất", region = defaultRegion, sortBy = "upload_date", date = "week") }
                val comedy = async { repo.search("hài hước mới nhất", region = defaultRegion, sortBy = "upload_date", date = "month") }

                fun filterAndSort(list: List<TvVideo>): List<TvVideo> {
                    return list
                        .filter { v ->
                            val txt = v.publishedText.orEmpty()
                            // Exclude anything older than ~1-2 months or mentioning years ago
                            !txt.contains("năm trước") &&
                            !txt.contains("years ago") &&
                            !txt.contains("year ago") &&
                            !(txt.contains("tháng trước") && (txt.contains("3 ") || txt.contains("4 ") || txt.contains("5 ") || txt.contains("6 ") || txt.contains("7 ") || txt.contains("8 ") || txt.contains("9 ") || txt.contains("10 ") || txt.contains("11 ") || txt.contains("12 ")))
                        }
                        .sortedByDescending { it.published }
                }

                val l = filterAndSort(latest.await())
                val m = filterAndSort(music.await())
                val g = filterAndSort(gaming.await())
                val t = filterAndSort(tech.await())
                val s = filterAndSort(sports.await())
                val c = filterAndSort(comedy.await())

                val rows = linkedMapOf<String, List<TvVideo>>()
                if (l.isNotEmpty()) rows["Mới nhất"] = l.take(20)
                if (m.isNotEmpty()) rows["Âm nhạc mới"] = m.take(20)
                if (g.isNotEmpty()) rows["Trò chơi mới"] = g.take(20)
                if (t.isNotEmpty()) rows["Công nghệ mới"] = t.take(20)
                if (s.isNotEmpty()) rows["Thể thao mới"] = s.take(20)
                if (c.isNotEmpty()) rows["Giải trí mới"] = c.take(20)

                _state.value = LatestUiState(hero = l.take(6), rows = rows, isLoading = false)
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, error = e.message ?: "Failed to load")
            }
        }
    }
}
