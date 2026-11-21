package com.kvtube.tv

import com.kvtube.tv.player.TvStreamUrls
import org.junit.Assert.assertEquals
import org.junit.Test

class TvStreamUrlsTest {
    private val host = "u.khoavo.vndns.net"

    @Test
    fun manifestUrlFollowsGatewayOrRawInvidious() {
        assertEquals(
            "https://$host/api/invidious/api/manifest/dash/id/abc",
            TvStreamUrls.dashManifestUrl("https://$host/", "abc", gateway = true)
        )
        assertEquals(
            "http://192.168.1.5:7601/api/manifest/dash/id/abc?local=true",
            TvStreamUrls.dashManifestUrl("http://192.168.1.5:7601", "abc", gateway = false)
        )
    }

    @Test
    fun companionSegmentsAreRoutedThroughTheGatewayProxy() {
        val src = "https://$host/companion/videoplayback?itag=140&pot=a%3D%3D"
        assertEquals(
            "https://$host/api/invidious/companion/videoplayback?itag=140&pot=a%3D%3D",
            TvStreamUrls.rewriteGatewayUrl(src, host)
        )
    }

    @Test
    fun alreadyProxiedForeignAndRawUrlsAreUntouched() {
        val proxied = "https://$host/api/invidious/companion/videoplayback?x=1"
        assertEquals(proxied, TvStreamUrls.rewriteGatewayUrl(proxied, host))
        val foreign = "https://rr1---sn-x.googlevideo.com/videoplayback?x=1"
        assertEquals(foreign, TvStreamUrls.rewriteGatewayUrl(foreign, host))
        val raw = "http://192.168.1.5:7601/videoplayback?x=1"
        assertEquals(raw, TvStreamUrls.rewriteGatewayUrl(raw, null))
    }
}
