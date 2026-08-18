package com.kvtube.android

import com.kvtube.android.data.local.DownloadedVideoEntity
import com.kvtube.android.data.model.SortCriteria
import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadsLogicTest {

    private val sampleDownloads = listOf(
        DownloadedVideoEntity(
            videoId = "1",
            title = "Zebra Wildlife",
            quality = "recommended",
            filePath = "/data/zebra.mp4",
            fileSize = 50_000_000L,
            duration = "10:00",
            thumbnail = "",
            channelTitle = "National Geo",
            downloadedAt = 1000L
        ),
        DownloadedVideoEntity(
            videoId = "2",
            title = "Apple Review 2026",
            quality = "best",
            filePath = "/data/apple.mp4",
            fileSize = 120_000_000L,
            duration = "15:30",
            thumbnail = "",
            channelTitle = "Tech Daily",
            downloadedAt = 3000L
        ),
        DownloadedVideoEntity(
            videoId = "3",
            title = "Baking Croissants",
            quality = "low",
            filePath = "/data/croissant.mp4",
            fileSize = 20_000_000L,
            duration = "08:12",
            thumbnail = "",
            channelTitle = "Chef Studio",
            downloadedAt = 2000L
        )
    )

    @Test
    fun testSortByNameAscending() {
        val sorted = sampleDownloads.sortedBy { it.title.lowercase() }
        assertEquals("Apple Review 2026", sorted[0].title)
        assertEquals("Baking Croissants", sorted[1].title)
        assertEquals("Zebra Wildlife", sorted[2].title)
    }

    @Test
    fun testSortByNameDescending() {
        val sorted = sampleDownloads.sortedByDescending { it.title.lowercase() }
        assertEquals("Zebra Wildlife", sorted[0].title)
        assertEquals("Baking Croissants", sorted[1].title)
        assertEquals("Apple Review 2026", sorted[2].title)
    }

    @Test
    fun testSortByDateDescending() {
        val sorted = sampleDownloads.sortedByDescending { it.downloadedAt }
        assertEquals("Apple Review 2026", sorted[0].title) // 3000L
        assertEquals("Baking Croissants", sorted[1].title) // 2000L
        assertEquals("Zebra Wildlife", sorted[2].title)     // 1000L
    }

    @Test
    fun testSortBySizeDescending() {
        val sorted = sampleDownloads.sortedByDescending { it.fileSize }
        assertEquals(120_000_000L, sorted[0].fileSize)
        assertEquals(50_000_000L, sorted[1].fileSize)
        assertEquals(20_000_000L, sorted[2].fileSize)
    }

    @Test
    fun testSearchFiltering() {
        val query = "tech"
        val filtered = sampleDownloads.filter {
            it.title.contains(query, ignoreCase = true) ||
            it.channelTitle.contains(query, ignoreCase = true)
        }
        assertEquals(1, filtered.size)
        assertEquals("Apple Review 2026", filtered[0].title)
    }
}
