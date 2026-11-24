package com.kvtube.android

import com.kvtube.android.data.model.VideoData
import com.kvtube.android.data.repository.VideoRepository
import org.junit.Assert.assertEquals
import org.junit.Test

class RelatedQueryTest {

    @Test
    fun stripsBracketsNoiseAndCapsAtFourTokens() {
        val q = VideoRepository.buildRelatedSearchQuery(
            title = "[MV] After - Fell Asleep in the Sun (Official Music Video) 4K HD",
            channelTitle = "After"
        )
        assertEquals("After Fell Asleep in", q)
    }

    @Test
    fun fallsBackToChannelWhenTitleIsNoiseOnlyOrEmpty() {
        assertEquals(
            "After",
            VideoRepository.buildRelatedSearchQuery(
                title = "(Official Music Video) [4K]",
                channelTitle = "  After  "
            )
        )
        assertEquals(
            "Blue Mountains Mizoram",
            VideoRepository.buildRelatedSearchQuery(
                title = "",
                channelTitle = "Blue Mountains Mizoram"
            )
        )
    }

    @Test
    fun returnsEmptyWhenTitleAndChannelAreBlank() {
        assertEquals("", VideoRepository.buildRelatedSearchQuery("   ", " "))
    }

    @Test
    fun rankCachedRelatedExcludesCurrentDedupesAndPrioritizesMatches() {
        val candidates = listOf(
            VideoData(id = "cur", title = "After - Fell Asleep in the Sun", channelTitle = "After"),
            VideoData(id = "other", title = "Gaming News Daily", channelTitle = "News"),
            VideoData(id = "topicMatch", title = "Fell Asleep Live Cover", channelTitle = "Indie"),
            VideoData(id = "chanMatch", title = "Another Song", channelTitle = "After"),
            VideoData(id = "chanMatch", title = "Duplicate Entry", channelTitle = "After"),
            VideoData(id = "", title = "Missing Id", channelTitle = "After")
        )
        val ranked = VideoRepository.rankCachedRelated(
            candidates = candidates,
            excludeId = "cur",
            titleHint = "After - Fell Asleep in the Sun (Official Music Video)",
            channelHint = "After",
            limit = 10
        )
        assertEquals(listOf("chanMatch", "topicMatch", "other"), ranked.map { it.id })
    }
}
