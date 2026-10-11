//
//  KVApi.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(Combine)
import Combine
#endif

// MARK: - ServerCheckResult

/// Result returned by `testServerConnection(url:)`.
public struct ServerCheckResult: Sendable {
    public let ok: Bool
    public let isGateway: Bool
    public let version: String
    public let latencyMs: Int64
    public let message: String
    public let troubleshootTip: String?

    public init(
        ok: Bool,
        isGateway: Bool = false,
        version: String = "",
        latencyMs: Int64 = 0,
        message: String = "",
        troubleshootTip: String? = nil
    ) {
        self.ok = ok
        self.isGateway = isGateway
        self.version = version
        self.latencyMs = latencyMs
        self.message = message
        self.troubleshootTip = troubleshootTip
    }
}

// MARK: - KVApiError

public enum KVApiError: LocalizedError {
    case serverNotConfigured
    case invalidURL(String)
    case requestFailed(statusCode: Int, message: String)
    case decodingFailed(Error)
    case networkError(Error)
    case unauthorized

    public var errorDescription: String? {
        switch self {
        case .serverNotConfigured:
            return "Server URL is not configured. Please set it in Settings."
        case .invalidURL(let str):
            return "Invalid URL: \(str)"
        case .requestFailed(let code, let message):
            return "Request failed (HTTP \(code)): \(message)"
        case .decodingFailed(let error):
            return "Failed to parse server response: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .unauthorized:
            return "Authorization required or session token expired."
        }
    }
}

// MARK: - KVApi Client

/// Invidious / KV-Tube API client for iOS.
/// Supports direct Invidious (/api/v1) and KV-Tube Web Gateway (/api/invidious/api/v1).
public class KVApi: @unchecked Sendable {
    public static let shared = KVApi()

#if canImport(Combine)
    @Published public private(set) var serverURL: String = ""
    @Published public private(set) var authToken: String = ""
    @Published public private(set) var isGateway: Bool = false
#else
    public private(set) var serverURL: String = ""
    public private(set) var authToken: String = ""
    public private(set) var isGateway: Bool = false
#endif

    /// Gateway mode probe state: nil = not probed yet, false = direct Invidious, true = KV-Tube web gateway.
    private var gatewayMode: Bool? = nil
    private let session: URLSession
    private let jsonDecoder: JSONDecoder

    public init(session: URLSession = .shared) {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        self.session = URLSession(configuration: configuration)
        self.jsonDecoder = JSONDecoder()
    }

    // MARK: - Cross-Platform Fallback Helpers

    private func defaultServerUrl() -> String {
        #if canImport(Combine)
        return SettingsStore.shared.cleanServerUrl()
        #else
        return ""
        #endif
    }

    private func defaultToken() -> String {
        #if canImport(Combine)
        return SettingsStore.shared.invidiousToken
        #else
        return ""
        #endif
    }

    private func defaultRegion() -> String {
        #if canImport(Combine)
        return SettingsStore.shared.region
        #else
        return "VN"
        #endif
    }

    // MARK: - Configuration

    /// Updates the server base URL and resets gateway probe cache if the host changed.
    public func setServerURL(_ url: String) {
        let clean = Self.normalizeUrl(url)
        if clean != serverURL {
            gatewayMode = nil
            isGateway = false
        }
        serverURL = clean
    }

    public func setServerUrl(_ url: String) {
        setServerURL(url)
    }

    /// Updates the Invidious authentication token (SID cookie or JSON bearer token).
    public func setAuthToken(_ token: String) {
        authToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public func setToken(_ token: String) {
        setAuthToken(token)
    }

    // MARK: - Parsing Helpers

    public func parseVideo(from data: Data) throws -> InvidiousVideo {
        try jsonDecoder.decode(InvidiousVideo.self, from: data)
    }

    public func parseTrending(from data: Data) throws -> [InvidiousTrendingVideo] {
        try jsonDecoder.decode([InvidiousTrendingVideo].self, from: data)
    }

    // MARK: - URL Normalization & Detection

    public static func normalizeUrl(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") {
            s.removeLast()
        }
        if s.isEmpty { return "" }
        if !s.hasPrefix("http://") && !s.hasPrefix("https://") {
            s = "https://" + s
        }
        // Only keep http:// if it's local IP / private network or has custom port
        let isLocalOrLan = s.contains("192.168.") || s.contains("127.0.0.1") ||
            s.contains("localhost") || s.contains("10.") || s.contains("172.") ||
            s.contains(".local") || s.range(of: ":\\d{2,5}", options: .regularExpression) != nil

        if s.hasPrefix("http://") && !isLocalOrLan {
            s = "https://" + s.dropFirst(7)
        }
        return s
    }

