//
//  Subscription.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation

// MARK: - Subscription

/// Represents a subscribed YouTube / Invidious channel.
public struct Subscription: Codable, Identifiable, Hashable {
    public var author: String
    public var authorId: String
    public var authorUrl: String?
    public var authorThumbnail: String?
    public var subCount: Int64?

    public var id: String { authorId }

    public init(
        author: String,
        authorId: String,
        authorUrl: String? = nil,
        authorThumbnail: String? = nil,
        subCount: Int64? = nil
    ) {
        self.author = author
        self.authorId = authorId
        self.authorUrl = authorUrl
        self.authorThumbnail = authorThumbnail
        self.subCount = subCount
    }

    private enum CodingKeys: String, CodingKey {
        case author
        case authorId
        case authorUrl
        case authorThumbnail
        case authorThumbnails
        case subCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        author = (try? container.decodeIfPresent(String.self, forKey: .author)) ?? ""
        authorId = (try? container.decodeIfPresent(String.self, forKey: .authorId)) ?? ""
        authorUrl = try? container.decodeIfPresent(String.self, forKey: .authorUrl)

        // Decode authorThumbnail: either direct string or extracted from authorThumbnails array
        if let directThumb = try? container.decodeIfPresent(String.self, forKey: .authorThumbnail), !directThumb.isEmpty {
            authorThumbnail = directThumb
        } else if let thumbnails = try? container.decodeIfPresent([Thumbnail].self, forKey: .authorThumbnails) {
            authorThumbnail = thumbnails.bestThumbnail?.url
        } else {
            authorThumbnail = nil
        }

        if let sc = try? container.decodeIfPresent(Int64.self, forKey: .subCount) {
            subCount = sc
        } else if let scStr = try? container.decodeIfPresent(String.self, forKey: .subCount) {
            subCount = Int64(scStr)
        } else {
            subCount = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(author, forKey: .author)
        try container.encode(authorId, forKey: .authorId)
        try container.encodeIfPresent(authorUrl, forKey: .authorUrl)
        try container.encodeIfPresent(authorThumbnail, forKey: .authorThumbnail)
        try container.encodeIfPresent(subCount, forKey: .subCount)
    }

    // MARK: - Computed Properties

    public var channelId: String { authorId }
    public var channelName: String { author }
    public var channelAvatar: String { authorThumbnail ?? "" }

    public var avatarURL: URL? {
        guard let thumb = authorThumbnail, !thumb.isEmpty else { return nil }
        return URL(string: thumb)
    }

    public var formattedSubCount: String {
        guard let subs = subCount, subs > 0 else { return "" }
        if subs >= 1_000_000 {
            return String(format: "%.1fM subscribers", Double(subs) / 1_000_000.0)
        } else if subs >= 1_000 {
            return String(format: "%.1fK subscribers", Double(subs) / 1_000.0)
        } else {
            return "\(subs) subscribers"
        }
    }
}
