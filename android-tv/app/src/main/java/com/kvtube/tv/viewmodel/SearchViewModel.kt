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
    private var searchJob: Job? = null
    private var suggestionsJob: Job? = null

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query

    private val _lastSearchedQuery = MutableStateFlow("")
    val lastSearchedQuery: StateFlow<String> = _lastSearchedQuery

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
        viewModelScope.launch {
            var lastInstance = com.kvtube.tv.data.api.ApiClient.instanceFlow.value
            com.kvtube.tv.data.api.ApiClient.instanceFlow.collect { newInst ->
                if (newInst != lastInstance) {
                    lastInstance = newInst
                    keywordsRepo.refreshTrendingKeywords(force = true)
                    val q = _query.value.trim()
                    if (q.isNotBlank()) {
                        executeSearch(q)
                    }
                }
            }
        }
    }

    fun onQueryChange(q: String) {
        _query.value = q
        suggestionsJob?.cancel()

        if (q.isBlank()) {
            _lastSearchedQuery.value = ""
            _results.value = emptyList()
            _suggestions.value = emptyList()
            _loading.value = false
            return
        }

        // Fetch lightweight autocomplete suggestions with 300ms debounce
        // Notice: Full video search is NOT auto-executed while typing to keep TV remote typing fluid
        suggestionsJob = viewModelScope.launch {
            delay(300)
            _suggestions.value = keywordsRepo.getLiveSuggestions(q)
        }
    }

    fun selectKeyword(keyword: String) {
        val clean = keyword.trim()
        if (clean.isBlank()) return
        _query.value = clean
        _suggestions.value = emptyList()
        suggestionsJob?.cancel()
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            executeSearch(clean)
        }
    }

    fun searchNow() {
        val q = _query.value.trim()
        if (q.isBlank()) return
        suggestionsJob?.cancel()
        _suggestions.value = emptyList()
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            executeSearch(q)
        }
    }

    private suspend fun executeSearch(q: String) {
        val clean = q.trim()
        if (clean.isBlank()) return
        _lastSearchedQuery.value = clean
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