    /// Determines if a raw token string is a base64-encoded Invidious JSON token (Bearer) or a raw SID.
    public static func usesBearerToken(_ rawToken: String) -> Bool {
        let token = rawToken.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        if token.hasPrefix("{") { return true }

        var compact = token.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        compact = compact.filter { !$0.isWhitespace }
        while compact.hasSuffix("=") { compact.removeLast() }

        let remainder = compact.count % 4
        if remainder > 0 {
            compact += String(repeating: "=", count: 4 - remainder)
        }
        if compact.count < 16 { return false }

        guard let data = Data(base64Encoded: compact),
              let decoded = String(data: data, encoding: .utf8) else {
            return false
        }
        let trimmed = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.hasPrefix("{") && trimmed.contains("\"session\"")
    }

    /// Generates authentication headers for a given token string.
    public static func authHeaders(for token: String) -> [String: String] {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [:] }
        var headers: [String: String] = ["x-invidious-token": trimmed]
        if usesBearerToken(trimmed) {
            headers["Authorization"] = "Bearer \(trimmed)"
        } else {
            headers["Cookie"] = "SID=\(trimmed)"
        }
        return headers
    }

    private func applyAuth(to request: inout URLRequest) {
        let token = authToken.isEmpty ? defaultToken() : authToken
        let headers = Self.authHeaders(for: token)
        for (key, val) in headers {
            request.setValue(val, forHTTPHeaderField: key)
        }
    }

    // MARK: - Server Connection Probing & Diagnostics

    /// Auto-detects direct Invidious vs KV-Tube gateway and measures round-trip latency.
    public func testServerConnection(url: String) async -> ServerCheckResult {
        let clean = Self.normalizeUrl(url)
        guard !clean.isEmpty else {
            return ServerCheckResult(ok: false, message: "Enter a server address first.")
        }

        let start = Date().timeIntervalSince1970

        // 1. Try direct Invidious /api/v1/stats
        if let directResult = await probeStatsEndpoint(baseURL: clean, path: "/api/v1/stats", isGateway: false, startTime: start) {
            return directResult
        }

        // 2. Try KV-Tube Web Gateway /api/invidious/api/v1/stats
        if let gatewayResult = await probeStatsEndpoint(baseURL: clean, path: "/api/invidious/api/v1/stats", isGateway: true, startTime: start) {
            return gatewayResult
        }

        return ServerCheckResult(
            ok: false,
            message: "No Invidious API detected at this address.",
            troubleshootTip: "Verify that Invidious is running and the URL includes the correct port (e.g. :7601 or :3241) or reverse proxy path."
        )
    }

    private func probeStatsEndpoint(baseURL: String, path: String, isGateway: Bool, startTime: Double) async -> ServerCheckResult? {
        guard let url = URL(string: baseURL + path) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 8

        do {
            let (data, response) = try await session.data(for: request)
            let latency = Int64((Date().timeIntervalSince1970 - startTime) * 1000)

            guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
                return nil
            }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return nil
            }

            var ver = (json["version"] as? String) ?? ""
            if ver.isEmpty, let sw = json["software"] as? [String: Any] {
                ver = (sw["version"] as? String) ?? ""
            }
            if ver.isEmpty { ver = "detected" }

            let label = isGateway ? "KV-Tube Web Gateway (Invidious v\(ver), \(latency)ms)" : "Direct Invidious v\(ver) (\(latency)ms)"
            return ServerCheckResult(ok: true, isGateway: isGateway, version: ver, latencyMs: latency, message: label)
        } catch {
            return nil
        }
    }

    private func resolveGateway() async {
        let base = serverURL.isEmpty ? defaultServerUrl() : serverURL
        guard gatewayMode == nil && !base.isEmpty else { return }

        // Test direct /api/v1/stats first
        if let _ = await probeStatsEndpoint(baseURL: base, path: "/api/v1/stats", isGateway: false, startTime: Date().timeIntervalSince1970) {
            gatewayMode = false
            await MainActor.run { self.isGateway = false }
            return
        }

        // Test gateway /api/invidious/api/v1/stats
        if let _ = await probeStatsEndpoint(baseURL: base, path: "/api/invidious/api/v1/stats", isGateway: true, startTime: Date().timeIntervalSince1970) {
            gatewayMode = true
            await MainActor.run { self.isGateway = true }
            return
        }

        gatewayMode = false
        await MainActor.run { self.isGateway = false }
    }

    private func buildEndpoint(path: String, queryItems: [URLQueryItem] = []) async throws -> URL {
        var base = serverURL
        if base.isEmpty {
            base = defaultServerUrl()
        }
        guard !base.isEmpty else {
            throw KVApiError.serverNotConfigured
        }

        await resolveGateway()

        let cleanPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let apiPrefix = (gatewayMode == true) ? "/api/invidious/api/v1/" : "/api/v1/"
        let fullPath = base + apiPrefix + cleanPath

        guard var components = URLComponents(string: fullPath) else {
            throw KVApiError.invalidURL(fullPath)
        }

        if !queryItems.isEmpty {
            var items = components.queryItems ?? []
            items.append(contentsOf: queryItems)
            components.queryItems = items
        }

        guard let finalURL = components.url else {
            throw KVApiError.invalidURL(fullPath)
        }
        return finalURL
    }

    // Resolves stream and thumbnail URLs, prepending the server or gateway proxy if relative.
    private func resolveRelativeURL(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        let base = serverURL.isEmpty ? defaultServerUrl() : serverURL

        if trimmed.hasPrefix("/") {
            if gatewayMode == true {
                return "\(base)/api/invidious\(trimmed)"
            } else {
                return "\(base)\(trimmed)"
            }
        }

        if let url = URL(string: trimmed), let host = url.host?.lowercased() {
            let isGoogleCdn = host.contains("googlevideo.com") || host.contains("ytimg.com") || host.contains("youtube.com")
            if !isGoogleCdn && (url.path.hasPrefix("/videoplayback") || url.path.hasPrefix("/latest_version") || url.path.hasPrefix("/api/") || url.path.hasPrefix("/vi/")) {
                let query = url.query.map { "?\($0)" } ?? ""
                if gatewayMode == true {
                    return "\(base)/api/invidious\(url.path)\(query)"
                } else {
                    return "\(base)\(url.path)\(query)"
                }
            }
        }

        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            return trimmed
        }
        if trimmed.hasPrefix("//") {
            return "https:" + trimmed
        }
        return trimmed
    }

    // MARK: - Generic Networking Helpers

    private func get<T: Decodable>(path: String, queryItems: [URLQueryItem] = [], requiresAuth: Bool = false) async throws -> T {
        let url = try await buildEndpoint(path: path, queryItems: queryItems)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if requiresAuth { applyAuth(to: &request) }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw KVApiError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw KVApiError.requestFailed(statusCode: 0, message: "No HTTP response")
        }

        if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
            throw KVApiError.unauthorized
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? ""
            throw KVApiError.requestFailed(statusCode: httpResponse.statusCode, message: msg)
        }

        do {
            return try jsonDecoder.decode(T.self, from: data)
        } catch {
            throw KVApiError.decodingFailed(error)
        }
    }

    // MARK: - Public API Endpoints

    /// Fetches trending videos for a specified country/region code (e.g. "VN", "US").
    public func fetchTrending(region: String = "VN", page: Int? = nil) async throws -> [VideoData] {
        var queryItems: [URLQueryItem] = []
        if !region.isEmpty && region.uppercased() != "GLOBAL" {
            queryItems.append(URLQueryItem(name: "region", value: region))
        }
        if let page = page, page > 1 {
            queryItems.append(URLQueryItem(name: "page", value: "\(page)"))
        }

        let videos: [VideoData] = try await get(path: "trending", queryItems: queryItems)
        return videos.map { sanitizeVideo($0) }
    }

    /// Fetches trending with optional region.
    public func fetchTrending(region: String? = nil, page: Int? = nil) async throws -> [VideoData] {
        let reg = region ?? defaultRegion()
        return try await fetchTrending(region: reg, page: page)
    }

    /// Fetches home feed with fallback to trending.
    public func fetchHomeFeed(page: Int = 1) async throws -> [VideoData] {
        return try await fetchTrending(region: defaultRegion(), page: page)
    }

    /// Searches videos, channels, and playlists.
    public func search(
        query: String,
        page: Int? = nil,
        sort: String? = nil,
        date: String? = nil,
        duration: String? = nil,
        type: String? = nil
    ) async throws -> [VideoData] {
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "type", value: type ?? "video")
        ]
        if let page = page, page > 1 {
            queryItems.append(URLQueryItem(name: "page", value: "\(page)"))
        }
        if let sort = sort, !sort.isEmpty {
            queryItems.append(URLQueryItem(name: "sort_by", value: sort))
        }
        if let date = date, !date.isEmpty {
            queryItems.append(URLQueryItem(name: "date", value: date))
        }
        if let duration = duration, !duration.isEmpty {
            queryItems.append(URLQueryItem(name: "duration", value: duration))
        }

        let videos: [VideoData] = try await get(path: "search", queryItems: queryItems)
        return videos.map { sanitizeVideo($0) }
    }

    /// Searches with typed enum parameters.
    public func search(
        query: String,
        page: Int = 1,
        sortBy: SearchSortBy = .relevance,
        date: SearchUploadDate = .all,
        type: SearchType = .all,
        duration: SearchDuration = .all,
        region: String = "VN"
    ) async throws -> [SearchResultItem] {
        let targetType = (type == .all) ? "video" : type.rawValue
        let videos = try await search(
            query: query,
            page: page,
            sort: sortBy.rawValue,
            date: date.rawValue,
            duration: duration.rawValue,
            type: targetType
        )
        return videos.map { .video($0) }
    }

    /// Fetches search autocomplete suggestions for query text.
    public func fetchSuggestions(query: String) async -> [String] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        do {
            let url = try await buildEndpoint(path: "search/suggestions", queryItems: [URLQueryItem(name: "q", value: trimmed)])
            var request = URLRequest(url: url)
            request.httpMethod = "GET"

            let (data, response) = try await session.data(for: request)
            if let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                if let list = try? jsonDecoder.decode([String].self, from: data) {
                    return list
                }
                struct SuggestionsWrapper: Codable {
                    let suggestions: [String]?
                }
                if let wrapper = try? jsonDecoder.decode(SuggestionsWrapper.self, from: data), let s = wrapper.suggestions {
                    return s
                }
            }
        } catch {
            // Fallback to Google YouTube suggestions API (CORS-free on native iOS)
            if let encoded = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
               let url = URL(string: "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=\(encoded)") {
                var req = URLRequest(url: url)
                req.timeoutInterval = 5.0
                if let (data, _) = try? await session.data(for: req),
                   let arr = (try? JSONSerialization.jsonObject(with: data)) as? [Any],
                   arr.count > 1,
                   let list = arr[1] as? [String] {
                    return list
                }
            }
        }
        return []
    }

    /// Fetches detailed video information.
    public func fetchVideo(videoId: String) async throws -> VideoData {
        let video: VideoData = try await get(path: "videos/\(videoId)")
        return sanitizeVideo(video)
    }

    /// Fetches video details and recommended/related videos.
    public func fetchVideoDetails(videoId: String) async throws -> (video: VideoData, related: [VideoData]) {
        let video = try await fetchVideo(videoId: videoId)
        let related = (video.recommendedVideos ?? []).map { sanitizeVideo($0) }
        return (video: video, related: related)
    }

    /// Fetches recommended/related videos for a video ID.
    public func fetchRelatedVideos(videoId: String) async throws -> [VideoData] {
        let details = try await fetchVideoDetails(videoId: videoId)
        return details.related
    }

    /// Fetches dislike counts and voting data from RYD.
    public func fetchDislikes(videoId: String) async -> RYDData? {
        await RYDService.shared.fetchVotes(videoId: videoId)
    }

    /// Fetches playback info (progressive and adaptive streams, HLS, DASH).
    /// First requests with `local=true` (proxied by Invidious), falling back to direct video info if streams are absent.
    public func fetchPlaybackInfo(videoId: String) async throws -> PlaybackInfo {
        await resolveGateway()

        // 1. Try local=true first
        do {
            let info: PlaybackInfo = try await get(path: "videos/\(videoId)", queryItems: [URLQueryItem(name: "local", value: "true")])
            if hasStreams(info) {
                return sanitizePlaybackInfo(info)
            }
        } catch {
            // Fallback below
        }

        // 2. Fallback to direct without local=true
        let fallback: PlaybackInfo = try await get(path: "videos/\(videoId)")
        return sanitizePlaybackInfo(fallback)
    }

    private func hasStreams(_ info: PlaybackInfo) -> Bool {
        let prog = (info.formatStreams ?? []).contains { !$0.url.isEmpty }
        let adapt = (info.adaptiveFormats ?? []).contains { !$0.url.isEmpty }
        return prog || adapt || (info.hlsUrl != nil && !info.hlsUrl!.isEmpty)
    }

    /// Fetches paginated comments for a video.
    public func fetchComments(videoId: String, continuation: String? = nil) async throws -> CommentsPage {
        var queryItems: [URLQueryItem] = []
        if let cont = continuation, !cont.isEmpty {
            queryItems.append(URLQueryItem(name: "continuation", value: cont))
        }
        let page: CommentsPage = try await get(path: "comments/\(videoId)", queryItems: queryItems)
        return page
    }

    /// Fetches channel metadata, banner, avatar, subscriber count, and latest videos.
    public func fetchChannel(channelId: String) async throws -> ChannelInfo {
        let info: ChannelInfo = try await get(path: "channels/\(channelId)")
        return sanitizeChannel(info)
    }

    /// Fetches channel videos with pagination support.
    public func fetchChannelVideos(channelId: String, page: Int? = nil) async throws -> [VideoData] {
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "sort_by", value: "newest")
        ]
        if let page = page, page > 1 {
            queryItems.append(URLQueryItem(name: "page", value: "\(page)"))
        }

        do {
            let url = try await buildEndpoint(path: "channels/\(channelId)/videos", queryItems: queryItems)
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                return []
            }

            if let direct = try? jsonDecoder.decode([VideoData].self, from: data) {
                return direct.map { sanitizeVideo($0) }
            }

            struct VideosWrapper: Decodable {
                let videos: [VideoData]?
            }
            if let wrapper = try? jsonDecoder.decode(VideosWrapper.self, from: data), let list = wrapper.videos {
                return list.map { sanitizeVideo($0) }
            }
            return []
        } catch {
            return []
        }
    }

    /// Fetches both channel info and channel videos.
    public func fetchChannelPage(channelId: String) async throws -> (channel: ChannelInfo, videos: [VideoData]) {
        async let ch = fetchChannel(channelId: channelId)
        async let vids = fetchChannelVideos(channelId: channelId)
        return try await (channel: ch, videos: vids)
    }

    /// Fetches channel playlists.
    public func fetchChannelPlaylists(channelId: String) async throws -> [PlaylistData] {
        do {
            let url = try await buildEndpoint(path: "channels/\(channelId)/playlists")
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                return []
            }

            if let direct = try? jsonDecoder.decode([PlaylistData].self, from: data) {
                return direct
            }

            struct PlaylistsWrapper: Decodable {
                let playlists: [PlaylistData]?
            }
            if let wrapper = try? jsonDecoder.decode(PlaylistsWrapper.self, from: data), let pls = wrapper.playlists {
                return pls
            }
            return []
        } catch {
            return []
        }
    }

    /// Fetches authenticated user subscriptions (/api/v1/auth/subscriptions).
    public func fetchSubscriptions() async throws -> [Subscription] {
        let subs: [Subscription] = try await get(path: "auth/subscriptions", requiresAuth: true)
        return subs.filter { !$0.authorId.isEmpty }
    }

    public func fetchRemoteSubscriptions() async throws -> [Subscription] {
        try await fetchSubscriptions()
    }

    public func fetchSponsorSegments(videoId: String) async -> [SponsorSegment] {
        await SponsorBlockService.shared.fetchSkipSegments(videoId: videoId)
    }

    /// Fetches subscription feed (/api/v1/auth/feed) with notification merging and recency ordering.
    public func fetchSubscriptionFeed(page: Int? = nil) async throws -> [VideoData] {
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "max_results", value: "60")
        ]
        if let page = page, page > 1 {
            queryItems.append(URLQueryItem(name: "page", value: "\(page)"))
        }

        let url = try await buildEndpoint(path: "auth/feed", queryItems: queryItems)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        applyAuth(to: &request)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            if let http = response as? HTTPURLResponse, http.statusCode == 401 || http.statusCode == 403 {
                throw KVApiError.unauthorized
            }
            throw KVApiError.requestFailed(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0, message: "Feed fetch failed")
        }

        // Try direct array
        if let directList = try? jsonDecoder.decode([VideoData].self, from: data) {
            return deduplicateVideos(directList.map { sanitizeVideo($0) })
        }

        // Invidious often packages feed as {"notifications": [...], "videos": [...]}
        struct FeedWrapper: Codable {
            let notifications: [VideoData]?
            let videos: [VideoData]?
        }

        if let wrapper = try? jsonDecoder.decode(FeedWrapper.self, from: data) {
            var combined: [VideoData] = []
            if let notifs = wrapper.notifications { combined.append(contentsOf: notifs) }
            if let vids = wrapper.videos { combined.append(contentsOf: vids) }
            return deduplicateVideos(combined.map { sanitizeVideo($0) })
        }

        return []
    }

    /// Subscribes to a channel on the server: POST /api/v1/auth/subscriptions/{channelId}.
    public func subscribe(channelId: String) async throws -> Bool {
        let url = try await buildEndpoint(path: "auth/subscriptions/\(channelId)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        applyAuth(to: &request)

        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { return false }
        return (200...299).contains(http.statusCode)
    }

    /// Unsubscribes from a channel on the server: DELETE /api/v1/auth/subscriptions/{channelId}.
    public func unsubscribe(channelId: String) async throws -> Bool {
        let url = try await buildEndpoint(path: "auth/subscriptions/\(channelId)")
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        applyAuth(to: &request)

        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { return false }
        return (200...299).contains(http.statusCode)
    }

    /// Quick server health check against stats endpoint.
    public func checkServerStatus() async -> Bool {
        var base = serverURL
        if base.isEmpty {
            base = defaultServerUrl()
        }
        guard !base.isEmpty else { return false }
        do {
            let url = try await buildEndpoint(path: "stats")
            var request = URLRequest(url: url)
            request.timeoutInterval = 5
            let (_, response) = try await session.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    // MARK: - Sanitization Helpers

    private func sanitizeVideo(_ v: VideoData) -> VideoData {
        var copy = v
        copy.videoThumbnails = v.videoThumbnails.map {
            Thumbnail(quality: $0.quality, url: resolveRelativeURL($0.url), width: $0.width, height: $0.height)
        }
        if let authorThumbs = v.authorThumbnails {
            copy.authorThumbnails = authorThumbs.map {
                Thumbnail(quality: $0.quality, url: resolveRelativeURL($0.url), width: $0.width, height: $0.height)
            }
        }
        return copy
    }

    private func sanitizePlaybackInfo(_ info: PlaybackInfo) -> PlaybackInfo {
        var copy = info
        if let hls = info.hlsUrl, !hls.isEmpty {
            copy.hlsUrl = resolveRelativeURL(hls)
        }
        if let dash = info.dashUrl, !dash.isEmpty {
            copy.dashUrl = resolveRelativeURL(dash)
        }
        if let formatStreams = info.formatStreams {
            copy.formatStreams = formatStreams.map {
                var s = $0
                s.url = resolveRelativeURL($0.url)
                return s
            }
        }
        if let adaptiveFormats = info.adaptiveFormats {
            copy.adaptiveFormats = adaptiveFormats.map {
                var s = $0
                s.url = resolveRelativeURL($0.url)
                return s
            }
        }
        return copy
    }

    private func sanitizeChannel(_ c: ChannelInfo) -> ChannelInfo {
        var copy = c
        if let banners = c.authorBanners {
            copy.authorBanners = banners.map {
                Thumbnail(quality: $0.quality, url: resolveRelativeURL($0.url), width: $0.width, height: $0.height)
            }
        }
        if let thumbs = c.authorThumbnails {
            copy.authorThumbnails = thumbs.map {
                Thumbnail(quality: $0.quality, url: resolveRelativeURL($0.url), width: $0.width, height: $0.height)
            }
        }
        if let vids = c.latestVideos {
            copy.latestVideos = vids.map { sanitizeVideo($0) }
        }
        return copy
    }

    private func deduplicateVideos(_ list: [VideoData]) -> [VideoData] {
        var seen = Set<String>()
        var result: [VideoData] = []
        for item in list {
            guard !item.videoId.isEmpty, !seen.contains(item.videoId) else { continue }
            seen.insert(item.videoId)
            result.append(item)
        }
        return result
    }
}

#if canImport(Combine)
extension KVApi: ObservableObject {}
#endif

