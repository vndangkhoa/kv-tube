package com.kvtube.android

import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.VideoData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FormatAndSemverTest {

    @Test
    fun testQualityLabelParsing() {
        val f4k = PlaybackFormat(formatId = "313", height = 2160, width = 3840)
        val f1080 = PlaybackFormat(formatId = "137", height = 1080, width = 1920)
        val f720 = PlaybackFormat(formatId = "22", height = 720, width = 1280)
        val f480 = PlaybackFormat(formatId = "135", height = 480, width = 854)
        val f360 = PlaybackFormat(formatId = "18", height = 360, width = 640)
        val fAudio = PlaybackFormat(formatId = "140", height = 0, width = 0)

        assertEquals("4K (2160p)", f4k.qualityLabel)
        assertEquals("1080p", f1080.qualityLabel)
        assertEquals("720p", f720.qualityLabel)
        assertEquals("480p", f480.qualityLabel)
        assertEquals("360p", f360.qualityLabel)
        assertEquals("Audio Only", fAudio.qualityLabel)
    }

    @Test
    fun testDurationFormatting() {
        val v1 = VideoData(id = "1", title = "T1", duration = "12:34")
        val v2 = VideoData(id = "2", title = "T2", duration = "1:02:15")

        assertEquals("12:34", v1.duration)
        assertEquals("1:02:15", v2.duration)
    }

    @Test
    fun testViewCountDisplayFormatting() {
        val vBillion = VideoData(viewCount = 2_450_000_000L)
        val vMillion = VideoData(viewCount = 14_200_000L)
        val vThousand = VideoData(viewCount = 85_600L)
        val vSmall = VideoData(viewCount = 420L)

        assertEquals("2.5B views", vBillion.displayViews)
        assertEquals("14.2M views", vMillion.displayViews)
        assertEquals("85.6K views", vThousand.displayViews)
        assertEquals("420 views", vSmall.displayViews)
    }

    @Test
    fun testSemverComparison() {
        fun isNewer(latest: String, current: String): Boolean {
            val lParts = latest.removePrefix("v").split(".").mapNotNull { it.toIntOrNull() }
            val cParts = current.removePrefix("v").split(".").mapNotNull { it.toIntOrNull() }
            val maxLen = maxOf(lParts.size, cParts.size)
            for (i in 0 until maxLen) {
                val l = lParts.getOrElse(i) { 0 }
                val c = cParts.getOrElse(i) { 0 }
                if (l > c) return true
                if (l < c) return false
            }
            return false
        }

        assertTrue(isNewer("1.3.1", "1.3.0"))
        assertTrue(isNewer("v2.0.0", "1.9.9"))
        assertTrue(isNewer("1.10.0", "1.9.0"))
        assertFalse(isNewer("1.3.0", "1.3.0"))
        assertFalse(isNewer("1.2.9", "1.3.0"))
    }
}
