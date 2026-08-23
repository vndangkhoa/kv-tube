package com.kvtube.android

import com.kvtube.android.data.api.KVApi.Companion.usesBearerToken
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Token classification for the authenticated-endpoint credential headers.
 *
 * Invidious authenticates either with `Authorization: Bearer <token>` (token =
 * JSON payload, raw or base64/base64url encoded) or with a raw session id as
 * `Cookie: SID=<sid>`. A Bearer header the instance cannot decode fails hard
 * even when a valid SID cookie is present, so the two must never be mixed.
 */
class TokenAuthTest {

    /** SID cookie value of a production instance (base64 of random bytes). */
    private val sidToken = "2Z_jxNGirYzCUFGsNKGBhbIDd24a8f0-FkbymXP6dME="

    @Test
    fun `raw session id uses SID cookie`() {
        assertFalse(usesBearerToken(sidToken))
    }

    @Test
    fun `old-style hex session id uses SID cookie`() {
        assertFalse(usesBearerToken("2610ae945bf11546530210d7fb4d68f8"))
    }

    @Test
    fun `raw JSON token uses bearer`() {
        assertTrue(usesBearerToken("""{"session":"abc","expires":1735689600}"""))
    }

    @Test
    fun `standard base64 encoded token uses bearer`() {
        assertTrue(usesBearerToken("eyJzZXNzaW9uIjoiczNjcjN0IiwiZXhwaXJlcyI6MTczNTY4OTYwMH0="))
    }

    @Test
    fun `url-safe unpadded base64 token uses bearer`() {
        assertTrue(usesBearerToken("eyJzZXNzaW9uIjoiczNjcjN0IiwiZXhwaXJlcyI6MTczNTY4OTYwMH0"))
    }

    @Test
    fun `pasted token with whitespace and quotes still classifies`() {
        assertTrue(usesBearerToken("""  "{\"session\":\"abc\"}"  """.trim()))
        assertFalse(usesBearerToken("  $sidToken\n"))
    }

    @Test
    fun `garbage falls back to SID cookie`() {
        assertFalse(usesBearerToken(""))
        assertFalse(usesBearerToken("short"))
        assertFalse(usesBearerToken("!!!!not-base64-at-all!!!!"))
    }
}
