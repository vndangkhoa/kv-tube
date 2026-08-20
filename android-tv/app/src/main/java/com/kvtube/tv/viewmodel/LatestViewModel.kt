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

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                // Fetch latest videos across categories using upload_date sorting
                val latest = async { repo.search("", region = defaultRegion, sortBy = "upload_date", page = (1..3).random()) }
                val music = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("Music"), region = defaultRegion, sortBy = "upload_date", page = (1..2).random()) }
                val gaming = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("Gaming"), region = defaultRegion, sortBy = "upload_date") }
                val tech = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("Tech"), region = defaultRegion, sortBy = "upload_date") }
                val comedy = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("Comedy"), region = defaultRegion, sortBy = "upload_date") }
                val sports = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("Sports"), region = defaultRegion, sortBy = "upload_date") }

                val l = latest.await().shuffled()
                val m = music.await().shuffled()
                val g = gaming.await().shuffled()
                val t = tech.await().shuffled()
                val c = comedy.await().shuffled()
                val s = sports.await().shuffled()

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
