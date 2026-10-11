//
//  SponsorSegment.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation

// MARK: - SponsorCategoryInfo

public struct SponsorCategoryInfo: Sendable, Equatable, Hashable {
    public let rawValue: String
    public let label: String
    public let hexColor: String
    public let defaultEnabled: Bool

    public init(rawValue: String, label: String, hexColor: String, defaultEnabled: Bool = true) {
        self.rawValue = rawValue
        self.label = label
        self.hexColor = hexColor
        self.defaultEnabled = defaultEnabled
    }
}

// MARK: - SponsorCategory

public enum SponsorCategory: String, CaseIterable, Codable, Sendable {
    case sponsor
    case selfpromo
    case interaction
    case intro
    case outro
    case preview
    case musicOfftopic = "music_offtopic"
    case filler

    public var info: SponsorCategoryInfo {
        switch self {
        case .sponsor:
            return SponsorCategoryInfo(rawValue: rawValue, label: "Sponsor", hexColor: "#00d66c", defaultEnabled: true)
        case .selfpromo:
            return SponsorCategoryInfo(rawValue: rawValue, label: "Self Promotion", hexColor: "#ffff00", defaultEnabled: true)
        case .interaction:
            return SponsorCategoryInfo(rawValue: rawValue, label: "Interaction Reminder", hexColor: "#cc00ff", defaultEnabled: true)
        case .intro:
            return SponsorCategoryInfo(rawValue: rawValue, label: "Intro Animation", hexColor: "#00ffff", defaultEnabled: false)
        case .outro:
            return SponsorCategoryInfo(rawValue: rawValue, label: "Outro / Credits", hexColor: "#0202ed", defaultEnabled: false)
        case .preview:
            return SponsorCategoryInfo(rawValue: rawValue, label: "Preview / Recap", hexColor: "#008fd6", defaultEnabled: false)
        case .musicOfftopic:
            return SponsorCategoryInfo(rawValue: rawValue, label: "Non-Music Section", hexColor: "#ff9900", defaultEnabled: false)
        case .filler:
            return SponsorCategoryInfo(rawValue: rawValue, label: "Filler / Tangent", hexColor: "#7300ff", defaultEnabled: false)
        }
    }
}

// MARK: - SponsorSegment

/// Represents a crowdsourced skip segment from SponsorBlock.
public struct SponsorSegment: Codable, Identifiable, Hashable, Sendable {
    public var category: String
    public var actionType: String
    public var segment: [Double]
    public var uuid: String

    public var id: String { uuid }
    public var UUID: String { uuid }

    public init(
        category: String,
        actionType: String = "skip",
        segment: [Double],
        uuid: String = Foundation.UUID().uuidString
    ) {
        self.category = category
        self.actionType = actionType
        self.segment = segment
        self.uuid = uuid
    }

    public init(
        category: String,
        actionType: String = "skip",
        startTime: Double,
        endTime: Double,
        uuid: String = Foundation.UUID().uuidString
    ) {
        self.category = category
        self.actionType = actionType
        self.segment = [startTime, endTime]
        self.uuid = uuid
    }

    private enum CodingKeys: String, CodingKey {
        case category
        case actionType
        case segment
        case UUID
        case uuid
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        category = (try? container.decodeIfPresent(String.self, forKey: .category)) ?? "sponsor"
        actionType = (try? container.decodeIfPresent(String.self, forKey: .actionType)) ?? "skip"
        segment = (try? container.decodeIfPresent([Double].self, forKey: .segment)) ?? [0.0, 0.0]

        if let u = try? container.decodeIfPresent(String.self, forKey: .UUID) {
            uuid = u
        } else if let uFallback = try? container.decodeIfPresent(String.self, forKey: .uuid) {
            uuid = uFallback
        } else {
            uuid = Foundation.UUID().uuidString
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(category, forKey: .category)
        try container.encode(actionType, forKey: .actionType)
        try container.encode(segment, forKey: .segment)
        try container.encode(uuid, forKey: .UUID)
    }

    // MARK: - Timing Helpers

    /// Start time in seconds.
    public var startTime: Double {
        segment.first ?? 0.0
    }

    /// End time in seconds.
    public var endTime: Double {
        segment.count > 1 ? segment[1] : (segment.first ?? 0.0)
    }

    /// Duration of the segment in seconds.
    public var duration: Double {
        max(0, endTime - startTime)
    }

    /// Checks if a playback position falls within this segment.
    public func contains(time: Double) -> Bool {
        time >= startTime && time < endTime
    }

    // MARK: - Category Metadata & Colors

    /// User-friendly display label for the category.
    public var categoryLabel: String {
        switch category.lowercased() {
        case "sponsor":
            return "Sponsor"
        case "intro":
            return "Intro Animation"
        case "outro":
            return "Outro / Credits"
        case "selfpromo":
            return "Self Promotion"
        case "interaction":
            return "Interaction Reminder"
        case "preview":
            return "Preview / Recap"
        case "music_offtopic":
            return "Non-Music Section"
        case "filler":
            return "Filler / Tangent"
        default:
            return category.capitalized
        }
    }

    /// Hex color code matching official SponsorBlock category styling.
    public var categoryColorHex: String {
        switch category.lowercased() {
        case "sponsor":
            return "#00D66C"
        case "intro":
            return "#00FFFF"
        case "outro":
            return "#0202ED"
        case "selfpromo":
            return "#FFFF00"
        case "interaction":
            return "#CC00FF"
        case "preview":
            return "#008FD6"
        case "music_offtopic":
            return "#FF9900"
        case "filler":
            return "#7300FF"
        default:
            return "#888888"
        }
    }

    /// Normalized RGBA color components (0.0 ... 1.0) for UI rendering.
    public var colorRGBA: (red: Double, green: Double, blue: Double, alpha: Double) {
        let hex = categoryColorHex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: UInt64
        switch hex.count {
        case 6:
            (r, g, b) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (r, g, b) = (128, 128, 128)
        }
        return (Double(r) / 255, Double(g) / 255, Double(b) / 255, 1.0)
    }

    public var shouldSkip: Bool {
        actionType.lowercased() == "skip"
    }
}

#if canImport(SwiftUI)
import SwiftUI

extension SponsorSegment {
    public var categoryColor: Color {
        let rgba = colorRGBA
        return Color(red: rgba.red, green: rgba.green, blue: rgba.blue)
    }
}
#endif
