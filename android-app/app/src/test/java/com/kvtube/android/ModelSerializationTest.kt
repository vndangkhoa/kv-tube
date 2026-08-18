package com.kvtube.android

import com.kvtube.android.data.model.ChannelInfo
import com.kvtube.android.data.model.Comment
import com.kvtube.android.data.model.DownloadProgress
import com.kvtube.android.data.model.DownloadStatus
import com.kvtube.android.data.model.PlaybackFormat
import com.kvtube.android.data.model.PlaybackInfo
import com.kvtube.android.data.model.Quality
import com.kvtube.android.data.model.Subscription
import com.kvtube.android.data.model.VideoData
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ModelSerializationTest {

    private lateinit var json: Json

    @Before
    fun setUp() {
        json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            coerceInputValues = true
        }
    }

    @Test
    fun testVideoDataSerializationAndFormatting() {
        val videoJson = """
            {
                "id": "dQw4w9WgXcQ",
                "title": "Never Gonna Give You Up",
                "uploader": "Rick Astley",
                "channel_id": "UCuAXFkgsw1L7xaCfnd5JJOw",
                "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                "view_count": 1500000000,
                "duration": "3:33",
                "upload_date": "20091025",
                "is_short": false
            }
        """.trimIndent()

        val video = json.decodeFromString<VideoData>(videoJson)

        assertEquals("dQw4w9WgXcQ", video.id)
        assertEquals("Never Gonna Give You Up", video.title)
        assertEquals("Rick Astley", video.displayChannelTitle)
        assertEquals("UCuAXFkgsw1L7xaCfnd5JJOw", video.displayChannelId)
        assertEquals("1.5B views", video.displayViews)
        assertEquals("2009-10-25", video.displayPublished)
        assertFalse(video.isShort)
    }

    @Test
    fun testPlaybackInfoSerialization() {
        val playbackJson = """
            {
                "title": "Sample Video",
                "duration": 213.5,
                "video_formats": [
                    {
                        "format_id": "137",
                        "height": 1080,
                        "width": 1920,
                        "url": "https://video.url/1080p.mp4",
                        "has_audio": false
                    },
                    {
                        "format_id": "18",
                        "height": 360,
                        "width": 640,
                        "url": "https://video.url/360p.mp4",
                        "has_audio": true
                    }
                ],
                "audio_format": {
                    "format_id": "140",
                    "height": 0,
                    "url": "https://audio.url/audio.m4a",
                    "has_audio": true
                }
            }
        """.trimIndent()

        val playbackInfo = json.decodeFromString<PlaybackInfo>(playbackJson)

        assertEquals("Sample Video", playbackInfo.title)
        assertEquals(2, playbackInfo.videoFormats.size)
        assertEquals("1080p", playbackInfo.videoFormats[0].qualityLabel)
        assertEquals("360p", playbackInfo.videoFormats[1].qualityLabel)
        assertNotNull(playbackInfo.audioFormat)
        assertTrue(playbackInfo.videoFormats[1].hasAudio)
        assertFalse(playbackInfo.videoFormats[0].hasAudio)
    }

    @Test
    fun testChannelInfoSerialization() {
        val channelJson = """
            {
                "id": "UC12345",
                "title": "Tech Channel",
                "subscriber_count": 2500000,
                "avatar_url": "https://avatar.url/img.jpg",
                "video_count": 450
            }
        """.trimIndent()

        val channel = json.decodeFromString<ChannelInfo>(channelJson)

        assertEquals("UC12345", channel.id)
        assertEquals("Tech Channel", channel.title)
        assertEquals("2.5M subscribers", channel.displaySubscriberCount)
        assertEquals("https://avatar.url/img.jpg", channel.displayAvatar)
    }

    @Test
    fun testCommentSerialization() {
        val commentJson = """
            {
                "id": "c_123",
                "text": "Great video!",
                "author": "Viewer1",
                "likes": 42,
                "timestamp": "2 days ago"
            }
        """.trimIndent()

        val comment = json.decodeFromString<Comment>(commentJson)

        assertEquals("c_123", comment.id)
        assertEquals("Great video!", comment.text)
        assertEquals("Viewer1", comment.author)
        assertEquals(42, comment.likes)
        assertEquals("2 days ago", comment.displayTime)
    }

    @Test
    fun testSubscriptionSerialization() {
        val subJson = """
            {
                "id": 1,
                "channel_id": "UC9876",
                "channel_name": "Coding Tips",
                "channel_avatar": "https://avatar.url/tip.jpg"
            }
        """.trimIndent()

        val sub = json.decodeFromString<Subscription>(subJson)

        assertEquals("UC9876", sub.channelId)
        assertEquals("Coding Tips", sub.channelName)
    }

    @Test
    fun testDownloadProgressAndQuality() {
        val progress = DownloadProgress(
            videoId = "vid123",
            percent = 75.5f,
            speed = "3.2 MB/s",
            eta = "12s",
            status = DownloadStatus.DOWNLOADING,
            title = "Download Title",
            quality = Quality.RECOMMENDED.value
        )

        assertEquals("vid123", progress.videoId)
        assertEquals(75.5f, progress.percent, 0.01f)
        assertEquals("3.2 MB/s", progress.speed)
        assertEquals(DownloadStatus.DOWNLOADING, progress.status)
        assertEquals("recommended", Quality.RECOMMENDED.value)
    }
}
