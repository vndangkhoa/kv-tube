package com.kvtube.android

import com.kvtube.android.player.PlaybackManager
import org.junit.Assert.assertEquals
import org.junit.Test

class GatewayRewriteTest {
    private val host = "u.khoavo.vndns.net"

    @Test
    fun companionSegmentUrlsGoThroughTheGatewayProxy() {
        val src = "https://$host/companion/videoplayback?expire=1&itag=140&pot=a%3D%3D&host=rr4---sn-x.googlevideo.com"
        assertEquals(
            "https://$host/api/invidious/companion/videoplayback?expire=1&itag=140&pot=a%3D%3D&host=rr4---sn-x.googlevideo.com",
            PlaybackManager.rewriteGatewayUrl(src, host)
        )
    }

    @Test
    fun alreadyProxiedAndForeignUrlsAreUntouched() {
        val proxied = "https://$host/api/invidious/companion/videoplayback?itag=18"
        assertEquals(proxied, PlaybackManager.rewriteGatewayUrl(proxied, host))
        val foreign = "https://i.ytimg.com/vi/x/hq.jpg"
        assertEquals(foreign, PlaybackManager.rewriteGatewayUrl(foreign, host))
    }

    @Test
    fun portsAndRawInvidiousAreHandled() {
        val lan = "http://192.168.31.237:3241/companion/videoplayback?itag=1"
        assertEquals(
            "http://192.168.31.237:3241/api/invidious/companion/videoplayback?itag=1",
            PlaybackManager.rewriteGatewayUrl(lan, "192.168.31.237")
        )
        // raw Invidious (no gateway host): never rewritten
        assertEquals(lan, PlaybackManager.rewriteGatewayUrl(lan, null))
    }
}
