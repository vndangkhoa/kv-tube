//
//  KVApiTests.swift
//  KVTubeTests
//
//  Unit tests for Invidious API URL normalization, token detection, and JSON parsing.
//

import XCTest
#if canImport(KVTubeCore)
import KVTubeCore
#elseif canImport(KVTube)
@testable import KVTube
#endif

final class KVApiTests: XCTestCase {

    // MARK: - URL Normalization Tests

    func testNormalizeUrl_addsHttpsToBareDomain() {
        let input = "yewtu.be"
        let expected = "https://yewtu.be"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_stripsTrailingSlashes() {
        let input = "https://invidious.nerdvpn.de///"
        let expected = "https://invidious.nerdvpn.de"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_handlesEmptyAndWhitespace() {
        XCTAssertEqual(KVApi.normalizeUrl(""), "")
        XCTAssertEqual(KVApi.normalizeUrl("   "), "")
        XCTAssertEqual(KVApi.normalizeUrl("\n\t"), "")
    }

    func testNormalizeUrl_upgradesPublicHttpToHttps() {
        let input = "http://invidious.projectsegfau.lt"
        let expected = "https://invidious.projectsegfau.lt"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_preservesLocalLan192() {
        let input = "http://192.168.1.150:7601/"
        let expected = "http://192.168.1.150:7601"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_preservesLocalhost() {
        let input = "http://localhost:3000"
        let expected = "http://localhost:3000"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_preservesLoopback127() {
        let input = "http://127.0.0.1:8080"
        let expected = "http://127.0.0.1:8080"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_preservesPrivateClassA10() {
        let input = "http://10.0.0.25:7601"
        let expected = "http://10.0.0.25:7601"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_preservesPrivateClassB172() {
        let input = "http://172.16.0.10:3000"
        let expected = "http://172.16.0.10:3000"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_preservesLocalDomain() {
        let input = "http://nas-synology.local:5000"
        let expected = "http://nas-synology.local:5000"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    func testNormalizeUrl_preservesCustomPortHttp() {
        let input = "http://myinvidious.internal:7601"
        let expected = "http://myinvidious.internal:7601"
        XCTAssertEqual(KVApi.normalizeUrl(input), expected)
    }

    // MARK: - Invidious Token Format Detection Tests

    func testUsesBearerToken_rawJson() {
        let token = "{\"session\":\"eyJhbGciOiJIUzI1NiJ9\"}"
        XCTAssertTrue(KVApi.usesBearerToken(token))
    }

    func testUsesBearerToken_quotedRawJson() {
        let token = "\"{\\\"session\\\":\\\"abcdef123456\\\"}\""
        XCTAssertTrue(KVApi.usesBearerToken(token))
    }

    func testUsesBearerToken_base64EncodedJson() {
        // {"session":"auth_session_token_1234567890"}
        let rawPayload = "{\"session\":\"auth_session_token_1234567890\"}"
        let base64Token = Data(rawPayload.utf8).base64EncodedString()
        XCTAssertTrue(KVApi.usesBearerToken(base64Token))
    }

    func testUsesBearerToken_urlSafeBase64WithoutPadding() {
        let rawPayload = "{\"session\":\"test+token/with_special-characters\"}"
        let base64 = Data(rawPayload.utf8).base64EncodedString()
        let urlSafeNoPad = base64
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: "="))
        XCTAssertTrue(KVApi.usesBearerToken(urlSafeNoPad))
    }

    func testUsesBearerToken_opaqueSidCookieReturnsFalse() {
        let sidCookie = "v1:a8f9c0e2b4d6f8a0c2e4b6d8f0a2c4e6:1234567890"
        XCTAssertFalse(KVApi.usesBearerToken(sidCookie))
    }

    func testUsesBearerToken_arbitraryStringReturnsFalse() {
        XCTAssertFalse(KVApi.usesBearerToken("session_cookie_abc_xyz"))
        XCTAssertFalse(KVApi.usesBearerToken(""))
        XCTAssertFalse(KVApi.usesBearerToken("   "))
    }

    func testAuthHeaders_bearerToken() {
        let token = "{\"session\":\"token123\"}"
        let headers = KVApi.authHeaders(for: token)
        XCTAssertEqual(headers["x-invidious-token"], token)
        XCTAssertEqual(headers["Authorization"], "Bearer \(token)")
        XCTAssertNil(headers["Cookie"])
    }

    func testAuthHeaders_sidCookieToken() {
        let sid = "opaque_sid_cookie_value_98765"
        let headers = KVApi.authHeaders(for: sid)
        XCTAssertEqual(headers["x-invidious-token"], sid)
        XCTAssertEqual(headers["Cookie"], "SID=\(sid)")
        XCTAssertNil(headers["Authorization"])
    }

    func testAuthHeaders_emptyTokenReturnsEmpty() {
        let headers = KVApi.authHeaders(for: "")
        XCTAssertTrue(headers.isEmpty)
    }

    // MARK: - JSON Parsing Tests

    func testParseInvidiousVideo_success() throws {
        let json = """
        {
            "videoId": "dQw4w9WgXcQ",
            "title": "Rick Astley - Never Gonna Give You Up",
            "description": "Official Music Video for Never Gonna Give You Up",
            "author": "Rick Astley",
            "authorId": "UCuAXFkgsw1L7xaCfnd5JJOw",
            "lengthSeconds": 213,
            "viewCount": 1500000000,
            "published": 1256428800,
            "publishedText": "14 years ago",
            "formatStreams": [
                {
                    "url": "https://googlevideo.com/videoplayback?itag=18",
                    "itag": "18",
                    "type": "video/mp4; codecs=\\"avc1.42001E, mp4a.40.2\\"",
                    "quality": "medium",
                    "qualityLabel": "360p",
                    "resolution": "640x360"
                }
            ],
            "adaptiveFormats": [
                {
                    "url": "https://googlevideo.com/videoplayback?itag=137",
                    "itag": "137",
                    "type": "video/mp4; codecs=\\"avc1.640028\\"",
                    "quality": "hd1080",
                    "qualityLabel": "1080p",
                    "bitrate": "4500000",
                    "resolution": "1920x1080",
                    "fps": 30
                }
            ],
            "videoThumbnails": [
                {
                    "quality": "maxres",
                    "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
                    "width": 1280,
                    "height": 720
                }
            ],
            "likeCount": 16000000
        }
        """

        let data = Data(json.utf8)
        let api = KVApi()
        let video = try api.parseVideo(from: data)

        XCTAssertEqual(video.videoId, "dQw4w9WgXcQ")
        XCTAssertEqual(video.title, "Rick Astley - Never Gonna Give You Up")
        XCTAssertEqual(video.author, "Rick Astley")
        XCTAssertEqual(video.lengthSeconds, 213)
        XCTAssertEqual(video.viewCount, 1500000000)
        XCTAssertEqual(video.formatStreams?.count, 1)
        XCTAssertEqual(video.formatStreams?.first?.qualityLabel, "360p")
        XCTAssertEqual(video.adaptiveFormats?.count, 1)
        XCTAssertEqual(video.adaptiveFormats?.first?.qualityLabel, "1080p")
        XCTAssertEqual(video.videoThumbnails?.first?.quality, "maxres")
        XCTAssertEqual(video.likeCount, 16000000)
    }

    func testParseInvidiousTrending_success() throws {
        let json = """
        [
            {
                "videoId": "abc12345",
                "title": "Trending Video 1",
                "author": "Tech Creator",
                "authorId": "UC1234567890",
                "viewCount": 250000,
                "published": 1690000000,
                "publishedText": "2 hours ago",
                "lengthSeconds": 600,
                "videoThumbnails": [
                    {
                        "quality": "high",
                        "url": "https://i.ytimg.com/vi/abc12345/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                ]
            },
            {
                "videoId": "def67890",
                "title": "Trending Video 2",
                "author": "Music Channel",
                "authorId": "UC0987654321",
                "viewCount": 1200000,
                "lengthSeconds": 180
            }
        ]
        """

        let data = Data(json.utf8)
        let api = KVApi()
        let trending = try api.parseTrending(from: data)

        XCTAssertEqual(trending.count, 2)
        XCTAssertEqual(trending[0].videoId, "abc12345")
        XCTAssertEqual(trending[0].title, "Trending Video 1")
        XCTAssertEqual(trending[0].author, "Tech Creator")
        XCTAssertEqual(trending[0].viewCount, 250000)
        XCTAssertEqual(trending[0].lengthSeconds, 600)
        XCTAssertEqual(trending[1].videoId, "def67890")
        XCTAssertEqual(trending[1].title, "Trending Video 2")
        XCTAssertNil(trending[1].videoThumbnails)
    }

    func testParseInvidiousVideo_missingOptionalFieldsDoesNotThrow() throws {
        let minimalJson = """
        {
            "videoId": "minimal123",
            "title": "Minimal Video",
            "author": "Channel",
            "authorId": "UC_minimal",
            "lengthSeconds": 120,
            "viewCount": 100
        }
        """

        let data = Data(minimalJson.utf8)
        let api = KVApi()
        let video = try api.parseVideo(from: data)

        XCTAssertEqual(video.videoId, "minimal123")
        XCTAssertEqual(video.title, "Minimal Video")
        XCTAssertNil(video.description)
        XCTAssertNil(video.formatStreams)
        XCTAssertNil(video.adaptiveFormats)
        XCTAssertNil(video.videoThumbnails)
    }
}
