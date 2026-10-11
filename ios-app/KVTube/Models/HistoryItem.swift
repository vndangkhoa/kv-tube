//
//  HistoryItem.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation

/// Item saved in local watch history with playback resume position and completion state.
public struct HistoryItem: Identifiable, Codable, Hashable, Sendable {
    public var id: String { videoId }
    public let videoId: String
    public var title: String
    public var channelTitle: String
    public var channelId: String
    public var thumbnail: String
    public var duration: String
    public var durationSeconds: Double
    public var playbackPositionSeconds: Double
    public var watchedAt: Date
    public var isCompleted: Bool

    // MARK: - Compatibility Aliases

    public var uploader: String {
        get { channelTitle }
        set { channelTitle = newValue }
    }

    public var thumbnailUrl: String {
        get { thumbnail }
        set { thumbnail = newValue }
    }

    public var lastPlaybackPosition: Double {
        get { playbackPositionSeconds }
        set { playbackPositionSeconds = newValue }
    }

    public init(
        videoId: String,
        title: String,
        channelTitle: String = "",
        channelId: String = "",
        thumbnail: String = "",
        duration: String = "",
        durationSeconds: Double = 0.0,
        playbackPositionSeconds: Double = 0.0,
        watchedAt: Date = Date(),
        isCompleted: Bool = false
    ) {
        self.videoId = videoId
        self.title = title
        self.channelTitle = channelTitle
        self.channelId = channelId
        self.thumbnail = thumbnail
        self.duration = duration
        self.durationSeconds = durationSeconds
        self.playbackPositionSeconds = playbackPositionSeconds
        self.watchedAt = watchedAt
        self.isCompleted = isCompleted
    }

    public init(
        videoId: String,
        title: String,
        uploader: String,
        channelId: String,
        thumbnailUrl: String,
        duration: String,
        durationSeconds: Int,
        lastPlaybackPosition: Double,
        watchedAt: Date = Date(),
        isCompleted: Bool = false
    ) {
        self.videoId = videoId
        self.title = title
        self.channelTitle = uploader
        self.channelId = channelId
        self.thumbnail = thumbnailUrl
        self.duration = duration
        self.durationSeconds = Double(durationSeconds)
        self.playbackPositionSeconds = lastPlaybackPosition
        self.watchedAt = watchedAt
        self.isCompleted = isCompleted
    }

    private enum CodingKeys: String, CodingKey {
        case videoId
        case title
        case channelTitle
        case uploader
        case channelId
        case thumbnail
        case thumbnailUrl
        case duration
        case durationSeconds
        case playbackPositionSeconds
        case lastPlaybackPosition
        case watchedAt
        case isCompleted
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        videoId = (try? container.decodeIfPresent(String.self, forKey: .videoId)) ?? ""
        title = (try? container.decodeIfPresent(String.self, forKey: .title)) ?? ""

        if let ch = try? container.decodeIfPresent(String.self, forKey: .channelTitle) {
            channelTitle = ch
        } else if let up = try? container.decodeIfPresent(String.self, forKey: .uploader) {
            channelTitle = up
        } else {
            channelTitle = ""
        }

        channelId = (try? container.decodeIfPresent(String.self, forKey: .channelId)) ?? ""

        if let th = try? container.decodeIfPresent(String.self, forKey: .thumbnail) {
            thumbnail = th
        } else if let thUrl = try? container.decodeIfPresent(String.self, forKey: .thumbnailUrl) {
            thumbnail = thUrl
        } else {
            thumbnail = ""
        }

        duration = (try? container.decodeIfPresent(String.self, forKey: .duration)) ?? ""

        if let ds = try? container.decodeIfPresent(Double.self, forKey: .durationSeconds) {
            durationSeconds = ds
        } else if let dsInt = try? container.decodeIfPresent(Int.self, forKey: .durationSeconds) {
            durationSeconds = Double(dsInt)
        } else {
            durationSeconds = 0.0
        }

        if let pos = try? container.decodeIfPresent(Double.self, forKey: .playbackPositionSeconds) {
            playbackPositionSeconds = pos
        } else if let lastPos = try? container.decodeIfPresent(Double.self, forKey: .lastPlaybackPosition) {
            playbackPositionSeconds = lastPos
        } else {
            playbackPositionSeconds = 0.0
        }

        watchedAt = (try? container.decodeIfPresent(Date.self, forKey: .watchedAt)) ?? Date()
        isCompleted = (try? container.decodeIfPresent(Bool.self, forKey: .isCompleted)) ?? false
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(videoId, forKey: .videoId)
        try container.encode(title, forKey: .title)
        try container.encode(channelTitle, forKey: .channelTitle)
        try container.encode(channelId, forKey: .channelId)
        try container.encode(thumbnail, forKey: .thumbnail)
        try container.encode(duration, forKey: .duration)
        try container.encode(durationSeconds, forKey: .durationSeconds)
        try container.encode(playbackPositionSeconds, forKey: .playbackPositionSeconds)
        try container.encode(watchedAt, forKey: .watchedAt)
        try container.encode(isCompleted, forKey: .isCompleted)
    }

    public var progressFraction: Double {
        guard durationSeconds > 0 else { return 0.0 }
        return min(max(playbackPositionSeconds / durationSeconds, 0.0), 1.0)
    }

    public func asVideoData() -> VideoData {
        toVideoData()
    }

    public func toVideoData() -> VideoData {
        VideoData(
            id: videoId,
            title: title,
            uploader: channelTitle,
            channelId: channelId,
            thumbnail: thumbnail,
            duration: duration,
            durationSeconds: Int(durationSeconds)
        )
    }
}
