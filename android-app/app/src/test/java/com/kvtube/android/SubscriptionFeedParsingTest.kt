package com.kvtube.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import com.kvtube.android.data.api.parseSubscriptionFeed

class SubscriptionFeedParsingTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun ids(items: List<kotlinx.serialization.json.JsonObject>) =
        items.mapNotNull { (it["videoId"] as? JsonPrimitive)?.contentOrNull }

    @Test
    fun mergesNotificationsAndVideos() {
        val payload = """
            {
              "notifications": [
                {"videoId": "n1", "title": "Fresh upload", "author": "A", "authorId": "UC1", "publishedText": "5 minutes ago"},
                {"videoId": "n2", "title": "Short", "author": "B", "authorId": "UC2", "publishedText": "1 hour ago"}
              ],
              "videos": [
                {"videoId": "v1", "title": "Older video", "author": "C", "authorId": "UC3", "publishedText": "2 days ago"}
              ]
            }
        """.trimIndent()

        val items = parseSubscriptionFeed(json.parseToJsonElement(payload))

        assertEquals(listOf("n1", "n2", "v1"), ids(items))
    }

    @Test
    fun legacyPlainArrayStillWorks() {
        val payload = """[{"videoId":"a1"},{"videoId":"a2"}]"""
        val items = parseSubscriptionFeed(json.parseToJsonElement(payload))
        assertEquals(listOf("a1", "a2"), ids(items))
    }

    @Test
    fun deduplicatesByVideoIdAcrossBothLists() {
        val payload = """
            {
              "notifications": [{"videoId": "dup"}, {"videoId": "n1"}],
              "videos": [{"videoId": "dup"}, {"videoId": "v1"}]
            }
        """.trimIndent()

        // dedupe happens in KVApi right after parsing:
        val distinct = parseSubscriptionFeed(json.parseToJsonElement(payload))
            .distinctBy { ids(listOf(it)).firstOrNull() }

        assertEquals(setOf("dup", "n1", "v1"), ids(distinct).toSet())
    }

    @Test
    fun handlesEmptyAndGarbagePayloads() {
        assertTrue(parseSubscriptionFeed(null).isEmpty())
        assertTrue(parseSubscriptionFeed(json.parseToJsonElement("{}")).isEmpty())
        assertTrue(parseSubscriptionFeed(json.parseToJsonElement("[]")).isEmpty())
    }
}
