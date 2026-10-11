//
//  APIClient.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Primary network client for KV-Tube backend, SponsorBlock, and Return YouTube Dislike.
public final class APIClient: @unchecked Sendable {
    public static let shared = APIClient()

    public var baseURL: URL {
        if let stored = UserDefaults.standard.string(forKey: "kvtube_backend_url"),
           let url = URL(string: stored) {
            return url
        }
        return URL(string: "http://localhost:8080")!
    }

    public var sponsorBlockURL: URL {
        if let stored = UserDefaults.standard.string(forKey: "kvtube_sponsorblock_url"),
           let url = URL(string: stored) {
            return url
        }
        return URL(string: "https://sponsor.ajay.app")!
    }

    public var rydURL: URL {
        if let stored = UserDefaults.standard.string(forKey: "kvtube_ryd_url"),
           let url = URL(string: stored) {
            return url
        }
        return URL(string: "https://returnyoutubedislikeapi.com")!
    }

    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    // MARK: - Video Details

    public func fetchVideo(id: String) async throws -> VideoData {
        let url = baseURL.appendingPathComponent("api/video").appendingPathComponent(id)
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(VideoData.self, from: data)
    }

    // MARK: - Playback Info / Stream Extraction

    public func fetchPlaybackInfo(id: String) async throws -> PlaybackInfo {
        let url = baseURL.appendingPathComponent("api/video")
            .appendingPathComponent(id)
            .appendingPathComponent("playback-info")
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(PlaybackInfo.self, from: data)
    }

    // MARK: - Related Videos

    public func fetchRelatedVideos(id: String) async throws -> [VideoData] {
        let url = baseURL.appendingPathComponent("api/video")
            .appendingPathComponent(id)
            .appendingPathComponent("related")
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            return []
        }
        
        // Backend returns an array or an object with items
        if let list = try? JSONDecoder().decode([VideoData].self, from: data) {
            return list
        }
        
        struct RelatedWrapper: Codable {
            let items: [VideoData]?
            let videos: [VideoData]?
        }
        if let wrapper = try? JSONDecoder().decode(RelatedWrapper.self, from: data) {
            return wrapper.items ?? wrapper.videos ?? []
        }
        return []
    }

    // MARK: - Comments

    public func fetchComments(id: String, continuation: String? = nil) async throws -> CommentsPage {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/video").appendingPathComponent(id).appendingPathComponent("comments"), resolvingAgainstBaseURL: false)
        if let token = continuation, !token.isEmpty {
            components?.queryItems = [URLQueryItem(name: "continuation", value: token)]
        }
        guard let url = components?.url else {
            throw URLError(.badURL)
        }

        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            return CommentsPage()
        }

        return (try? JSONDecoder().decode(CommentsPage.self, from: data)) ?? CommentsPage()
    }

    // MARK: - SponsorBlock

    public func fetchSponsorSegments(videoId: String) async -> [SponsorSegment] {
        guard !videoId.isEmpty else { return [] }
        let categories = "[\"sponsor\",\"selfpromo\",\"interaction\",\"intro\",\"outro\",\"preview\",\"music_offtopic\",\"filler\"]"
        guard var components = URLComponents(url: sponsorBlockURL.appendingPathComponent("api/skipSegments"), resolvingAgainstBaseURL: false) else {
            return []
        }
        components.queryItems = [
            URLQueryItem(name: "videoID", value: videoId),
            URLQueryItem(name: "categories", value: categories)
        ]

        guard let url = components.url else { return [] }

        var request = URLRequest(url: url)
        request.timeoutInterval = 6.0
        request.setValue("KV-Tube-iOS/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                return []
            }
            return (try? JSONDecoder().decode([SponsorSegment].self, from: data)) ?? []
        } catch {
            return []
        }
    }

    // MARK: - Return YouTube Dislike (RYD)

    public func fetchDislikes(videoId: String) async -> RYDData? {
        guard !videoId.isEmpty else { return nil }
        guard var components = URLComponents(url: rydURL.appendingPathComponent("votes"), resolvingAgainstBaseURL: false) else {
            return nil
        }
        components.queryItems = [URLQueryItem(name: "videoId", value: videoId)]
        guard let url = components.url else { return nil }

        var request = URLRequest(url: url)
        request.timeoutInterval = 6.0
        request.setValue("KV-Tube-iOS/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                return nil
            }
            return try? JSONDecoder().decode(RYDData.self, from: data)
        } catch {
            return nil
        }
    }
}
