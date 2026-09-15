package com.kvtube.android

import com.kvtube.android.data.api.KVApi
import com.kvtube.android.data.local.ThumbnailRouter
import com.kvtube.android.ui.SettingsViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InstanceSwitchAndRoutingTest {

    @Test
    fun `normalizeUrl adds https scheme when missing`() {
        assertEquals("https://yt.khoavo.myds.me", KVApi.normalizeUrl("yt.khoavo.myds.me"))
        assertEquals("https://ut.khoavo.myds.me", KVApi.normalizeUrl("  ut.khoavo.myds.me/  "))
    }

    @Test
    fun `normalizeUrl upgrades public http to https`() {
        assertEquals("https://yt.khoavo.myds.me", KVApi.normalizeUrl("http://yt.khoavo.myds.me"))
        assertEquals("https://inv.nadeko.net", KVApi.normalizeUrl("http://inv.nadeko.net/"))
    }

    @Test
    fun `normalizeUrl preserves LAN and localhost http`() {
        assertEquals("http://192.168.1.150:3000", KVApi.normalizeUrl("http://192.168.1.150:3000/"))
        assertEquals("http://localhost:8080", KVApi.normalizeUrl("http://localhost:8080/"))
        assertEquals("http://127.0.0.1:7601", KVApi.normalizeUrl("http://127.0.0.1:7601/"))
    }

    @Test
    fun `normalizeUrl trims whitespace and trailing slashes`() {
        assertEquals("https://example.com:8443", KVApi.normalizeUrl("   https://example.com:8443///   "))
        assertEquals("", KVApi.normalizeUrl("   "))
    }

    @Test
    fun `ThumbnailRouter in direct Invidious mode routes via server base`() {
        ThumbnailRouter.setServer("https://yt.khoavo.myds.me", gateway = false)
        val url = ThumbnailRouter.video("abc123xyz")
        assertEquals("https://yt.khoavo.myds.me/vi/abc123xyz/hqdefault.jpg", url)

        val routed = ThumbnailRouter.route("https://i.ytimg.com/vi/abc123xyz/hqdefault.jpg", "abc123xyz")
        assertEquals("https://yt.khoavo.myds.me/vi/abc123xyz/hqdefault.jpg", routed)
    }

    @Test
    fun `ThumbnailRouter in gateway mode routes via api invidious path`() {
        ThumbnailRouter.setServer("https://ut.khoavo.myds.me", gateway = true)
        val url = ThumbnailRouter.video("abc123xyz")
        assertEquals("https://ut.khoavo.myds.me/api/invidious/vi/abc123xyz/hqdefault.jpg", url)

        val routed = ThumbnailRouter.route("https://i.ytimg.com/vi/abc123xyz/hqdefault.jpg", "abc123xyz")
        assertEquals("https://ut.khoavo.myds.me/api/invidious/vi/abc123xyz/hqdefault.jpg", routed)

        // Rewrites an unproxied Invidious /vi/ URL to gateway path
        val unproxied = "https://ut.khoavo.myds.me/vi/abc123xyz/hqdefault.jpg"
        assertEquals("https://ut.khoavo.myds.me/api/invidious/vi/abc123xyz/hqdefault.jpg", ThumbnailRouter.route(unproxied, "abc123xyz"))
    }

    @Test
    fun `Preset instances are available for quick selection`() {
        assertTrue(SettingsViewModel.PRESET_INSTANCES.isNotEmpty())
        val urls = SettingsViewModel.PRESET_INSTANCES.map { it.first }
        assertTrue(urls.contains("https://ut.khoavo.myds.me"))
        assertTrue(urls.contains("https://yt.khoavo.myds.me"))
    }
}
