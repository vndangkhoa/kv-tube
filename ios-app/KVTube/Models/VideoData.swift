//
//  VideoData.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation

// MARK: - Thumbnail

/// Represents an image thumbnail (video poster or channel avatar/banner).
public struct Thumbnail: Codable, Hashable, Identifiable, Sendable {
    public var quality: String?
    public var url: String
    public var width: Int?
    public var height: Int?

    public var id: String {
        "\(quality ?? "")_\(url)"
    }

    public init(
        quality: String? = nil,
        url: String,
        width: Int? = nil,
        height: Int? = nil
    ) {
        self.quality = quality
        self.url = url
        self.width = width
        self.height = height
    }

    /// Resolves the URL as a `URL` object if valid.
    public var asURL: URL? {
        URL(string: url)
    }

    private enum CodingKeys: String, CodingKey {
        case quality
        case url
        case width
        case height
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        quality = try container.decodeIfPresent(String.self, forKey: .quality)
        url = try container.decode(String.self, forKey: .url)

        if let w = try? container.decodeIfPresent(Int.self, forKey: .width) {
            width = w
        } else if let wStr = try? container.decodeIfPresent(String.self, forKey: .width) {
            width = Int(wStr)
        } else {
            width = nil
        }

        if let h = try? container.decodeIfPresent(Int.self, forKey: .height) {
            height = h
        } else if let hStr = try? container.decodeIfPresent(String.self, forKey: .height) {
            height = Int(hStr)
        } else {
            height = nil
        }
    }
}

// MARK: - Thumbnail Array Helpers

extension Array where Element == Thumbnail {
    /// Selects the best available thumbnail (highest resolution or last element as fallback).
    public var bestThumbnail: Thumbnail? {
        if isEmpty { return nil }
        // Prefer by width * height if available
        let withDimensions = filter { ($0.width ?? 0) > 0 && ($0.height ?? 0) > 0 }
        if let highest = withDimensions.max(by: { ($0.width ?? 0) * ($0.height ?? 0) < ($1.width ?? 0) * ($1.height ?? 0) }) {
            return highest
        }
        // Check for known quality labels (prefer 16:9 formats without letterbox bars)
        let qualityPriority = ["maxresdefault", "hq720", "sddefault", "mqdefault", "high", "medium", "default", "hqdefault"]
        for q in qualityPriority {
            if let match = first(where: { ($0.quality ?? "").lowercased().contains(q) }) {
                return match
            }
        }
        // Fallback to the last element (Invidious usually orders thumbnails ascending by size)
        return last
    }

    /// Selects the smallest/compact thumbnail (useful for badges or low-bandwidth modes).
    public var lowestThumbnail: Thumbnail? {
        if isEmpty { return nil }
        let withDimensions = filter { ($0.width ?? 0) > 0 }
        if let lowest = withDimensions.min(by: { ($0.width ?? 0) < ($1.width ?? 0) }) {
            return lowest
        }
        return first
    }
}

// MARK: - VideoData

/// Primary model representing a video in KV-Tube.
public struct VideoData: Codable, Identifiable, Hashable, Sendable {
    public var videoId: String
    public var title: String
    public var author: String
    public var authorId: String
    public var authorUrl: String?
    public var videoThumbnails: [Thumbnail]
    public var authorThumbnails: [Thumbnail]?
    public var description: String?
    public var publishedText: String?
    public var publishedTime: Int64?
    public var lengthSeconds: Int
    public var viewCount: Int64?
    public var likeCount: Int64?
    public var dislikeCount: Int64?
    public var liveNow: Bool?
    public var recommendedVideos: [VideoData]?

    public var id: String { videoId }

    public init(
        videoId: String,
        title: String,
        author: String = "",
        authorId: String = "",
        authorUrl: String? = nil,
        videoThumbnails: [Thumbnail] = [],
        authorThumbnails: [Thumbnail]? = nil,
        description: String? = nil,
        publishedText: String? = nil,
        publishedTime: Int64? = nil,
        lengthSeconds: Int = 0,
        viewCount: Int64? = nil,
        likeCount: Int64? = nil,
        dislikeCount: Int64? = nil,
        liveNow: Bool? = nil
    ) {
        self.videoId = videoId
        self.title = title
        self.author = author
        self.authorId = authorId
        self.authorUrl = authorUrl
        self.videoThumbnails = videoThumbnails
        self.liveNow = liveNow
        self.authorThumbnails = authorThumbnails
        self.description = description
        self.publishedText = publishedText
        self.publishedTime = publishedTime
        self.lengthSeconds = lengthSeconds
        self.viewCount = viewCount
        self.likeCount = likeCount
        self.dislikeCount = dislikeCount
    }

