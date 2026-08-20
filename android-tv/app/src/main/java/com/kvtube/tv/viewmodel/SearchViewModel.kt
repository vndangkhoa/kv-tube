package com.kvtube.tv.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.tv.data.model.TvVideo
import com.kvtube.tv.data.repository.InvidiousRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class SearchViewModel : ViewModel() {
    private val repo = InvidiousRepository()
    private var debounce: Job? = null

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query

    private val _results = MutableStateFlow<List<TvVideo>>(emptyList())
    val results: StateFlow<List<TvVideo>> = _results

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading

    fun onQueryChange(q: String) {
        _query.value = q
        debounce?.cancel()
        if (q.isBlank()) {
            _results.value = emptyList()
            _loading.value = false
            return
        }
        debounce = viewModelScope.launch {
            delay(450)
            _loading.value = true
            _results.value = try { repo.search(q) } catch (_: Exception) { emptyList() }
            _loading.value = false
        }
    }

    fun searchNow() {
        val q = _query.value.trim()
        if (q.isBlank()) return
        debounce?.cancel()
        viewModelScope.launch {
            _loading.value = true
            _results.value = try { repo.search(q) } catch (_: Exception) { emptyList() }
            _loading.value = false
        }
    }
}
