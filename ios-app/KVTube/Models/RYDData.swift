//
//  RYDData.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import Foundation

/// Return YouTube Dislike (RYD) voting statistics and ratio.
public struct RYDData: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let dateCreated: String?
    public let likes: Int
    public let dislikes: Int
    public let rating: Double
    public let viewCount: Int64
    public let deleted: Bool

    public init(
        id: String = "",
        dateCreated: String? = nil,
        likes: Int = 0,
        dislikes: Int = 0,
        rating: Double = 0.0,
        viewCount: Int64 = 0,
        deleted: Bool = false
    ) {
        self.id = id
        self.dateCreated = dateCreated
        self.likes = likes
        self.dislikes = dislikes
        self.rating = rating
        self.viewCount = viewCount
        self.deleted = deleted
    }

    enum CodingKeys: String, CodingKey {
        case id
        case dateCreated
        case likes
        case dislikes
        case rating
        case viewCount
        case deleted
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(String.self, forKey: .id) ?? ""
        self.dateCreated = try container.decodeIfPresent(String.self, forKey: .dateCreated)
        self.likes = (try? container.decodeIfPresent(Int.self, forKey: .likes)) ?? 0
        self.dislikes = (try? container.decodeIfPresent(Int.self, forKey: .dislikes)) ?? 0
        self.rating = (try? container.decodeIfPresent(Double.self, forKey: .rating)) ?? 0.0

        if let vCount = try? container.decodeIfPresent(Int64.self, forKey: .viewCount) {
            self.viewCount = vCount
        } else if let vInt = try? container.decodeIfPresent(Int.self, forKey: .viewCount) {
            self.viewCount = Int64(vInt)
        } else {
            self.viewCount = 0
        }

        self.deleted = (try? container.decodeIfPresent(Bool.self, forKey: .deleted)) ?? false
    }

    // MARK: - Formatters & Ratios

    public var formattedLikes: String {
        formatCount(likes)
    }

    public var formattedDislikes: String {
        formatCount(dislikes)
    }

    /// Ratio percentage of positive votes: (likes / (likes + dislikes)) * 100.
    public var likeRatioPercentage: Double {
        let total = likes + dislikes
        guard total > 0 else { return 0.0 }
        return (Double(likes) / Double(total)) * 100.0
    }

    /// Formatted ratio string (e.g. "97.5%").
    public var formattedRatio: String {
        let pct = likeRatioPercentage
        guard pct > 0 else { return "" }
        return String(format: "%.1f%%", pct)
    }

    private func formatCount(_ count: Int) -> String {
        let d = Double(count)
        if d >= 1_000_000_000 {
            return String(format: "%.1fB", d / 1_000_000_000.0)
        } else if d >= 1_000_000 {
            return String(format: "%.1fM", d / 1_000_000.0)
        } else if d >= 1_000 {
            return String(format: "%.1fK", d / 1_000.0)
        } else {
            return "\(count)"
        }
    }
}