    /// Convenience initializer compatible with legacy view models and call-sites.
    public init(
        id: String,
        title: String = "",
        uploader: String = "",
        channelId: String = "",
        channelTitle: String? = nil,
        thumbnail: String = "",
        duration: String = "",
        durationSeconds: Int = 0,
        viewCount: Int64 = 0,
        uploadDate: String = "",
        description: String = ""
    ) {
        self.videoId = id
        self.title = title
        self.author = channelTitle ?? uploader
        self.authorId = channelId
        self.authorUrl = nil
        if !thumbnail.isEmpty {
            self.videoThumbnails = [Thumbnail(quality: "medium", url: thumbnail)]
        } else {
            self.videoThumbnails = []
        }
        self.authorThumbnails = nil
        self.description = description.isEmpty ? nil : description
        self.publishedText = uploadDate.isEmpty ? nil : uploadDate
        self.publishedTime = nil
        self.lengthSeconds = durationSeconds
        self.viewCount = viewCount > 0 ? viewCount : nil
        self.likeCount = nil
        self.dislikeCount = nil
    }

    // MARK: - Compatibility Getters

    public var uploader: String {
        author
    }

    public var channelId: String {
        authorId
    }

    public var channelTitle: String {
        author
    }

    public var displayChannelTitle: String {
        author.isEmpty ? "Unknown Channel" : author
    }

    public var duration: String {
        formattedDuration
    }

    public var durationSeconds: Double {
        Double(lengthSeconds)
    }

    public var thumbnail: String {
        bestThumbnail?.url ?? ""
    }

    public var displayThumbnailUrl: URL? {
        if let best = bestThumbnailURL {
            let str = best.absoluteString
            if str.contains("maxresdefault") || str.contains("hq720") || str.contains("mqdefault") {
                return best
            }
            if str.contains("hqdefault") {
                // Replace hqdefault (4:3 letterboxed) with mqdefault (16:9 unletterboxed)
                return URL(string: str.replacingOccurrences(of: "hqdefault", with: "mqdefault"))
            }
            return best
        }
        if !videoId.isEmpty {
            return URL(string: "https://i.ytimg.com/vi/\(videoId)/mqdefault.jpg")
        }
        return nil
    }

    public var viewCountFormatted: String {
        formattedViews
    }

    public var uploadDate: String {
        publishedText ?? ""
    }

    public var publishedAt: String {
        relativeTime
    }

    public var displayChannelId: String {
        authorId.isEmpty ? author : authorId
    }

    public var channelThumbnail: String {
        bestAuthorThumbnail?.url ?? ""
    }

    public var streamUrl: String? {
        nil
    }

    public var isShort: Bool {
        lengthSeconds > 0 && lengthSeconds <= 60
    }

    public var subscriberCount: String? {
        nil
    }

    public var displayViews: String {
        formattedViews
    }

    public var displayPublished: String {
        relativeTime
    }

    public var displayDuration: String {
        formattedDuration
    }

    // MARK: - Coding Keys & Custom Decoding

    private enum CodingKeys: String, CodingKey {
        case videoId
        case id
        case title
        case author
        case uploader
        case channelTitle
        case authorId
        case channelId
        case authorUrl
        case videoThumbnails
        case authorThumbnails
        case description
        case publishedText
        case publishedTime
        case published
        case uploadDate
        case lengthSeconds
        case durationSeconds
        case viewCount
        case views
        case likeCount
        case dislikeCount
        case liveNow
        case thumbnail
        case recommendedVideos
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        // videoId can come as `videoId` or `id`
        if let vid = try? container.decodeIfPresent(String.self, forKey: .videoId), !vid.isEmpty {
            videoId = vid
        } else if let fallbackId = try? container.decodeIfPresent(String.self, forKey: .id) {
            videoId = fallbackId
        } else {
            videoId = ""
        }

