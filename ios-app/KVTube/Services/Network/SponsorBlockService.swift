//
//  SponsorBlockService.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Service for fetching crowdsourced SponsorBlock skip segments for YouTube videos,
/// calculating seek targets across boundaries, and filtering active categories.
public final class SponsorBlockService: @unchecked Sendable {
    public static let shared = SponsorBlockService()

    public static let defaultCategories: Set<String> = [
        SponsorCategory.sponsor.rawValue,
        SponsorCategory.selfpromo.rawValue,
        SponsorCategory.interaction.rawValue
    ]

    private let defaultBaseURL = "https://sponsor.ajay.app"
    private var customBaseURL: String? = nil

    private let session: URLSession
    private let cache = NSCache<NSString, NSArray>()

    public var enabledCategories: Set<String>

    public init(
        enabledCategories: Set<String> = SponsorBlockService.defaultCategories,
        session: URLSession = .shared
    ) {
        self.enabledCategories = enabledCategories
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 12
        self.session = URLSession(configuration: config)
    }

    /// Sets an alternate SponsorBlock API instance URL if desired.
    public func setBaseURL(_ url: String?) {
        customBaseURL = url?.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    /// Returns the active API base URL.
    public var activeBaseURL: String {
        if let custom = customBaseURL, !custom.isEmpty {
            return custom
        }
        return defaultBaseURL
    }

    // MARK: - Category Filtering

    public func isCategoryEnabled(_ category: String) -> Bool {
        enabledCategories.contains(category)
    }

    public func filterActiveSegments(_ segments: [SponsorSegment]) -> [SponsorSegment] {
        segments.filter { segment in
            segment.actionType == "skip" && enabledCategories.contains(segment.category)
        }
    }

    // MARK: - Segment Boundary & Seek Target Computation

    /// Checks if a playback timestamp falls inside an active sponsor segment, and returns the target seek position.
    /// Handles overlapping or chained sponsor segments by returning the furthest continuous endpoint.
    ///
    /// - Parameters:
    ///   - currentTime: The player's current playback position in seconds.
    ///   - segments: Array of sponsor segments for the current video.
    ///   - activeCategories: Optional override for enabled categories. If nil, uses `self.enabledCategories`.
    ///   - margin: Threshold in seconds before segment end to avoid skipping right at boundary (default 0.2s).
    /// - Returns: The target seek timestamp in seconds if inside a skippable segment; otherwise nil.
    public func computeSeekTarget(
        currentTime: Double,
        segments: [SponsorSegment],
        activeCategories: Set<String>? = nil,
        margin: Double = 0.2
    ) -> Double? {
        let categories = activeCategories ?? self.enabledCategories
        let eligible = segments.filter { $0.actionType == "skip" && categories.contains($0.category) }

        // Find segments enclosing current timestamp
        let matches = eligible.filter { seg in
            currentTime >= seg.startTime && currentTime < (seg.endTime - margin)
        }

        guard let firstMatch = matches.first else {
            return nil
        }

        // Handle overlapping / contiguous segments starting within or adjacent to this segment
        var targetEnd = firstMatch.endTime
        var extended = true
        while extended {
            extended = false
            for seg in eligible {
                if seg.startTime <= targetEnd && seg.endTime > targetEnd {
                    targetEnd = seg.endTime
                    extended = true
                }
            }
        }

        return targetEnd
    }

    // MARK: - JSON Parsing

    public static func parseSegments(from data: Data) throws -> [SponsorSegment] {
        let decoder = JSONDecoder()
        return try decoder.decode([SponsorSegment].self, from: data)
    }

    // MARK: - Network Fetching

    /// Fetches skip segments for a given video ID and category filter.
    /// Resilient: Returns an empty list if offline, 404 (no segments), or rate-limited.
    public func fetchSkipSegments(
        videoId: String,
        categories: [String] = ["sponsor", "intro", "outro", "selfpromo", "interaction", "preview", "music_offtopic"]
    ) async -> [SponsorSegment] {
        let cleanId = videoId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanId.isEmpty else { return [] }

        // Check memory cache first
        let cacheKey = "\(cleanId)_\(categories.sorted().joined(separator: ","))" as NSString
        if let cached = cache.object(forKey: cacheKey) as? [SponsorSegment] {
            return cached
        }

        // Prepare query parameters
        guard let categoriesData = try? JSONSerialization.data(withJSONObject: categories),
              let categoriesJsonString = String(data: categoriesData, encoding: .utf8) else {
            return []
        }

        var components = URLComponents(string: "\(activeBaseURL)/api/skipSegments")
        components?.queryItems = [
            URLQueryItem(name: "videoID", value: cleanId),
            URLQueryItem(name: "categories", value: categoriesJsonString)
        ]

        guard let url = components?.url else { return [] }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { return [] }

            // 404 means no skip segments exist for this video
            if http.statusCode == 404 {
                cache.setObject([] as NSArray, forKey: cacheKey)
                return []
            }

            guard (200...299).contains(http.statusCode) else {
                // Rate-limited (429) or temporary server glitch
                return []
            }

            let segments = (try? Self.parseSegments(from: data)) ?? []
            cache.setObject(segments as NSArray, forKey: cacheKey)
            return segments
        } catch {
            // Offline or request timed out
            return []
        }
    }

    /// Clears the in-memory segment cache.
    public func clearCache() {
        cache.removeAllObjects()
    }
}
