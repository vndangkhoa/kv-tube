package com.kvtube.android.ui.screens.home

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import com.kvtube.android.data.sortedLatestFirst
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import javax.inject.Inject

@Serializable
data class CategorySection(
    val category: String,
    val videos: List<VideoData>
)

@Serializable
private data class CachedHomeSnapshot(
    val serverUrl: String,
    val region: String,
    val savedAtMs: Long,
    val sections: List<CategorySection>,
    val categoryFeeds: Map<String, List<VideoData>> = emptyMap()
)

data class HomeUiState(
    val videos: List<VideoData> = emptyList(),
    val categorySections: List<CategorySection> = emptyList(),
    val smartSuggestions: List<VideoData> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val selectedCategory: String = "All",
    val hasMore: Boolean = true,
    val currentRegion: String = "GLOBAL"
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val videoRepository: VideoRepository,
    private val settingsDataStore: SettingsDataStore,
    private val json: Json
) : ViewModel() {

    companion object {
        private const val TAG = "HomeViewModel"
        const val VIDEO_BATCH_SIZE = 12
        const val CATEGORY_BATCH_SIZE = 3
        const val SHELF_VIDEO_LIMIT = 12

        val HOME_SHOWCASE_CATEGORIES = listOf(
            "Trending", "Music", "Gaming", "News", "Sports",
            "Tech", "Comedy", "Education", "Food", "Travel",
            "Fashion", "Science", "Live"
        )
    }

    private data class QuerySpec(
        val query: String,
        val sortBy: String?,
        val date: String?,
        val features: String? = null
    )

    private val _uiState = MutableStateFlow(HomeUiState(isLoading = true))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var currentRegion = "GLOBAL"
    private var currentServerUrl = ""
    private var loadJob: Job? = null

    private val seenVideoIds = LinkedHashSet<String>()
    private val pendingVideos = ArrayDeque<VideoData>()
    private var nextCategoryIndex = 0
    private var queryStage = 0
    private var nextPage = 1

    private val categoryFeedCache = LinkedHashMap<String, List<VideoData>>()
    private var cachedAllSections: List<CategorySection> = emptyList()
    private var allFeedFreshInSession = false
    private val snapshotFile by lazy { File(context.cacheDir, "home_feed_snapshot_v1.json") }

    init {
        viewModelScope.launch {
            combine(
                settingsDataStore.region.distinctUntilChanged(),
                settingsDataStore.serverUrl.distinctUntilChanged()
            ) { region, serverUrl ->
                region to KVApi.normalizeUrl(serverUrl)
            }.collect { (region, serverUrl) ->
                val envChanged = currentRegion != region || currentServerUrl != serverUrl
                currentRegion = region
                currentServerUrl = serverUrl
                if (envChanged) {
                    categoryFeedCache.clear()
                    cachedAllSections = emptyList()
                    allFeedFreshInSession = false
                    hydrateFromDiskCache(serverUrl, region)
                }
                val hasCachedContent = cachedAllSections.isNotEmpty() || categoryFeedCache.isNotEmpty()
                loadInitial(
                    category = _uiState.value.selectedCategory,
                    clearExisting = !hasCachedContent
                )
            }
        }
    }

    private suspend fun hydrateFromDiskCache(serverUrl: String, region: String) {
        if (serverUrl.isBlank()) return
        val snapshot = withContext(Dispatchers.IO) {
            runCatching {
                if (!snapshotFile.exists()) return@runCatching null
                json.decodeFromString<CachedHomeSnapshot>(snapshotFile.readText())
            }.getOrNull()
        } ?: return

        if (snapshot.serverUrl != serverUrl || snapshot.region != region || snapshot.sections.isEmpty()) {
            return
        }

        cachedAllSections = snapshot.sections
        snapshot.sections.forEach { sec ->
            categoryFeedCache[sec.category] = sec.videos
            videoRepository.seedCache(sec.videos)
        }
        snapshot.categoryFeeds.forEach { (cat, vids) ->
            if (vids.isNotEmpty()) {
                categoryFeedCache[cat] = vids
                videoRepository.seedCache(vids)
            }
        }

        val activeCategory = _uiState.value.selectedCategory
        if (activeCategory == "All") {
            _uiState.value = _uiState.value.copy(
                currentRegion = region,
                categorySections = snapshot.sections,
                isLoading = false,
                error = null
            )
        } else {
            val cachedCat = categoryFeedCache[activeCategory]
            if (!cachedCat.isNullOrEmpty()) {
                _uiState.value = _uiState.value.copy(
                    currentRegion = region,
                    videos = cachedCat,
                    isLoading = false,
                    error = null
                )
            }
        }
    }

    private fun persistHomeSnapshot() {
        val server = currentServerUrl
        val region = currentRegion
        val sectionsCopy = cachedAllSections.toList()
        val feedsCopy = categoryFeedCache.toMap()
        if (server.isBlank() || sectionsCopy.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val payload = CachedHomeSnapshot(
                    serverUrl = server,
                    region = region,
                    savedAtMs = System.currentTimeMillis(),
                    sections = sectionsCopy,
                    categoryFeeds = feedsCopy
                )
                snapshotFile.writeText(json.encodeToString(payload))
            }
        }
    }

    fun setRegion(region: String) {
        currentRegion = region
        categoryFeedCache.clear()
        cachedAllSections = emptyList()
        allFeedFreshInSession = false
        loadInitial(category = _uiState.value.selectedCategory, clearExisting = true)
    }

    fun selectCategory(category: String) {
        val state = _uiState.value
        val hasContent = state.videos.isNotEmpty() || state.categorySections.isNotEmpty()
        if (state.selectedCategory == category && hasContent) return

        if (category == "All" && cachedAllSections.isNotEmpty()) {
            loadJob?.cancel()
            resetFeedCursor()
            cachedAllSections.forEach { sec ->
                sec.videos.forEach { seenVideoIds.add(it.id) }
            }
            nextCategoryIndex = minOf(CATEGORY_BATCH_SIZE, HOME_SHOWCASE_CATEGORIES.size)
            _uiState.value = state.copy(
                selectedCategory = "All",
                categorySections = cachedAllSections,
                videos = emptyList(),
                isLoading = false,
                isLoadingMore = false,
                hasMore = nextCategoryIndex < HOME_SHOWCASE_CATEGORIES.size,
                error = null
            )
            if (!allFeedFreshInSession) {
                loadInitial(category = "All", clearExisting = false)
            }
            return
        }

        val cachedCategoryVideos = categoryFeedCache[category].orEmpty()
        if (category != "All" && cachedCategoryVideos.isNotEmpty()) {
            _uiState.value = state.copy(
                selectedCategory = category,
                categorySections = emptyList(),
                videos = cachedCategoryVideos,
                isLoading = false,
                isLoadingMore = false,
                hasMore = true,
                error = null
            )
            loadInitial(category = category, clearExisting = false)
            return
        }

        loadInitial(category = category, clearExisting = true)
    }

    fun refresh() {
        allFeedFreshInSession = false
        loadInitial(category = _uiState.value.selectedCategory, clearExisting = false)
    }

    private fun resetFeedCursor() {
        seenVideoIds.clear()
        pendingVideos.clear()
        nextCategoryIndex = 0
        queryStage = 0
        nextPage = 1
    }

    private fun loadInitial(category: String, clearExisting: Boolean) {
        loadJob?.cancel()
        resetFeedCursor()
        val prev = _uiState.value
        val keepExistingAll = !clearExisting && category == "All" && prev.categorySections.isNotEmpty()
        val keepExistingCategory = !clearExisting && category != "All" && prev.videos.isNotEmpty()
        val hasInstantContent = keepExistingAll || keepExistingCategory

        _uiState.value = prev.copy(
            selectedCategory = category,
            currentRegion = currentRegion,
            videos = if (keepExistingCategory) prev.videos else emptyList(),
            categorySections = if (keepExistingAll) prev.categorySections else emptyList(),
            isLoading = !hasInstantContent,
            isLoadingMore = false,
            hasMore = true,
            error = null
        )

        loadJob = viewModelScope.launch {
            try {
                if (category == "All") {
                    val suggestionsJob = launch {
                        val suggestions = runCatching { videoRepository.getSmartSuggestions(limit = 10) }.getOrNull()
                        if (!suggestions.isNullOrEmpty() && _uiState.value.selectedCategory == "All") {
                            _uiState.value = _uiState.value.copy(smartSuggestions = suggestions)
                        }
                    }

                    val end = minOf(CATEGORY_BATCH_SIZE, HOME_SHOWCASE_CATEGORIES.size)
                    val initialSlice = HOME_SHOWCASE_CATEGORIES.subList(0, end)
                    nextCategoryIndex = end

                    val orderIndex = HOME_SHOWCASE_CATEGORIES.withIndex().associate { it.value to it.index }
                    val sectionMutex = Mutex()
                    val mergedMap = LinkedHashMap<String, CategorySection>()
                    if (keepExistingAll) {
                        prev.categorySections.forEach { mergedMap[it.category] = it }
                    }
                    val liveSections = ArrayList<CategorySection>(initialSlice.size)

                    coroutineScope {
                        initialSlice.forEach { cat ->
                            launch {
                                val section = fetchCategoryShelf(cat)
                                if (section != null) {
                                    sectionMutex.withLock {
                                        liveSections.add(section)
                                        mergedMap[section.category] = section
                                        categoryFeedCache[section.category] = section.videos
                                        section.videos.forEach { seenVideoIds.add(it.id) }
                                        val ordered = mergedMap.values.sortedBy { orderIndex[it.category] ?: Int.MAX_VALUE }
                                        cachedAllSections = ordered
                                        if (_uiState.value.selectedCategory == "All") {
                                            _uiState.value = _uiState.value.copy(
                                                categorySections = ordered,
                                                isLoading = false,
                                                error = null
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    val finalSections = if (liveSections.isNotEmpty()) {
                        liveSections.sortedBy { orderIndex[it.category] ?: Int.MAX_VALUE }.also {
                            allFeedFreshInSession = true
                        }
                    } else {
                        prev.categorySections
                    }
                    cachedAllSections = finalSections

                    val fallbackVideos = if (finalSections.isEmpty()) {
                        fetchNextVideoBatch("All")
                    } else {
                        emptyList()
                    }

                    suggestionsJob.join()
                    val hasAny = finalSections.isNotEmpty() || fallbackVideos.isNotEmpty()
                    val morePossible = nextCategoryIndex < HOME_SHOWCASE_CATEGORIES.size ||
                        pendingVideos.isNotEmpty() ||
                        queryStage < querySpecsFor(currentRegion, "All").size

                    _uiState.value = _uiState.value.copy(
                        categorySections = finalSections,
                        videos = fallbackVideos,
                        isLoading = false,
                        isLoadingMore = false,
                        hasMore = hasAny && morePossible,
                        error = if (!hasAny) "No videos found. Pull down to refresh." else null
                    )
                    persistHomeSnapshot()
                } else {
                    val batch = fetchNextVideoBatch(category)
                    val mergedVideos = if (batch.isNotEmpty()) {
                        batch
                    } else if (keepExistingCategory) {
                        prev.videos
                    } else {
                        emptyList()
                    }
                    if (mergedVideos.isNotEmpty()) {
                        categoryFeedCache[category] = mergedVideos
                        persistHomeSnapshot()
                    }
                    val specs = querySpecsFor(currentRegion, category)
                    val hasMore = mergedVideos.isNotEmpty() && (pendingVideos.isNotEmpty() || queryStage < specs.size)
                    _uiState.value = _uiState.value.copy(
                        categorySections = emptyList(),
                        videos = mergedVideos,
                        isLoading = false,
                        isLoadingMore = false,
                        hasMore = hasMore,
                        error = if (mergedVideos.isEmpty()) "No videos found. Pull down to refresh." else null
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Error loading videos: ${e.message}", e)
                val current = _uiState.value
                val hasContent = current.videos.isNotEmpty() || current.categorySections.isNotEmpty()
                _uiState.value = current.copy(
                    isLoading = false,
                    isLoadingMore = false,
                    error = if (!hasContent) "Unable to load videos. Tap to retry." else null
                )
            }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoading || state.isLoadingMore || !state.hasMore) return
        _uiState.value = state.copy(isLoadingMore = true)

        loadJob = viewModelScope.launch {
            try {
                if (state.selectedCategory == "All" && nextCategoryIndex < HOME_SHOWCASE_CATEGORIES.size) {
                    val newSections = mutableListOf<CategorySection>()
                    while (nextCategoryIndex < HOME_SHOWCASE_CATEGORIES.size && newSections.isEmpty()) {
                        val end = minOf(nextCategoryIndex + CATEGORY_BATCH_SIZE, HOME_SHOWCASE_CATEGORIES.size)
                        val slice = HOME_SHOWCASE_CATEGORIES.subList(nextCategoryIndex, end)
                        nextCategoryIndex = end
                        val fetched = coroutineScope {
                            slice.map { cat -> async { fetchCategoryShelf(cat) } }
                                .awaitAll()
                                .filterNotNull()
                        }
                        newSections.addAll(fetched)
                    }
                    newSections.forEach { section ->
                        section.videos.forEach { seenVideoIds.add(it.id) }
                    }
                    val extraVideos = if (newSections.isEmpty()) {
                        fetchNextVideoBatch("All")
                    } else {
                        emptyList()
                    }
                    val current = _uiState.value
                    val updatedSections = current.categorySections + newSections
                    val updatedVideos = (current.videos + extraVideos).distinctBy { it.id }
                    val stillHasMore = nextCategoryIndex < HOME_SHOWCASE_CATEGORIES.size ||
                        extraVideos.isNotEmpty() ||
                        pendingVideos.isNotEmpty() ||
                        queryStage < querySpecsFor(currentRegion, "All").size
                    _uiState.value = current.copy(
                        categorySections = updatedSections,
                        videos = updatedVideos,
                        isLoadingMore = false,
                        hasMore = stillHasMore
                    )
                } else {
                    val batch = fetchNextVideoBatch(state.selectedCategory)
                    val current = _uiState.value
                    val updatedVideos = (current.videos + batch).distinctBy { it.id }
                    val specs = querySpecsFor(currentRegion, state.selectedCategory)
                    val stillHasMore = batch.isNotEmpty() ||
                        pendingVideos.isNotEmpty() ||
                        queryStage < specs.size
                    _uiState.value = current.copy(
                        videos = updatedVideos,
                        isLoadingMore = false,
                        hasMore = stillHasMore
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Error loading more videos: ${e.message}", e)
                _uiState.value = _uiState.value.copy(isLoadingMore = false)
            }
        }
    }

    private suspend fun fetchCategoryShelf(category: String): CategorySection? {
        val raw = if (category == "Trending") {
            videoRepository.getTrending(limit = SHELF_VIDEO_LIMIT, region = currentRegion, page = 1)
        } else {
            val spec = querySpecsFor(currentRegion, category).first()
            var res = videoRepository.search(
                query = spec.query,
                limit = 20,
                region = currentRegion,
                page = 1,
                sortBy = spec.sortBy,
                date = spec.date,
                features = spec.features
            )
            if (res.isEmpty() && spec.date != null) {
                res = videoRepository.search(
                    query = spec.query,
                    limit = 20,
                    region = currentRegion,
                    page = 1,
                    sortBy = spec.sortBy,
                    date = null,
                    features = spec.features
                )
            }
            res
        }
        val sorted = raw
            .filter { it.id.isNotBlank() && it.title.isNotBlank() }
            .distinctBy { it.id }
            .sortedLatestFirst()
            .take(SHELF_VIDEO_LIMIT)
        return if (sorted.isNotEmpty()) CategorySection(category, sorted) else null
    }

    private suspend fun fetchNextVideoBatch(category: String): List<VideoData> {
        val batch = ArrayList<VideoData>(VIDEO_BATCH_SIZE)
        while (batch.size < VIDEO_BATCH_SIZE && pendingVideos.isNotEmpty()) {
            val next = pendingVideos.removeFirst()
            if (seenVideoIds.add(next.id)) {
                batch.add(next)
            }
        }

        val specs = querySpecsFor(currentRegion, category)
        var attempts = 0
        while (batch.size < VIDEO_BATCH_SIZE && attempts < 4 && queryStage < specs.size) {
            attempts++
            val fetched = if (category == "Trending" && queryStage == 0 && nextPage == 1) {
                nextPage++
                videoRepository.getTrending(limit = 20, region = currentRegion, page = 1)
            } else {
                val spec = specs[queryStage]
                val pageToFetch = nextPage
                nextPage++
                val searchRes = videoRepository.search(
                    query = spec.query,
                    limit = 20,
                    region = currentRegion,
                    page = pageToFetch,
                    sortBy = spec.sortBy,
                    date = spec.date,
                    features = spec.features
                )
                if (category == "All" && queryStage == 0 && pageToFetch == 1) {
                    (searchRes + videoRepository.getPopular(limit = 24)).distinctBy { it.id }
                } else {
                    searchRes
                }
            }

            val fresh = fetched
                .distinctBy { it.id }
                .filter { it.id.isNotBlank() && it.id !in seenVideoIds }
                .sortedLatestFirst()

            if (fresh.isEmpty()) {
                queryStage++
                nextPage = 1
                continue
            }

            for (video in fresh) {
                if (batch.size < VIDEO_BATCH_SIZE && seenVideoIds.add(video.id)) {
                    batch.add(video)
                } else if (video.id !in seenVideoIds) {
                    pendingVideos.addLast(video)
                }
            }

            if (nextPage > 5 || fresh.size < 4) {
                queryStage++
                nextPage = 1
            }
        }
        return batch
    }

    fun refreshSuggestions() {
        viewModelScope.launch {
            val suggestions = runCatching {
                videoRepository.getSmartSuggestions(limit = 10)
            }.getOrNull() ?: emptyList()
            _uiState.value = _uiState.value.copy(smartSuggestions = suggestions)
        }
    }

    private fun categoryQueryPair(regionCode: String, category: String): Pair<String, String> {
        val isVn = regionCode.equals("VN", ignoreCase = true)
        return when (category) {
            "Trending" -> if (isVn) "video thịnh hành việt nam" to "tin tức giải trí việt nam"
            else "trending videos" to "viral videos popular"
            "Music" -> if (isVn) "nhạc trẻ mới nhất" to "mv ca nhạc việt nam"
            else "official music video" to "music hits latest"
            "Gaming" -> if (isVn) "gaming việt nam" to "game gameplay highlights việt nam"
            else "gaming gameplay" to "gaming walkthrough highlights"
            "News" -> if (isVn) "tin tức 24h việt nam" to "thời sự mới nhất"
            else "news today breaking" to "world news latest"
            "Sports" -> if (isVn) "bóng đá việt nam" to "thể thao highlights"
            else "sports highlights" to "football match highlights"
            "Live" -> if (isVn) "trực tiếp live stream" to "phát trực tiếp việt nam"
            else "live stream" to "live now"
            "Education" -> if (isVn) "giáo dục học tập kỹ năng" to "kiến thức khoa học"
            else "educational video tutorial" to "learning documentary"
            "Comedy" -> if (isVn) "phim hài việt nam" to "hài kịch giải trí"
            else "comedy sketch funny" to "standup comedy"
            "Tech" -> if (isVn) "review công nghệ" to "đánh giá điện thoại máy tính"
            else "tech review gadget" to "technology smartphone review"
            "Food" -> if (isVn) "ẩm thực món ăn ngon" to "nấu ăn đường phố"
            else "cooking recipe" to "street food recipe"
            "Travel" -> if (isVn) "du lịch khám phá việt nam" to "vlog du lịch"
            else "travel vlog 4k" to "travel guide explore"
            "Fashion" -> if (isVn) "thời trang phối đồ" to "xu hướng thời trang"
            else "fashion style" to "outfit lookbook trends"
            "Science" -> if (isVn) "khoa học vũ trụ khám phá" to "kiến thức vũ trụ"
            else "science documentary" to "space physics discovery"
            else -> category to "$category latest"
        }
    }

    private fun querySpecsFor(regionCode: String, category: String): List<QuerySpec> {
        if (category == "All") {
            val (tPrimary, _) = categoryQueryPair(regionCode, "Trending")
            val specs = mutableListOf(
                QuerySpec(tPrimary, sortBy = "upload_date", date = "month"),
                QuerySpec(tPrimary, sortBy = "upload_date", date = null),
                QuerySpec(tPrimary, sortBy = "relevance", date = null)
            )
            val rotation = listOf(
                "Music", "Gaming", "News", "Tech", "Sports",
                "Comedy", "Food", "Travel", "Science", "Education", "Fashion"
            )
            for (cat in rotation) {
                val (primary, _) = categoryQueryPair(regionCode, cat)
                specs += QuerySpec(primary, sortBy = "upload_date", date = "month")
                specs += QuerySpec(primary, sortBy = "upload_date", date = null)
            }
            return specs
        }

        val (primary, secondary) = categoryQueryPair(regionCode, category)
        if (category == "Live") {
            return listOf(
                QuerySpec(primary, sortBy = null, date = null, features = "live"),
                QuerySpec(primary, sortBy = "upload_date", date = null),
                QuerySpec(secondary, sortBy = null, date = null, features = "live")
            )
        }
        return listOf(
            QuerySpec(primary, sortBy = "upload_date", date = "month"),
            QuerySpec(primary, sortBy = "upload_date", date = null),
            QuerySpec(secondary, sortBy = "upload_date", date = "month"),
            QuerySpec(primary, sortBy = "relevance", date = null),
            QuerySpec(secondary, sortBy = "relevance", date = null)
        )
    }
}
