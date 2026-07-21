package com.kvtube.android.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val videos: List<VideoData> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val selectedCategory: String = "All",
    val hasMore: Boolean = true,
    val currentRegion: String = "GLOBAL"
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val videoRepository: VideoRepository,
    private val settingsDataStore: SettingsDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var currentPage = 0
    private var currentRegion = "GLOBAL"
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            settingsDataStore.region
                .distinctUntilChanged()
                .drop(1)
                .collect { region ->
                    currentRegion = region
                    currentPage = 0
                    _uiState.value = _uiState.value.copy(
                        currentRegion = region,
                        videos = emptyList(),
                        isLoading = true,
                        hasMore = true
                    )
                    loadVideos()
                }
        }

        viewModelScope.launch {
            val region = settingsDataStore.region.first()
            currentRegion = region
            _uiState.value = _uiState.value.copy(currentRegion = region)
            loadVideos()
        }
    }

    fun setRegion(region: String) {
        currentRegion = region
        selectCategory(_uiState.value.selectedCategory)
    }

    fun selectCategory(category: String) {
        if (_uiState.value.selectedCategory == category) return
        _uiState.value = _uiState.value.copy(
            selectedCategory = category,
            videos = emptyList(),
            isLoading = true,
            hasMore = true
        )
        currentPage = 0
        loadVideos()
    }

    fun loadMore() {
        if (_uiState.value.isLoadingMore || !_uiState.value.hasMore) return
        _uiState.value = _uiState.value.copy(isLoadingMore = true)
        currentPage++
        loadVideos()
    }

    fun refresh() {
        _uiState.value = _uiState.value.copy(isLoading = true, hasMore = true)
        currentPage = 0
        loadVideos()
    }

    private fun loadVideos() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val category = _uiState.value.selectedCategory
                val videos = if (currentPage == 0 && category == "All") {
                    val rc = getRegionContent(currentRegion)
                    val trendingQuery = getTrendingQuery(currentRegion)
                    val shuffledTopics = rc.topics.shuffled().take(4)
                    
                    val trendingDeferred = async {
                        try {
                            videoRepository.search(trendingQuery, 15, currentRegion)
                        } catch (e: Exception) {
                            emptyList()
                        }
                    }
                    val topicsDeferred = shuffledTopics.map { topic ->
                        async {
                            try {
                                videoRepository.search(topic, 10, currentRegion)
                            } catch (e: Exception) {
                                emptyList()
                            }
                        }
                    }
                    val trendingResult = trendingDeferred.await()
                    val topicsResult = topicsDeferred.awaitAll().flatten()
                    (trendingResult + topicsResult).shuffled().distinctBy { it.id }
                } else if (category == "All") {
                    val rc = getRegionContent(currentRegion)
                    val topics = rc.topics
                    if (topics.isNotEmpty()) {
                        val startIdx = (currentPage * 3) % topics.size
                        val batch = listOf(
                            topics[startIdx % topics.size],
                            topics[(startIdx + 1) % topics.size],
                            topics[(startIdx + 2) % topics.size]
                        )
                        val batchDeferred = batch.map { topic ->
                            async {
                                try {
                                    videoRepository.search(topic, 15, currentRegion)
                                } catch (e: Exception) {
                                    emptyList()
                                }
                            }
                        }
                        batchDeferred.awaitAll().flatten().shuffled().distinctBy { it.id }
                    } else {
                        videoRepository.search(getTrendingQuery(currentRegion), 30, currentRegion)
                    }
                } else if (category == "Trending") {
                    val query = getTrendingQuery(currentRegion)
                    videoRepository.search(query, 30, currentRegion)
                } else {
                    val query = getCategoryQuery(currentRegion, category)
                    videoRepository.search(query, 30, currentRegion)
                }

                val currentVideos = _uiState.value.videos
                val newVideosList = if (currentPage == 0) videos else currentVideos + videos
                val deduplicatedVideos = newVideosList.distinctBy { it.id }

                _uiState.value = _uiState.value.copy(
                    videos = deduplicatedVideos,
                    isLoading = false,
                    isLoadingMore = false,
                    error = null,
                    hasMore = videos.isNotEmpty()
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isLoadingMore = false,
                    error = e.message ?: "Failed to load videos"
                )
            }
        }
    }
}

private data class RegionContent(
    val name: String,
    val trending: String,
    val categories: Map<String, String>,
    val topics: List<String>
)

private val EN = RegionContent(
    name = "",
    trending = "trending videos 2026",
    categories = mapOf(
        "Music" to "music video 2026",
        "Gaming" to "gaming 2026",
        "News" to "news today",
        "Sports" to "sports highlights",
        "Live" to "live stream",
        "Education" to "educational video",
        "Comedy" to "comedy sketch",
        "Tech" to "tech review 2026",
        "Food" to "cooking recipe",
        "Travel" to "travel vlog",
        "Fashion" to "fashion style 2026",
        "Science" to "science documentary"
    ),
    topics = listOf(
        "trending videos 2026", "viral videos", "funny moments 2026", "tech review 2026",
        "cooking recipe easy", "travel vlog 2026", "science experiment", "news today",
        "sports highlights", "gaming moments 2026", "music video 2026", "comedy sketch",
        "nature documentary", "fitness workout", "DIY project", "car review 2026"
    )
)

