package com.kvtube.tv

import androidx.media3.common.C
import com.kvtube.tv.data.model.InvidiousAdaptiveFormat
import com.kvtube.tv.player.AudioLanguagePreference
import com.kvtube.tv.player.TvAudioTracks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TvAudioTracksTest {

    @Test
    fun vietnameseVideoWithEnglishAutoDubPicksOriginalByDefault() {
        val tracks = listOf(
            TvAudioTracks.classifyTrack(
                groupIndex = 0,
                trackIndex = 0,
                formatId = "140-en-US.10",
                language = "en-US",
                rawLabel = "English (US)",
                roleFlags = C.ROLE_FLAG_ALTERNATE or C.ROLE_FLAG_DUB,
                bitrate = 131_000,
            ),
            TvAudioTracks.classifyTrack(
                groupIndex = 1,
                trackIndex = 0,
                formatId = "140-vi.4-drc",
                language = "vi",
                rawLabel = "Vietnamese original (Stable Volume)",
                roleFlags = C.ROLE_FLAG_MAIN or C.ROLE_FLAG_ENHANCED_DIALOG_INTELLIGIBILITY,
                bitrate = 130_000,
            ),
            TvAudioTracks.classifyTrack(
                groupIndex = 2,
                trackIndex = 0,
                formatId = "140-vi.4",
                language = "vi",
                rawLabel = "Vietnamese original",
                roleFlags = C.ROLE_FLAG_MAIN,
                bitrate = 130_000,
            ),
        )

        assertTrue(tracks[0].isDubbed)
        assertFalse(tracks[0].isOriginal)
        assertTrue(tracks[1].isOriginal && tracks[1].isStableVolume)
        assertTrue(tracks[2].isOriginal && !tracks[2].isStableVolume)

        assertEquals("VI • Orig", tracks[2].shortBadge)
        assertEquals("EN • Dub", tracks[0].shortBadge)
        assertEquals("Vietnamese (Original)", tracks[2].displayName)
        assertEquals("Vietnamese (Original • Stable Volume)", tracks[1].displayName)
        assertEquals("English (US) • Auto-dub", tracks[0].displayName)

        val drcOnly = TvAudioTracks.classifyTrack(
            groupIndex = 1,
            trackIndex = 0,
            formatId = "140-drc",
            language = "vi",
            rawLabel = "Stable Volume",
            roleFlags = C.ROLE_FLAG_ALTERNATE or C.ROLE_FLAG_ENHANCED_DIALOG_INTELLIGIBILITY,
            bitrate = 130_000,
        )
        assertEquals("Vietnamese (Stable Volume)", drcOnly.displayName)

        // Even when Android TV locale is en-US, ORIGINAL picks Vietnamese original (index 2)
        assertEquals(2, TvAudioTracks.pickPreferredIndex(tracks, AudioLanguagePreference.ORIGINAL, deviceLanguage = "en"))
        assertEquals(2, TvAudioTracks.pickPreferredIndex(tracks, AudioLanguagePreference.VIETNAMESE, deviceLanguage = "en"))
        assertEquals(0, TvAudioTracks.pickPreferredIndex(tracks, AudioLanguagePreference.ENGLISH, deviceLanguage = "en"))
        assertEquals(0, TvAudioTracks.pickPreferredIndex(tracks, AudioLanguagePreference.DEVICE, deviceLanguage = "en"))
        assertEquals(2, TvAudioTracks.pickPreferredIndex(tracks, AudioLanguagePreference.DEVICE, deviceLanguage = "vi"))

        val sorted = TvAudioTracks.sortForDisplay(tracks)
        assertEquals("Vietnamese (Original)", sorted[0].displayName)
        assertEquals("Vietnamese (Original • Stable Volume)", sorted[1].displayName)
        assertEquals("English (US) • Auto-dub", sorted[2].displayName)
    }

    @Test
    fun mrBeastMultiDubPicksEnglishOriginalOrUserChosenLanguage() {
        val tracks = listOf(
            TvAudioTracks.classifyTrack(
                groupIndex = 0,
                trackIndex = 0,
                formatId = "140-ar.3",
                language = "ar",
                rawLabel = "Arabic",
                roleFlags = C.ROLE_FLAG_ALTERNATE or C.ROLE_FLAG_DUB,
                bitrate = 128_000,
            ),
            TvAudioTracks.classifyTrack(
                groupIndex = 1,
                trackIndex = 0,
                formatId = "140-en.4",
                language = "en",
                rawLabel = "English original",
                roleFlags = C.ROLE_FLAG_MAIN,
                bitrate = 128_000,
            ),
            TvAudioTracks.classifyTrack(
                groupIndex = 2,
                trackIndex = 0,
                formatId = "140-vi.3",
                language = "vi",
                rawLabel = "Vietnamese",
                roleFlags = C.ROLE_FLAG_ALTERNATE or C.ROLE_FLAG_DUB,
                bitrate = 128_000,
            ),
        )

        assertEquals(1, TvAudioTracks.pickPreferredIndex(tracks, AudioLanguagePreference.ORIGINAL, deviceLanguage = "vi"))
        assertEquals(2, TvAudioTracks.pickPreferredIndex(tracks, AudioLanguagePreference.VIETNAMESE, deviceLanguage = "en"))
        assertEquals(1, TvAudioTracks.pickPreferredIndex(tracks, AudioLanguagePreference.ENGLISH, deviceLanguage = "en"))
    }

    @Test
    fun adaptiveAudioSelectionPrefersOriginalOverHigherBitrateDub() {
        val dubHigherBitrate = InvidiousAdaptiveFormat(
            url = "https://example.com/en.m4a",
            itag = "140",
            type = "audio/mp4; codecs=\"mp4a.40.2\"",
            bitrate = "192000",
            audioTrackId = "en-US.10",
            audioTrackName = "English (US)",
            audioLanguage = "en-US",
            isOriginalAudio = false,
            isDubbedAudio = true,
        )
        val originalLowerBitrate = InvidiousAdaptiveFormat(
            url = "https://example.com/vi.m4a",
            itag = "140",
            type = "audio/mp4; codecs=\"mp4a.40.2\"",
            bitrate = "128000",
            audioTrackId = "vi.4",
            audioTrackName = "Vietnamese original",
            audioLanguage = "vi",
            isOriginalAudio = true,
            isDubbedAudio = false,
        )

        val pickedOrig = TvAudioTracks.selectBestAdaptiveAudio(
            listOf(dubHigherBitrate, originalLowerBitrate),
            AudioLanguagePreference.ORIGINAL,
        )
        assertEquals("vi", pickedOrig?.audioLanguage)

        val pickedEn = TvAudioTracks.selectBestAdaptiveAudio(
            listOf(dubHigherBitrate, originalLowerBitrate),
            AudioLanguagePreference.ENGLISH,
        )
        assertEquals("en-US", pickedEn?.audioLanguage)
    }

    @Test
    fun parsesInvidiousUrlXtagsAndDeduplicatesMultiAudioFormats() {
        val enDub = InvidiousAdaptiveFormat(
            url = "https://u.khoavo.vndns.net/api/invidious/videoplayback?itag=140&xtags=acont%3Ddubbed-auto%3Alang%3Den-US",
            itag = "140",
            type = "audio/mp4; codecs=\"mp4a.40.2\"",
            bitrate = "131695",
        )
        val viDrc = InvidiousAdaptiveFormat(
            url = "https://u.khoavo.vndns.net/api/invidious/videoplayback?itag=140&xtags=acont%3Doriginal%3Adrc%3D1%3Alang%3Dvi",
            itag = "140",
            type = "audio/mp4; codecs=\"mp4a.40.2\"",
            bitrate = "131839",
        )
        val viOrig = InvidiousAdaptiveFormat(
            url = "https://u.khoavo.vndns.net/api/invidious/videoplayback?itag=140&xtags=acont%3Doriginal%3Alang%3Dvi",
            itag = "140",
            type = "audio/mp4; codecs=\"mp4a.40.2\"",
            bitrate = "131839",
        )

        val metaOrig = TvAudioTracks.parseUrlAudioMeta(viOrig.url)
        assertTrue(metaOrig.isOriginal)
        assertFalse(metaOrig.isDubbed)
        assertFalse(metaOrig.isStableVolume)
        assertEquals("vi", metaOrig.language)

        val bestOrig = TvAudioTracks.selectBestAdaptiveAudio(listOf(enDub, viDrc, viOrig), AudioLanguagePreference.ORIGINAL)
        assertEquals(viOrig.url, bestOrig?.url)

        val distinct = TvAudioTracks.distinctAdaptiveAudios(listOf(enDub, viDrc, viOrig))
        assertEquals(3, distinct.size)
        assertEquals("vi", distinct[0].audioLanguage)
        assertTrue(distinct[0].isOriginalAudio)
        assertEquals("en-US", distinct[2].audioLanguage)
        assertTrue(distinct[2].isDubbedAudio)
    }
}
