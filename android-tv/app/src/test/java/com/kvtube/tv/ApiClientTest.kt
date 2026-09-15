package com.kvtube.tv

import com.kvtube.tv.data.api.ApiClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiClientTest {

    @Test
    fun testNormalizeInstanceUrl() {
        assertEquals("http://192.168.31.71:7601", ApiClient.normalizeInstanceUrl("192.168.31.71:7601"))
        assertEquals("http://192.168.31.71:7601", ApiClient.normalizeInstanceUrl("http://192.168.31.71:7601/"))
        assertEquals("http://192.168.31.71:7601", ApiClient.normalizeInstanceUrl("http://192.168.31.71:7601/api/v1"))
        assertEquals("http://192.168.31.71:7601", ApiClient.normalizeInstanceUrl("http://192.168.31.71:7601/api/v1/"))
        assertEquals("http://192.168.31.71:3241", ApiClient.normalizeInstanceUrl("http://192.168.31.71:3241/api/invidious/api/v1"))
        assertEquals("https://invidious.nerdvpn.de", ApiClient.normalizeInstanceUrl("invidious.nerdvpn.de"))
        assertEquals("https://invidious.nerdvpn.de", ApiClient.normalizeInstanceUrl("https://invidious.nerdvpn.de/"))
        assertEquals(ApiClient.DEFAULT_INSTANCE, ApiClient.normalizeInstanceUrl(""))
    }

    @Test
    fun testRewriteStreamUrl() {
        ApiClient.setInstance("http://192.168.31.71:7601")

        // Relative paths should resolve against active baseUrl
        val relative = ApiClient.rewriteStreamUrl("/latest_version?id=abc&itag=22")
        assertEquals("http://192.168.31.71:7601/latest_version?id=abc&itag=22", relative)

        // Protocol relative
        val proto = ApiClient.rewriteStreamUrl("//i.ytimg.com/vi/abc/mqdefault.jpg")
        assertEquals("http://i.ytimg.com/vi/abc/mqdefault.jpg", proto)

        // Invidious server internal host leak: rewrite host to configured instance
        val leakedManifest = ApiClient.rewriteStreamUrl("https://yt.khoavo.myds.me/api/manifest/dash/id/TE4aoC3cLNM")
        assertEquals("http://192.168.31.71:7601/api/manifest/dash/id/TE4aoC3cLNM", leakedManifest)

        val leakedVideoPlayback = ApiClient.rewriteStreamUrl("https://yt.khoavo.myds.me/videoplayback?expire=123&itag=140")
        assertEquals("http://192.168.31.71:7601/videoplayback?expire=123&itag=140", leakedVideoPlayback)

        // LAN URLs stay http
        val lanUrl = ApiClient.rewriteStreamUrl("http://192.168.31.71:7601/some/stream")
        assertEquals("http://192.168.31.71:7601/some/stream", lanUrl)

        // Direct external googlevideo URL untouched
        val gvideo = "https://rr2---sn-8qj-nbo6r.googlevideo.com/videoplayback?expire=123"
        assertEquals(gvideo, ApiClient.rewriteStreamUrl(gvideo))
    }

    @Test
    fun testInstanceFlowUpdates() {
        ApiClient.setInstance("http://192.168.1.100:7601")
        assertEquals("http://192.168.1.100:7601", ApiClient.instanceFlow.value)

        ApiClient.setInstance("https://inv.example.com")
        assertEquals("https://inv.example.com", ApiClient.instanceFlow.value)
    }
}