private val VN = RegionContent(
    name = "Việt Nam",
    trending = "video thịnh hành việt nam",
    categories = mapOf(
        "Music" to "nhạc trẻ hay 2026",
        "Gaming" to "game gameplay việt nam",
        "News" to "tin tức 24h việt nam",
        "Sports" to "bóng đá việt nam",
        "Live" to "trực tiếp",
        "Education" to "giáo dục học tập",
        "Comedy" to "phim hài việt nam",
        "Tech" to "review công nghệ",
        "Food" to "ẩm thực món ăn ngon",
        "Travel" to "du lịch việt nam",
        "Fashion" to "thời trang",
        "Science" to "khoa học khám phá"
    ),
    topics = listOf(
        "video thịnh hành việt nam", "nhạc trẻ remix 2026", "phim hài việt nam",
        "review công nghệ", "ẩm thực việt nam", "du lịch việt nam", "tin tức 24h",
        "bóng đá việt nam", "gameplay việt nam", "vlog cuộc sống", "khoa học khám phá",
        "phim ngắn việt nam", "reaction việt nam", "nhạc trữ tình"
    )
)

private val JP = RegionContent(
    name = "日本",
    trending = "急上昇 動画 日本",
    categories = mapOf(
        "Music" to "音楽 MV 2026",
        "Gaming" to "ゲーム実況",
        "News" to "ニュース 最新",
        "Sports" to "スポーツ ハイライト",
        "Live" to "ライブ配信",
        "Education" to "勉強 教育",
        "Comedy" to "お笑い",
        "Tech" to "ガジェット レビュー",
        "Food" to "料理 レシピ",
        "Travel" to "旅行 vlog",
        "Fashion" to "ファッション",
        "Science" to "科学"
    ),
    topics = listOf(
        "急上昇 動画 日本", "音楽 MV 2026", "ゲーム実況", "お笑い", "料理 レシピ",
        "旅行 vlog", "ニュース 最新", "スポーツ ハイライト", "ガジェット レビュー",
        "アニメ", "vlog 日常", "科学 実験", "ドッキリ", "メイク"
    )
)

private val KR = RegionContent(
    name = "대한민국",
    trending = "인기 급상승 동영상",
    categories = mapOf(
        "Music" to "케이팝 음악 2026",
        "Gaming" to "게임 방송",
        "News" to "뉴스 속보",
        "Sports" to "스포츠 하이라이트",
        "Live" to "라이브 방송",
        "Education" to "교육 공부",
        "Comedy" to "예능 코미디",
        "Tech" to "테크 리뷰",
        "Food" to "먹방 요리",
        "Travel" to "여행 브이로그",
        "Fashion" to "패션",
        "Science" to "과학"
    ),
    topics = listOf(
        "인기 급상승 동영상", "케이팝 2026", "게임 방송", "먹방", "브이로그",
        "예능", "뉴스 속보", "스포츠 하이라이트", "테크 리뷰", "여행 브이로그",
        "요리 레시피", "메이크업", "과학 실험", "리액션"
    )
)

private val IN = RegionContent(
    name = "India",
    trending = "trending videos india",
    categories = mapOf(
        "Music" to "hindi songs 2026",
        "Gaming" to "gaming india",
        "News" to "hindi news today",
        "Sports" to "cricket highlights",
        "Live" to "live stream india",
        "Education" to "education hindi",
        "Comedy" to "comedy video hindi",
        "Tech" to "tech review hindi",
        "Food" to "indian food recipe",
        "Travel" to "travel vlog india",
        "Fashion" to "fashion india",
        "Science" to "science hindi"
    ),
    topics = listOf(
        "trending videos india", "hindi songs 2026", "bollywood", "cricket highlights",
        "indian food recipe", "comedy video hindi", "tech review hindi", "vlog india",
        "hindi news today", "gaming india", "motivational hindi", "dance video india",
        "travel vlog india", "stand up comedy india"
    )
)

private val regionNames = mapOf(
    "GLOBAL" to "",
    "US" to "United States",
    "VN" to "Vietnam",
    "JP" to "Japan",
    "KR" to "South Korea",
    "IN" to "India",
    "GB" to "United Kingdom",
    "DE" to "Germany",
    "FR" to "France",
    "BR" to "Brazil",
    "TH" to "Thailand",
    "ID" to "Indonesia"
)

private fun getRegionContent(regionCode: String): RegionContent {
    return when (regionCode) {
        "VN" -> VN
        "JP" -> JP
        "KR" -> KR
        "IN" -> IN
        else -> EN
    }
}

private fun getTrendingQuery(regionCode: String): String {
    val rc = getRegionContent(regionCode)
    if (rc.trending != "trending videos 2026" || regionCode == "GLOBAL" || regionCode == "US" || regionCode == "GB") {
        return rc.trending
    }
    val regionName = regionNames[regionCode] ?: ""
    return if (regionName.isNotEmpty()) "trending $regionName 2026" else "trending videos 2026"
}

private fun getCategoryQuery(regionCode: String, category: String): String {
    val rc = getRegionContent(regionCode)
    val localized = rc.categories[category]
    if (localized != null) return localized
    val regionName = regionNames[regionCode] ?: ""
    return if (regionName.isNotEmpty()) "$category $regionName" else category
}
