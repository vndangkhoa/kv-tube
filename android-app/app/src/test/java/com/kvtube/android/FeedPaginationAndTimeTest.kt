package com.kvtube.android

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.api.sanitizeTrendingVideos
import com.kvtube.android.data.isZeroAgePlaceholder
import com.kvtube.android.data.local.SettingsDataStore
import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.relativeRecencyMinutes
import com.kvtube.android.data.relativeTimeFromEpoch
import com.kvtube.android.data.sortedLatestFirst
import io.ktor.client.HttpClient
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedPaginationAndTimeTest {

    private val nowSec = 1_795_500_000L

    @Test
    fun relativeTimeFromEpochFormatsSingularPluralAndEdgeCases() {
        assertEquals("", relativeTimeFromEpoch(0L, nowSec))
        assertEquals("", relativeTimeFromEpoch(-10L, nowSec))
        assertEquals("", relativeTimeFromEpoch(nowSec + 600L, nowSec))

        assertEquals("Just now", relativeTimeFromEpoch(nowSec - 20L, nowSec))
        assertEquals("1 minute ago", relativeTimeFromEpoch(nowSec - 60L, nowSec))
        assertEquals("5 minutes ago", relativeTimeFromEpoch(nowSec - 5L * 60L, nowSec))
        assertEquals("1 hour ago", relativeTimeFromEpoch(nowSec - 3600L, nowSec))
        assertEquals("3 hours ago", relativeTimeFromEpoch(nowSec - 3L * 3600L, nowSec))
        assertEquals("1 day ago", relativeTimeFromEpoch(nowSec - 86_400L, nowSec))
        assertEquals("6 days ago", relativeTimeFromEpoch(nowSec - 6L * 86_400L, nowSec))
        assertEquals("1 week ago", relativeTimeFromEpoch(nowSec - 7L * 86_400L, nowSec))
        assertEquals("2 weeks ago", relativeTimeFromEpoch(nowSec - 14L * 86_400L, nowSec))
        assertEquals("1 month ago", relativeTimeFromEpoch(nowSec - 30L * 86_400L, nowSec))
        assertEquals("11 months ago", relativeTimeFromEpoch(nowSec - 360L * 86_400L, nowSec))
        assertEquals("1 year ago", relativeTimeFromEpoch(nowSec - 365L * 86_400L, nowSec))
        assertEquals("2 years ago", relativeTimeFromEpoch(nowSec - 2L * 365L * 86_400L, nowSec))
    }

    @Test
    fun relativeRecencyMinutesParsesVietnameseAndEnglish() {
        assertEquals(0L, "".relativeRecencyMinutes())
        assertEquals(2L, "120 giây trước".relativeRecencyMinutes())
        assertEquals(30L, "30 phút trước".relativeRecencyMinutes())
        assertEquals(15L * 60L, "15 giờ trước".relativeRecencyMinutes())
        assertEquals(2L * 60L * 24L, "2 ngày trước".relativeRecencyMinutes())
        assertEquals(60L * 24L * 7L, "1 tuần trước".relativeRecencyMinutes())
        assertEquals(3L * 60L * 24L * 30L, "3 tháng trước".relativeRecencyMinutes())
        assertEquals(60L * 24L * 365L, "1 năm trước".relativeRecencyMinutes())

        assertEquals(45L, "45 minutes ago".relativeRecencyMinutes())
        assertEquals(4L * 60L, "4 hours ago".relativeRecencyMinutes())
        assertEquals(3L * 60L * 24L, "3 days ago".relativeRecencyMinutes())
        assertEquals(2L * 60L * 24L * 7L, "2 weeks ago".relativeRecencyMinutes())
    }

    @Test
    fun zeroAgePlaceholderDetectionAndDisplayPublished() {
        assertTrue(isZeroAgePlaceholder("0 giây trước"))
        assertTrue(isZeroAgePlaceholder("0 seconds ago"))
        assertTrue(isZeroAgePlaceholder("0 minutes ago"))
        assertFalse(isZeroAgePlaceholder("5 minutes ago"))
        assertFalse(isZeroAgePlaceholder("14 giờ trước"))

        val bogusNonLive = VideoData(
            id = "v1",
            title = "Stub",
            published = "0 giây trước",
            uploadedAt = "0 giây trước",
            publishedUnix = 0L,
            isLive = false
        )
        assertEquals("", bogusNonLive.displayPublished)

        val liveStream = VideoData(
            id = "v2",
            title = "Live",
            published = "0 giây trước",
            isLive = true
        )
        assertEquals("0 giây trước", liveStream.displayPublished)

        val uploadDateFallback = VideoData(
            id = "v3",
            title = "Classic",
            uploadDate = "20091025"
        )
        assertEquals("2009-10-25", uploadDateFallback.displayPublished)

        val futureSkewFallsBack = VideoData(
            id = "v4",
            title = "Future Skew",
            published = "2 days ago",
            publishedUnix = System.currentTimeMillis() / 1000L + 3600L
        )
        assertEquals("2 days ago", futureSkewFallsBack.displayPublished)
    }

    @Test
    fun sanitizeTrendingVideosDropsDeadStubsAndUniformScrapeTimestamps() {
        val scrapeEpoch = 1_795_441_977L
        val input = listOf(
            // Dead stub (0 views, 0 duration, not live) -> dropped
            VideoData(id = "dead1", title = "Dead 1", viewCount = 0L, durationSeconds = 0L, publishedUnix = scrapeEpoch, published = "0 giây trước"),
            // Zero-view with duration but identical scrape timestamp -> timestamp stripped
            VideoData(id = "stub2", title = "Stub 2", viewCount = 0L, durationSeconds = 120L, publishedUnix = scrapeEpoch, published = ""),
            VideoData(id = "stub3", title = "Stub 3", viewCount = 0L, durationSeconds = 240L, publishedUnix = scrapeEpoch, published = ""),
            // Live stream -> preserved even with 0 duration/views
            VideoData(id = "live1", title = "Live", isLive = true, publishedUnix = scrapeEpoch, published = "0 giây trước"),
            // Real trending item -> preserved intact
            VideoData(id = "real1", title = "Real", viewCount = 50_000L, durationSeconds = 300L, publishedUnix = nowSec - 7200L, published = "2 giờ trước")
        )

        val sanitized = sanitizeTrendingVideos(input)
        assertEquals(listOf("stub2", "stub3", "live1", "real1"), sanitized.map { it.id })

        val s2 = sanitized.first { it.id == "stub2" }
        assertEquals(0L, s2.publishedUnix)
        assertEquals("", s2.published)

        val live = sanitized.first { it.id == "live1" }
        assertEquals(scrapeEpoch, live.publishedUnix)

        val real = sanitized.first { it.id == "real1" }
        assertEquals(nowSec - 7200L, real.publishedUnix)
        assertEquals("2 giờ trước", real.published)
    }

    @Test
    fun sortedLatestFirstOrdersUnixAndFallbackTextNewestFirst() {
        val items = listOf(
            VideoData(id = "unknown", title = "Unknown"),
            VideoData(id = "old_unix", title = "3 days", publishedUnix = nowSec - 3L * 86_400L),
            VideoData(id = "vi_15h", title = "15h", published = "15 giờ trước"),
            VideoData(id = "en_2h", title = "2h", publishedUnix = nowSec - 2L * 3600L),
            VideoData(id = "vi_2d", title = "2d", published = "2 ngày trước")
        )

        val sorted = items.sortedLatestFirst(nowSec)
        assertEquals(
            listOf("en_2h", "vi_15h", "vi_2d", "old_unix", "unknown"),
            sorted.map { it.id }
        )
    }

    @Test
    fun checkTokenReturnsNoTokenWhenUrlSetWithoutAuthAndUnreachableWhenBlank() = runTest {
        val client = HttpClient()
        val json = Json { ignoreUnknownKeys = true }
        val api = KVApi(client, json)

        assertEquals(KVApi.TokenCheck.UNREACHABLE, api.checkToken())

        api.setServerUrl("https://u.khoavo.vndns.net")
        api.setToken("")
        assertEquals(KVApi.TokenCheck.NO_TOKEN, api.checkToken())
        client.close()
    }

    @Test
    fun settingsServerUrlPreservesUserSetUrlAndMergesSavedServers() {
        assertEquals(
            SettingsDataStore.DEFAULT_SERVER_URL,
            SettingsDataStore.resolveEffectiveServerUrl(storedUrl = null, userSet = false)
        )
        assertEquals(
            SettingsDataStore.DEFAULT_SERVER_URL,
            SettingsDataStore.resolveEffectiveServerUrl(storedUrl = "https://yt.khoavo.vndns.net", userSet = false)
        )
        // Explicit user-set selection must NEVER be silently rewritten on next startup
        assertEquals(
            "https://yt.khoavo.vndns.net",
            SettingsDataStore.resolveEffectiveServerUrl(storedUrl = "https://yt.khoavo.vndns.net", userSet = true)
        )
        assertEquals(
            "http://192.168.1.50:3000",
            SettingsDataStore.resolveEffectiveServerUrl(storedUrl = "http://192.168.1.50:3000/", userSet = true)
        )

        val merged = SettingsDataStore.mergeSavedServerUrls(
            existingRaw = "https://u.khoavo.vndns.net\nhttps://a.example.com\nhttps://b.example.com\nhttps://c.example.com\nhttps://d.example.com",
            priorityUrl = "http://192.168.1.50:3000/"
        )
        assertEquals(
            listOf(
                "http://192.168.1.50:3000",
                "https://u.khoavo.vndns.net",
                "https://a.example.com",
                "https://b.example.com",
                "https://c.example.com"
            ),
            merged
        )
    }
}
