package com.kvtube.android

import com.kvtube.android.data.model.Subscription
import com.kvtube.android.data.repository.mergeSubs
import com.kvtube.android.data.repository.relativeRecencyMinutes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SubscriptionMergeTest {

    @Test
    fun mergesRemoteAndLocalWithoutDuplicates() {
        val remote = listOf(
            Subscription(channelId = "UC1", channelName = "Zeta"),
            Subscription(channelId = "UC2", channelName = "alpha")
        )
        val local = listOf(
            Subscription(channelId = "UC2", channelName = "Alpha"),
            Subscription(channelId = "UC3", channelName = "Beta")
        )

        val merged = mergeSubs(remote, local)

        assertEquals(listOf("UC2", "UC3", "UC1"), merged.map { it.channelId })
        // Remote (account) entry wins for duplicates
        assertEquals("alpha", merged.first().channelName)
    }

    @Test
    fun recencyParsingOrdersNewestFirst() {
        val minutes = mapOf(
            "3 minutes ago" to 3L,
            "2 hours ago" to 120L,
            "1 day ago" to 1440L,
            "2 weeks ago" to 20_160L,
            "" to 0L // live/unknown treated as freshest
        )
        assertEquals(minutes["3 minutes ago"], "3 minutes ago".relativeRecencyMinutes())
        assertEquals(minutes["2 hours ago"], "2 hours ago".relativeRecencyMinutes())
        assertEquals(minutes["1 day ago"], "1 day ago".relativeRecencyMinutes())
        assertEquals(minutes["2 weeks ago"], "2 weeks ago".relativeRecencyMinutes())
        assertEquals(0L, "".relativeRecencyMinutes())

        val sorted = listOf("1 day ago", "", "3 minutes ago").sortedBy { it.relativeRecencyMinutes() }
        assertEquals(listOf("", "3 minutes ago", "1 day ago"), sorted)
    }

    @Test
    fun emptyInputsStayEmpty() {
        assertTrue(mergeSubs(emptyList(), emptyList()).isEmpty())
    }
}