        title = (try? container.decodeIfPresent(String.self, forKey: .title)) ?? ""

        if let a = try? container.decodeIfPresent(String.self, forKey: .author), !a.isEmpty {
            author = a
        } else if let u = try? container.decodeIfPresent(String.self, forKey: .uploader), !u.isEmpty {
            author = u
        } else if let ct = try? container.decodeIfPresent(String.self, forKey: .channelTitle) {
            author = ct
        } else {
            author = ""
        }

        if let aid = try? container.decodeIfPresent(String.self, forKey: .authorId), !aid.isEmpty {
            authorId = aid
        } else if let cid = try? container.decodeIfPresent(String.self, forKey: .channelId) {
            authorId = cid
        } else {
            authorId = ""
        }

        authorUrl = try? container.decodeIfPresent(String.self, forKey: .authorUrl)

        if let thumbs = try? container.decodeIfPresent([Thumbnail].self, forKey: .videoThumbnails), !thumbs.isEmpty {
            videoThumbnails = thumbs
        } else if let singleThumb = try? container.decodeIfPresent(String.self, forKey: .thumbnail), !singleThumb.isEmpty {
            videoThumbnails = [Thumbnail(quality: "medium", url: singleThumb)]
        } else {
            videoThumbnails = []
        }

        authorThumbnails = try? container.decodeIfPresent([Thumbnail].self, forKey: .authorThumbnails)
        description = try? container.decodeIfPresent(String.self, forKey: .description)

        if let pt = try? container.decodeIfPresent(String.self, forKey: .publishedText), !pt.isEmpty {
            publishedText = pt
        } else if let p = try? container.decodeIfPresent(String.self, forKey: .published), !p.isEmpty {
            publishedText = p
        } else if let ud = try? container.decodeIfPresent(String.self, forKey: .uploadDate) {
            publishedText = ud
        } else {
            publishedText = nil
        }

        // publishedTime (can be Int64, Double, or String timestamp)
        if let pt = try? container.decodeIfPresent(Int64.self, forKey: .publishedTime) {
            publishedTime = pt
        } else if let ptDouble = try? container.decodeIfPresent(Double.self, forKey: .publishedTime) {
            publishedTime = Int64(ptDouble)
        } else if let ptStr = try? container.decodeIfPresent(String.self, forKey: .publishedTime) {
            publishedTime = Int64(ptStr)
        } else {
            publishedTime = nil
        }

        // lengthSeconds
        if let ls = try? container.decodeIfPresent(Int.self, forKey: .lengthSeconds) {
            lengthSeconds = ls
        } else if let ds = try? container.decodeIfPresent(Int.self, forKey: .durationSeconds) {
            lengthSeconds = ds
        } else if let dsDouble = try? container.decodeIfPresent(Double.self, forKey: .durationSeconds) {
            lengthSeconds = Int(dsDouble)
        } else if let lsStr = try? container.decodeIfPresent(String.self, forKey: .lengthSeconds) {
            lengthSeconds = Int(lsStr) ?? 0
        } else {
            lengthSeconds = 0
        }

        // viewCount (can be Int64 or String)
        if let vc = try? container.decodeIfPresent(Int64.self, forKey: .viewCount) {
            viewCount = vc
        } else if let vcStr = try? container.decodeIfPresent(String.self, forKey: .viewCount) {
            viewCount = Int64(vcStr)
        } else if let vStr = try? container.decodeIfPresent(String.self, forKey: .views) {
            viewCount = Int64(vStr)
        } else {
            viewCount = nil
        }

        // likeCount
        if let lc = try? container.decodeIfPresent(Int64.self, forKey: .likeCount) {
            likeCount = lc
        } else if let lcStr = try? container.decodeIfPresent(String.self, forKey: .likeCount) {
            likeCount = Int64(lcStr)
        } else {
            likeCount = nil
        }

        // dislikeCount
        if let dc = try? container.decodeIfPresent(Int64.self, forKey: .dislikeCount) {
            dislikeCount = dc
        } else if let dcStr = try? container.decodeIfPresent(String.self, forKey: .dislikeCount) {
            dislikeCount = Int64(dcStr)
        } else {
            dislikeCount = nil
        }

