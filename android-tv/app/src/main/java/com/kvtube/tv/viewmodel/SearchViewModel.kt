package com.kvtube.tv.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import com.kvtube.tv.data.repository.TvTrendingKeywordsRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SearchViewModel : ViewModel() {
    private val repo = InvidiousRepository()
    private val keywordsRepo = TvTrendingKeywordsRepository.getInstance()
    private var debounce: Job? = null
    private var suggestionsJob: Job? = null

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query

    private val _results = MutableStateFlow<List<TvVideo>>(emptyList())
    val results: StateFlow<List<TvVideo>> = _results

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading

    private val _suggestions = MutableStateFlow<List<String>>(emptyList())
    val suggestions: StateFlow<List<String>> = _suggestions

    val trendingKeywords: StateFlow<List<String>> = keywordsRepo.trendingKeywords
    val recentSearches: StateFlow<List<String>> = keywordsRepo.recentSearchesFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val topicCategories: Map<String, List<String>> = TvTrendingKeywordsRepository.VN_TOPIC_CATEGORIES

    init {
        viewModelScope.launch {
            keywordsRepo.refreshTrendingKeywords(force = false)
        }
    }

    fun onQueryChange(q: String) {
        _query.value = q
        debounce?.cancel()
        suggestionsJob?.cancel()

        if (q.isBlank()) {
            _results.value = emptyList()
            _suggestions.value = emptyList()
            _loading.value = false
            return
        }

        suggestionsJob = viewModelScope.launch {
            delay(200)
            _suggestions.value = keywordsRepo.getLiveSuggestions(q)
        }

        debounce = viewModelScope.launch {
            delay(500)
            executeSearch(q)
        }
    }

    fun selectKeyword(keyword: String) {
        val clean = keyword.trim()
        if (clean.isBlank()) return
        _query.value = clean
        _suggestions.value = emptyList()
        debounce?.cancel()
        suggestionsJob?.cancel()
        viewModelScope.launch {
            executeSearch(clean)
        }
    }

    fun searchNow() {
        val q = _query.value.trim()
        if (q.isBlank()) return
        debounce?.cancel()
        suggestionsJob?.cancel()
        _suggestions.value = emptyList()
        viewModelScope.launch {
            executeSearch(q)
        }
    }

    private suspend fun executeSearch(q: String) {
        val clean = q.trim()
        if (clean.isBlank()) return
        _loading.value = true
        keywordsRepo.addRecentSearch(clean)
        _results.value = try { repo.search(clean) } catch (_: Exception) { emptyList() }
        _loading.value = false
    }

    fun clearRecentSearches() {
        viewModelScope.launch {
            keywordsRepo.clearRecentSearches()
        }
    }

    fun removeRecentSearch(item: String) {
        viewModelScope.launch {
            keywordsRepo.removeRecentSearch(item)
        }
    }

    fun refreshTrending() {
        viewModelScope.launch {
            keywordsRepo.refreshTrendingKeywords(force = true)
        }
    }
}

