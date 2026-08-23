package com.kvtube.android

import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.QualityTier
import com.kvtube.android.data.model.QualityTiers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QualityTiersTest {

    private val audio = PlaybackFormat(
        formatId = "140", height = 0, bandwidth = 130_000,
        url = "https://audio.example/140", hasAudio = true
    )

    /** Typical YouTube format set: combined up to 720p, adaptive beyond. */
    private fun typicalInfo() = PlaybackInfo(
        title = "t",
        videoFormats = listOf(
            PlaybackFormat(formatId = "313", height = 2160, url = "https://v/2160"),
            PlaybackFormat(formatId = "308", height = 1440, url = "https://v/1440"),
            PlaybackFormat(formatId = "137", height = 1080, url = "https://v/1080"),
            PlaybackFormat(formatId = "136", height = 720, url = "https://v/720"),
            PlaybackFormat(formatId = "135", height = 480, url = "https://v/480"),
            PlaybackFormat(formatId = "134", height = 360, url = "https://v/360")
        ),
        audioFormat = audio
    )

    @Test
    fun lowPicks360WithMergedAudio() {
        val (format, audioUrl) = QualityTiers.resolve(QualityTier.LOW, typicalInfo())!!
        assertEquals(360, format.height)
        assertEquals(audio.url, audioUrl)
    }

    @Test
    fun midPrefersCombinedAtSameHeight() {
        val info = PlaybackInfo(
            videoFormats = listOf(
                PlaybackFormat(formatId = "137", height = 720, url = "https://v/720"),
                // combined progressive stream (has embedded audio)
                PlaybackFormat(formatId = "22", height = 720, url = "https://v/720c", hasAudio = true),
                PlaybackFormat(formatId = "134", height = 360, url = "https://v/360", hasAudio = true)
            ),
            audioFormat = audio
        )
        val (format, audioUrl) = QualityTiers.resolve(QualityTier.MID, info)!!
        assertEquals(720, format.height)
        // Combined stream at the same height → no separate audio needed
        assertNull(audioUrl)
    }

    @Test
    fun highPicks1080WithMergedAudio() {
        val (format, audioUrl) = QualityTiers.resolve(QualityTier.HIGH, typicalInfo())!!
        assertEquals(1080, format.height)
        assertEquals(audio.url, audioUrl)
    }

    @Test
    fun maximumPicksHighestAvailable() {
        val (format, audioUrl) = QualityTiers.resolve(QualityTier.MAXIMUM, typicalInfo())!!
        assertEquals(2160, format.height)
        assertEquals(audio.url, audioUrl)
    }

    @Test
    fun fallsBackToLowestWhenNothingUnderCap() {
        val info = PlaybackInfo(
            videoFormats = listOf(
                PlaybackFormat(formatId = "136", height = 720, url = "https://v/720"),
                PlaybackFormat(formatId = "135", height = 480, url = "https://v/480")
            ),
            audioFormat = audio
        )
        val (format, _) = QualityTiers.resolve(QualityTier.LOW, info)!!
        assertEquals(480, format.height)
    }

    @Test
    fun degradesToCombinedWhenNoAudioTrackExists() {
        val info = PlaybackInfo(
            videoFormats = listOf(
                PlaybackFormat(formatId = "137", height = 1080, url = "https://v/1080"),
                PlaybackFormat(formatId = "18", height = 360, url = "https://v/360c", hasAudio = true),
                PlaybackFormat(formatId = "134", height = 240, url = "https://v/240c", hasAudio = true)
            ),
            audioFormat = null
        )
        val (format, audioUrl) = QualityTiers.resolve(QualityTier.HIGH, info)!!
        // Silent 1080p would be useless → closest combined stream wins
        assertEquals(360, format.height)
        assertNull(audioUrl)
    }

    @Test
    fun handlesEmptyAndNullInputs() {
        assertNull(QualityTiers.resolve(QualityTier.HIGH, null))
        assertNull(QualityTiers.resolve(QualityTier.HIGH, PlaybackInfo()))
    }
}
