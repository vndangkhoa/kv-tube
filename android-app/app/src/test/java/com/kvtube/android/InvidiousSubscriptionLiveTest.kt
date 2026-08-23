package com.kvtube.android

import com.kvtube.android.data.api.KVApi
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * Live test against a real Invidious instance. Verifies the exact flow the
 * Subscriptions screen uses: account channel list + merged notifications/videos
 * feed.
 *
 * Credentials are NOT hardcoded. Provide them via system properties:
 *
 *   ./gradlew :app:testDebugUnitTest \
 *     --tests "com.kvtube.android.InvidiousSubscriptionLiveTest" \
 *     -Dtest.invidious.url=https://your.instance.tld \
 *     -Dtest.invidious.token=<SID cookie value or JSON token>
 *
 * or use android-app/run-subscription-test.sh which reads them from the
 * gitignored .invidious-test.env file. Without properties every test is
 * skipped, so plain `gradlew test` stays green.
 */
class InvidiousSubscriptionLiveTest {

    private val url = System.getProperty("test.invidious.url").orEmpty().trim()
    private val token = System.getProperty("test.invidious.token").orEmpty().trim()

    private lateinit var httpClient: HttpClient
    private lateinit var api: KVApi

    @Before
    fun setUp() {
        assumeTrue("live instance not configured — skipping", url.isNotBlank() && token.isNotBlank())

        val json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            coerceInputValues = true
        }
        httpClient = HttpClient(OkHttp) { }
        api = KVApi(httpClient, json).apply {
            setServerUrl(url)
            setToken(token)
        }
    }

    @After
    fun tearDown() {
        if (this::httpClient.isInitialized) httpClient.close()
    }

    @Test
    fun `01 - server is reachable Invidious`() = runBlocking {
        assertTrue("stats endpoint should answer", api.checkServerStatus())
    }

    @Test
    fun `02 - token grants access to account subscriptions`() = runBlocking {
        val subs = api.getSubscriptions()
        assertTrue(
            "auth/subscriptions returned no channels — check token validity",
            subs.isNotEmpty()
        )
        println("subscribed channels: ${subs.size}, first: ${subs.first().channelName}")
        assertTrue(subs.all { it.channelId.isNotBlank() })
    }

    @Test
    fun `03 - feed merges notifications + videos and is newest-first`() = runBlocking {
        val feed = api.getSubscriptionFeed()
        println("feed items: ${feed.size}")
        assertTrue("feed came back empty", feed.isNotEmpty())

        // newest-first ordering (recency label parse; unknown/live sorts first)
        val recencies = feed.map { it.published.orEmpty().let(::recencyMinutesFor) }
        assertEquals(
            "feed must be sorted newest first",
            recencies.sorted(),
            recencies
        )

        assertTrue(feed.all { it.id.isNotBlank() })
    }

    @Test
    fun `04 - repository-level flow yields channels and videos`() = runBlocking {
        // Exercises the same call sequence as SubscriptionRepository.getFeed:
        // auth feed first; local aggregation only as fallback.
        val subs = api.getSubscriptions()
        val feed = api.getSubscriptionFeed(perChannel = 10, channels = 30)
        assertTrue(subs.isNotEmpty())
        assertTrue(feed.isNotEmpty())
        println("channels=${subs.size} feed=${feed.size} firstVideo=${feed.firstOrNull()?.title}")
    }

    /** Mirrors data.relativeRecencyMinutes without widening its visibility. */
    private fun recencyMinutesFor(label: String): Long {
        val text = label.lowercase()
        val n = Regex("(\\d+)").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        return when {
            "second" in text -> n / 60
            "minute" in text -> n
            "hour" in text -> n * 60
            "day" in text -> n * 1440
            "week" in text -> n * 10_080
            "month" in text -> n * 43_200
            "year" in text -> n * 525_600
            else -> 0L
        }
    }
}
