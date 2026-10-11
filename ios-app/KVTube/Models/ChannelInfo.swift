//
//  ChannelInfo.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation

// MARK: - RelatedChannel

/// Represents a related or recommended channel in the channel metadata.
public struct RelatedChannel: Codable, Identifiable, Hashable, Sendable {
    public var author: String
    public var authorId: String
    public var authorUrl: String?
    public var authorThumbnails: [Thumbnail]?

    public var id: String { authorId }

    public init(
        author: String,
        authorId: String,
        authorUrl: String? = nil,
        authorThumbnails: [Thumbnail]? = nil
    ) {
        self.author = author
        self.authorId = authorId
        self.authorUrl = authorUrl
        self.authorThumbnails = authorThumbnails
    }

    public var bestAvatar: Thumbnail? {
        authorThumbnails?.bestThumbnail
    }

    public var bestAvatarURL: URL? {
        bestAvatar?.asURL
    }
}

// MARK: - ChannelInfo

/// Detailed metadata representing a YouTube / Invidious channel.
public struct ChannelInfo: Codable, Identifiable, Hashable, Sendable {
    public var author: String
    public var authorId: String
    public var authorUrl: String?
    public var authorBanners: [Thumbnail]?
    public var authorThumbnails: [Thumbnail]?
    public var subCount: Int64?
    public var totalViews: Int64?
    public var joined: Int64?
    public var description: String?
    public var isFamilyFriendly: Bool?
    public var relatedChannels: [RelatedChannel]?
    public var latestVideos: [VideoData]?
    public var isSubscribed: Bool = false

    public var id: String { authorId }

    public init(
        author: String,
        authorId: String,
        authorUrl: String? = nil,
        authorBanners: [Thumbnail]? = nil,
        authorThumbnails: [Thumbnail]? = nil,
        subCount: Int64? = nil,
        totalViews: Int64? = nil,
        joined: Int64? = nil,
        description: String? = nil,
        isFamilyFriendly: Bool? = nil,
        relatedChannels: [RelatedChannel]? = nil,
        latestVideos: [VideoData]? = nil,
        isSubscribed: Bool = false
    ) {
        self.author = author
        self.authorId = authorId
        self.authorUrl = authorUrl
        self.authorBanners = authorBanners
        self.authorThumbnails = authorThumbnails
        self.subCount = subCount
        self.totalViews = totalViews
        self.joined = joined
        self.description = description
        self.isFamilyFriendly = isFamilyFriendly
        self.relatedChannels = relatedChannels
        self.latestVideos = latestVideos
        self.isSubscribed = isSubscribed
    }

    private enum CodingKeys: String, CodingKey {
        case author
        case authorId
        case authorUrl
        case authorBanners
        case authorThumbnails
        case subCount
        case totalViews
        case joined
        case description
        case isFamilyFriendly
        case relatedChannels
        case latestVideos
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        author = (try? container.decodeIfPresent(String.self, forKey: .author)) ?? ""
        authorId = (try? container.decodeIfPresent(String.self, forKey: .authorId)) ?? ""
        authorUrl = try? container.decodeIfPresent(String.self, forKey: .authorUrl)
        authorBanners = try? container.decodeIfPresent([Thumbnail].self, forKey: .authorBanners)
        authorThumbnails = try? container.decodeIfPresent([Thumbnail].self, forKey: .authorThumbnails)

        if let sc = try? container.decodeIfPresent(Int64.self, forKey: .subCount) {
            subCount = sc
        } else if let scStr = try? container.decodeIfPresent(String.self, forKey: .subCount) {
            subCount = Int64(scStr)
        } else {
            subCount = nil
        }

        if let tv = try? container.decodeIfPresent(Int64.self, forKey: .totalViews) {
            totalViews = tv
        } else if let tvStr = try? container.decodeIfPresent(String.self, forKey: .totalViews) {
            totalViews = Int64(tvStr)
        } else {
            totalViews = nil
        }

        if let j = try? container.decodeIfPresent(Int64.self, forKey: .joined) {
            joined = j
        } else if let jStr = try? container.decodeIfPresent(String.self, forKey: .joined) {
            joined = Int64(jStr)
        } else {
            joined = nil
        }

        description = try? container.decodeIfPresent(String.self, forKey: .description)
        isFamilyFriendly = try? container.decodeIfPresent(Bool.self, forKey: .isFamilyFriendly)
        relatedChannels = try? container.decodeIfPresent([RelatedChannel].self, forKey: .relatedChannels)
        latestVideos = try? container.decodeIfPresent([VideoData].self, forKey: .latestVideos)
        isSubscribed = false
    }

    // MARK: - Computed Formatters & Helpers

    /// Formatted subscriber count: "1.2M subscribers", "45K subscribers", or "0 subscribers".
    public var formattedSubCount: String {
        guard let subs = subCount, subs >= 0 else { return "" }
        if subs >= 1_000_000 {
            return String(format: "%.1fM subscribers", Double(subs) / 1_000_000.0)
        } else if subs >= 1_000 {
            return String(format: "%.1fK subscribers", Double(subs) / 1_000.0)
        } else {
            return "\(subs) subscribers"
        }
    }

    /// Formatted total channel views: "10.5M views", "340K views".
    public var formattedTotalViews: String {
        guard let views = totalViews, views >= 0 else { return "" }
        if views >= 1_000_000_000 {
            return String(format: "%.1fB views", Double(views) / 1_000_000_000.0)
        } else if views >= 1_000_000 {
            return String(format: "%.1fM views", Double(views) / 1_000.0)
        } else if views >= 1_000 {
            return String(format: "%.1fK views", Double(views) / 1_000.0)
        } else {
            return "\(views) views"
        }
    }

    /// Formatted channel creation date (from epoch seconds).
    public var formattedJoinedDate: String {
        guard let joinedTimestamp = joined, joinedTimestamp > 0 else { return "" }
        let date = Date(timeIntervalSince1970: TimeInterval(joinedTimestamp))
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    /// Best available channel avatar thumbnail.
    public var bestAvatar: Thumbnail? {
        authorThumbnails?.bestThumbnail
    }

    /// Best available channel avatar URL.
    public var bestAvatarURL: URL? {
        bestAvatar?.asURL
    }

    /// Best available channel banner thumbnail.
    public var bestBanner: Thumbnail? {
        authorBanners?.bestThumbnail
    }

    /// Best available channel banner URL.
    public var bestBannerURL: URL? {
        bestBanner?.asURL
    }

    public var bannerURL: String {
        bestBanner?.url ?? ""
    }

    public var avatarURL: String {
        bestAvatar?.url ?? ""
    }

    public var title: String {
        author
    }

    public var formattedSubscribers: String {
        formattedSubCount
    }

    public var videoCount: Int {
        latestVideos?.count ?? 0
    }

    public var joinedDate: String {
        formattedJoinedDate
    }
}
