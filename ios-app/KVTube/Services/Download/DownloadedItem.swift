//
//  DownloadedItem.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation

/// Represents a video downloaded for offline playback.
public struct DownloadedItem: Codable, Identifiable, Hashable {
    public var videoId: String
    public var title: String
    public var author: String
    public var thumbnailUrl: String
    public var localFilePath: String
    public var fileSizeBytes: Int64
    public var downloadedAt: Date
    public var durationSeconds: Int

    public var id: String { videoId }

    public init(
        videoId: String,
        title: String,
        author: String = "",
        thumbnailUrl: String = "",
        localFilePath: String,
        fileSizeBytes: Int64 = 0,
        downloadedAt: Date = Date(),
        durationSeconds: Int = 0
    ) {
        self.videoId = videoId
        self.title = title
        self.author = author
        self.thumbnailUrl = thumbnailUrl
        self.localFilePath = localFilePath
        self.fileSizeBytes = fileSizeBytes
        self.downloadedAt = downloadedAt
        self.durationSeconds = durationSeconds
    }

    // MARK: - Computed Properties & Helpers

    /// Full local file URL pointing to the downloaded video container (e.g. MP4).
    public var fileURL: URL {
        URL(fileURLWithPath: localFilePath)
    }

    /// Verifies if the downloaded file currently exists on the local filesystem.
    public var fileExists: Bool {
        FileManager.default.fileExists(atPath: localFilePath)
    }

    /// Human-readable file size (e.g. "45.2 MB" or "1.2 GB").
    public var formattedFileSize: String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useAll]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: fileSizeBytes)
    }

    /// Formatted duration string: "M:SS" or "H:MM:SS".
    public var formattedDuration: String {
        guard durationSeconds > 0 else { return "0:00" }
        let hours = durationSeconds / 3600
        let minutes = (durationSeconds % 3600) / 60
        let seconds = durationSeconds % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%d:%02d", minutes, seconds)
        }
    }

    /// Converts into a VideoData object for player or playlist consumption.
    public func toVideoData() -> VideoData {
        VideoData(
            videoId: videoId,
            title: title,
            author: author,
            videoThumbnails: [Thumbnail(quality: "medium", url: thumbnailUrl)],
            lengthSeconds: durationSeconds
        )
    }
}
