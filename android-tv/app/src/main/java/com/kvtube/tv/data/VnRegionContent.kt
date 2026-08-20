package com.kvtube.tv.data

/**
 * Mirrors frontend/app/regionContent.ts — VN section.
 * RegionContent.categories[category] + default region = VN (same as docker-compose NEXT_PUBLIC_DEFAULT_REGION=VN).
 */
object VnRegionContent {
    const val DEFAULT_REGION = "VN"

    val categories: Map<String, String> = mapOf(
        "Music" to "nhạc trẻ hay 2026 official mv",
        "Gaming" to "game gameplay highlights việt nam",
        "Movies" to "trailer phim việt nam chiếu rạp teaser",
        "News" to "tin tức 24h việt nam thời sự",
        "Tech" to "review công nghệ điện thoại máy tính",
        "Coding" to "lập trình web tutorial việt nam",
        "Sports" to "bóng đá việt nam highlights",
        "Podcasts" to "podcast việt nam trò chuyện",
        "Live" to "trực tiếp live stream",
        "Education" to "giáo dục học tập kỹ năng",
        "Comedy" to "phim hài tiểu phẩm hài việt nam",
        "Food" to "ẩm thực món ăn ngon đường phố",
        "Travel" to "du lịch khám phá việt nam",
        "Fashion" to "thời trang phối đồ",
        "Science" to "khoa học vũ trụ khám phá",
    )

    // Fallback for chips not in map (should not happen, but keep English as fallback)
    fun queryFor(category: String): String = categories[category] ?: category
}
