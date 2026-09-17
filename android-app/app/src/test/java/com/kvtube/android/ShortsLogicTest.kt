package com.kvtube.android

import com.kvtube.android.data.model.ExtractedStream
import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.VideoData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShortsLogicTest {

    @Test
    fun `ExtractedStream correctly distinguishes progressive from DASH streams`() {
        val progressive = ExtractedStream(
            videoUrl = "https://googlevideo.com/videoplayback?id=1&itag=22",
            height = 720,
            isDash = false
        )
        assertFalse("Progressive stream should not be marked as DASH", progressive.isDash)
        assertTrue("Progressive stream audioUrl should be null or blank", progressive.audioUrl.isNullOrBlank())

        val dash = ExtractedStream(
            videoUrl = "https://googlevideo.com/videoplayback?id=1&itag=137",
            audioUrl = "https://googlevideo.com/videoplayback?id=1&itag=140",
            height = 1080,
            isDash = true
        )
        assertTrue("Separate streams should be marked as DASH", dash.isDash)
        assertNotNull("DASH stream must have non-null audioUrl", dash.audioUrl)
        assertEquals("https://googlevideo.com/videoplayback?id=1&itag=140", dash.audioUrl)
    }

    @Test
    fun `Shorts pagination deduplication prevents duplicate items`() {
        val currentShorts = listOf(
            VideoData(id = "s1", title = "Short 1"),
            VideoData(id = "s2", title = "Short 2"),
            VideoData(id = "s3", title = "Short 3")
        )

        val newBatch = listOf(
            VideoData(id = "s2", title = "Short 2"), // duplicate
            VideoData(id = "s4", title = "Short 4"), // new
            VideoData(id = "s5", title = "Short 5")  // new
        )

        val existingIds = currentShorts.map { it.id }.toSet()
        val distinctNew = newBatch.filter { it.id !in existingIds }

        assertEquals(2, distinctNew.size)
        assertEquals("s4", distinctNew[0].id)
        assertEquals("s5", distinctNew[1].id)

        val combined = currentShorts + distinctNew
        assertEquals(5, combined.size)
        assertEquals(listOf("s1", "s2", "s3", "s4", "s5"), combined.map { it.id })
    }

    @Test
    fun `Server playback fallback prefers progressive formats with audio`() {
        val formats = listOf(
            PlaybackFormat(formatId = "137", height = 1080, url = "https://video-only-1080.mp4", hasAudio = false),
            PlaybackFormat(formatId = "22", height = 720, url = "https://progressive-720.mp4", hasAudio = true),
            PlaybackFormat(formatId = "18", height = 360, url = "https://progressive-360.mp4", hasAudio = true)
        )
        val playback = PlaybackInfo(
            title = "Test Short",
            videoFormats = formats,
            audioFormat = PlaybackFormat(formatId = "140", url = "https://audio.m4a", hasAudio = true)
        )

        val progressive = playback.videoFormats.firstOrNull { it.hasAudio && it.url.isNotEmpty() }
        assertNotNull(progressive)
        assertEquals("https://progressive-720.mp4", progressive?.url)
        assertEquals(720, progressive?.height)
    }

    @Test
    fun `Server playback fallback resolves separate video and audio when no progressive format`() {
        val formats = listOf(
            PlaybackFormat(formatId = "137", height = 1080, url = "https://video-only-1080.mp4", hasAudio = false)
        )
        val audio = PlaybackFormat(formatId = "140", url = "https://audio.m4a", hasAudio = true)
        val playback = PlaybackInfo(
            title = "DASH Short",
            videoFormats = formats,
            audioFormat = audio
        )

        val progressive = playback.videoFormats.firstOrNull { it.hasAudio && it.url.isNotEmpty() }
        assertEquals(null, progressive)

        val videoFormat = playback.videoFormats.firstOrNull { it.url.isNotEmpty() }
        assertNotNull(videoFormat)

        val stream = ExtractedStream(
            videoUrl = videoFormat!!.url,
            audioUrl = playback.audioFormat?.url,
            height = videoFormat.height,
            isDash = !playback.audioFormat?.url.isNullOrBlank()
        )

        assertEquals("https://video-only-1080.mp4", stream.videoUrl)
        assertEquals("https://audio.m4a", stream.audioUrl)
        assertTrue(stream.isDash)
    }
}