        liveNow = try? container.decodeIfPresent(Bool.self, forKey: .liveNow)
        recommendedVideos = try? container.decodeIfPresent([VideoData].self, forKey: .recommendedVideos)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(videoId, forKey: .videoId)
        try container.encode(title, forKey: .title)
        try container.encode(author, forKey: .author)
        try container.encode(authorId, forKey: .authorId)
        try container.encodeIfPresent(authorUrl, forKey: .authorUrl)
        try container.encode(videoThumbnails, forKey: .videoThumbnails)
        try container.encodeIfPresent(authorThumbnails, forKey: .authorThumbnails)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(publishedText, forKey: .publishedText)
        try container.encodeIfPresent(publishedTime, forKey: .publishedTime)
        try container.encode(lengthSeconds, forKey: .lengthSeconds)
        try container.encodeIfPresent(viewCount, forKey: .viewCount)
        try container.encodeIfPresent(likeCount, forKey: .likeCount)
        try container.encodeIfPresent(dislikeCount, forKey: .dislikeCount)
        try container.encodeIfPresent(liveNow, forKey: .liveNow)
        try container.encodeIfPresent(recommendedVideos, forKey: .recommendedVideos)
    }

    // MARK: - Computed Formatters & Helpers

    /// Formats lengthSeconds into standard video time strings: "M:SS" or "H:MM:SS".
    public var formattedDuration: String {
        if liveNow == true {
            return "LIVE"
        }
        guard lengthSeconds > 0 else { return "" }
        let hours = lengthSeconds / 3600
        let minutes = (lengthSeconds % 3600) / 60
        let seconds = lengthSeconds % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%d:%02d", minutes, seconds)
        }
    }

    /// Formats the raw viewCount into compact readable form: "1.2M views", "45K views", etc.
    public var formattedViews: String {
        guard let views = viewCount, views >= 0 else { return "" }
        if views >= 1_000_000_000 {
            return String(format: "%.1fB views", Double(views) / 1_000_000_000.0)
        } else if views >= 1_000_000 {
            return String(format: "%.1fM views", Double(views) / 1_000_000.0)
        } else if views >= 1_000 {
            return String(format: "%.1fK views", Double(views) / 1_000.0)
        } else {
            return "\(views) views"
        }
    }

    /// Formats likeCount into a compact string: "1.4M", "52K", etc.
    public var formattedLikes: String {
        guard let likes = likeCount, likes > 0 else { return "" }
        if likes >= 1_000_000 {
            return String(format: "%.1fM", Double(likes) / 1_000_000.0)
        } else if likes >= 1_000 {
            return String(format: "%.1fK", Double(likes) / 1_000.0)
        } else {
            return "\(likes)"
        }
    }

    /// Relative human-readable time string. Uses publishedText if available,
    /// or calculates relative time from publishedTime epoch seconds.
    public var relativeTime: String {
        if let text = publishedText, !text.trimmingCharacters(in: .whitespaces).isEmpty {
            return text
        }
        if let time = publishedTime, time > 0 {
            #if canImport(FoundationNetworking) && !os(macOS) && !os(iOS)
            let seconds = Int64(Date().timeIntervalSince1970) - time
            if seconds < 60 { return "just now" }
            if seconds < 3600 { return "\(seconds / 60)m ago" }
            if seconds < 86400 { return "\(seconds / 3600)h ago" }
            return "\(seconds / 86400)d ago"
            #else
            let date = Date(timeIntervalSince1970: TimeInterval(time))
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .full
            return formatter.localizedString(for: date, relativeTo: Date())
            #endif
        }
        return ""
    }

    /// Best available thumbnail for this video.
    public var bestThumbnail: Thumbnail? {
        videoThumbnails.bestThumbnail
    }

    /// Convenient `URL` for the best video thumbnail.
    public var bestThumbnailURL: URL? {
        bestThumbnail?.asURL
    }

    /// Best available thumbnail for the author's avatar.
    public var bestAuthorThumbnail: Thumbnail? {
        authorThumbnails?.bestThumbnail
    }

    /// Convenient `URL` for the author's avatar.
    public var bestAuthorThumbnailURL: URL? {
        bestAuthorThumbnail?.asURL
    }
}
