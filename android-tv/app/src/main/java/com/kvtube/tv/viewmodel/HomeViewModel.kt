package com.kvtube.tv.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class HomeUiState(
    val hero: List<TvVideo> = emptyList(),
    val rows: Map<String, List<TvVideo>> = emptyMap(),
    val filtered: List<TvVideo> = emptyList(),
    val filterLabel: String? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
)

class HomeViewModel : ViewModel() {
    private val repo = InvidiousRepository()

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    // Default region wired to VN — mirrors frontend regionContent.ts + docker-compose NEXT_PUBLIC_DEFAULT_REGION=VN
    private val defaultRegion = "VN"
    // VN-localized queries from regionContent.ts → VN.categories (verified to return 20 VN videos each)
    private val categoryQueries = mapOf(
        "Music" to com.kvtube.tv.data.VnRegionContent.queryFor("Music"),
        "Gaming" to com.kvtube.tv.data.VnRegionContent.queryFor("Gaming"),
        "Movies" to com.kvtube.tv.data.VnRegionContent.queryFor("Movies"),
        "News" to com.kvtube.tv.data.VnRegionContent.queryFor("News"),
        "Tech" to com.kvtube.tv.data.VnRegionContent.queryFor("Tech"),
        "Coding" to com.kvtube.tv.data.VnRegionContent.queryFor("Coding"),
        "Sports" to com.kvtube.tv.data.VnRegionContent.queryFor("Sports"),
        "Live" to com.kvtube.tv.data.VnRegionContent.queryFor("Live"),
        "Comedy" to com.kvtube.tv.data.VnRegionContent.queryFor("Comedy"),
        "Food" to com.kvtube.tv.data.VnRegionContent.queryFor("Food"),
        "Travel" to com.kvtube.tv.data.VnRegionContent.queryFor("Travel"),
    )

    init { load() }

    fun load(isRefresh: Boolean = false) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                // Fetch fresh data
                val popular = async { repo.popular() }
                val music = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("Music"), region = defaultRegion, page = (1..3).random()) }
                val gaming = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("Gaming"), region = defaultRegion, page = (1..2).random()) }
                val movies = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("Movies"), region = defaultRegion) }
                val news = async { repo.search(com.kvtube.tv.data.VnRegionContent.queryFor("News"), region = defaultRegion) }

                val p = popular.await().shuffled()
                val m = music.await().shuffled()
                val g = gaming.await().shuffled()
                val mv = movies.await().shuffled()
                val n = news.await().shuffled()

                val hero = (p + m).distinctBy { it.id }.take(6)
                val rows = linkedMapOf<String, List<TvVideo>>()
                if (m.isNotEmpty()) rows["Nhạc"] = m.take(18)
                if (g.isNotEmpty()) rows["Gaming VN"] = g.take(18)
                if (mv.isNotEmpty()) rows["Phim & Trailer"] = mv.take(18)
                if (n.isNotEmpty()) rows["Tin tức"] = n.take(18)
                if (p.isNotEmpty()) rows["Popular"] = p.take(18)

                val extra = coroutineScopeExtraRows()
                extra.forEach { (k, v) -> if (v.isNotEmpty()) rows[k] = v }

                _state.value = HomeUiState(hero = hero, rows = rows, isLoading = false)
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, error = e.message ?: "Failed to load")
            }
        }
    }

    private suspend fun coroutineScopeExtraRows(): Map<String, List<TvVideo>> {
        return try {
            kotlinx.coroutines.coroutineScope {
                val jobs = categoryQueries
                    .filterKeys { it !in setOf("Music", "Gaming", "Movies", "News") }
                    .map { (label, q) ->
                        async {
                            val list = try { repo.search(q, region = defaultRegion) } catch (_: Exception) { emptyList() }
                            val title = when (label) {
                                "Tech" -> "Công nghệ"
                                "Coding" -> "Lập trình"
                                "Sports" -> "Bóng đá"
                                "Live" -> "Trực tiếp"
                                "Comedy" -> "Giải trí"
                                "Food" -> "Ẩm thực"
                                "Travel" -> "Du lịch"
                                else -> label
                            }
                            title to list.take(18)
                        }
                    }
                jobs.awaitAll().toMap().filterValues { it.isNotEmpty() }
            }
        } catch (_: Exception) { emptyMap() }
    }

    fun refresh() {
        load(isRefresh = true)
    }

    fun filterBy(category: String) {
        if (category == "All") {
            _state.value = _state.value.copy(filterLabel = null, filtered = emptyList())
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, filterLabel = category)
            val q = categoryQueries[category] ?: category
            // Fetch fresh pages
            val page1 = try { repo.search(q, region = defaultRegion, page = 1) } catch (_: Exception) { emptyList() }
            val page2 = try { repo.search(q, region = defaultRegion, page = (2..5).random()) } catch (_: Exception) { emptyList() }
            val page3 = try { repo.search(q, region = defaultRegion, page = (6..10).random()) } catch (_: Exception) { emptyList() }
            val merged = (page1 + page2 + page3).distinctBy { it.id }.shuffled().take(60)
            _state.value = _state.value.copy(isLoading = false, filterLabel = category, filtered = merged)
        }
    }

    fun clearFilter() {
        _state.value = _state.value.copy(filterLabel = null, filtered = emptyList())
    }
}
