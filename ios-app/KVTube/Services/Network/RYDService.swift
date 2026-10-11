//
//  RYDService.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Service that queries Return YouTube Dislike (RYD) API to fetch dislike counts and ratings.
public final class RYDService: @unchecked Sendable {
    public static let shared = RYDService()

    private let defaultEndpoint = "https://returnyoutubedislikeapi.com/votes"
    private let session: URLSession
    private let cache = NSCache<NSString, NSData>()

    public init(session: URLSession = .shared) {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 12
        self.session = URLSession(configuration: config)
    }

    /// Fetches dislike counts and voting data for a given video ID.
    /// Resilient: returns `nil` if offline or if the API is unreachable.
    public func fetchVotes(videoId: String) async -> RYDData? {
        let cleanId = videoId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanId.isEmpty else { return nil }

        let cacheKey = cleanId as NSString
        if let cachedData = cache.object(forKey: cacheKey) as Data? {
            if let decoded = try? JSONDecoder().decode(RYDData.self, from: cachedData) {
                return decoded
            }
        }

        var components = URLComponents(string: defaultEndpoint)
        components?.queryItems = [
            URLQueryItem(name: "videoId", value: cleanId)
        ]

        guard let url = components?.url else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                return nil
            }

            let decoded = try JSONDecoder().decode(RYDData.self, from: data)
            cache.setObject(data as NSData, forKey: cacheKey)
            return decoded
        } catch {
            return nil
        }
    }

    /// Clears cached dislike data.
    public func clearCache() {
        cache.removeAllObjects()
    }
}
