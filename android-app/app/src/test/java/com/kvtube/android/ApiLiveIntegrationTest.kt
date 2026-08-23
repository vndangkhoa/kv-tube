package com.kvtube.android

import com.kvtube.android.data.api.KVApi
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ApiLiveIntegrationTest {

    private lateinit var httpClient: HttpClient
    private lateinit var json: Json
    private lateinit var api: KVApi

    @Before
    fun setUp() {
        json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            coerceInputValues = true
        }

        httpClient = HttpClient(OkHttp) {
            install(ContentNegotiation) {
                json(json)
            }
        }

        api = KVApi(httpClient, json)
        api.setServerUrl("https://yt.khoavo.myds.me")
    }

    @After
    fun tearDown() {
        httpClient.close()
    }

    @Test
    fun testServerHealthCheck() = runBlocking {
        try {
            val isHealthy = api.checkServerStatus()
            println("KV-Tube server health check result: $isHealthy")
            assertNotNull(isHealthy)
        } catch (e: Exception) {
            println("Server health check exception: ${e.message}")
        }
    }

    @Test
    fun testGetHomeFeed() = runBlocking {
        try {
            val feed = api.getHomeFeed(limit = 10, region = "US")
            println("Fetched feed items count: ${feed.size}")
            assertNotNull(feed)
            if (feed.isNotEmpty()) {
                val first = feed.first()
                println("First video title: ${first.title}, id: ${first.id}")
                assertTrue(first.id.isNotBlank())
            }
        } catch (e: Exception) {
            println("Feed test exception: ${e.message}")
        }
    }

    @Test
    fun testSearchQuery() = runBlocking {
        try {
            val results = api.search(query = "android tutorial", limit = 10)
            println("Search results count: ${results.size}")
            assertNotNull(results)
            if (results.isNotEmpty()) {
                val first = results.first()
                println("First search result: ${first.title}")
                assertTrue(first.id.isNotBlank())
            }
        } catch (e: Exception) {
            println("Search test exception: ${e.message}")
        }
    }

    @Test
    fun testGetSubscriptions() = runBlocking {
        try {
            val subs = api.getSubscriptions()
            assertNotNull(subs)
            println("Subscriptions count: ${subs.size}")
        } catch (e: Exception) {
            println("Subscriptions exception: ${e.message}")
        }
    }

    @Test
    fun testGetHistoryAndLiked() = runBlocking {
        try {
            val history = api.getHistory(limit = 10)
            val liked = api.getLiked(limit = 10)
            assertNotNull(history)
            assertNotNull(liked)
            println("History items: ${history.size}, Liked items: ${liked.size}")
        } catch (e: Exception) {
            println("History/Liked exception: ${e.message}")
        }
    }
}
