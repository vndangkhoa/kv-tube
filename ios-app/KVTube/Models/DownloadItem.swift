import Foundation

public enum DownloadStatus: String, Codable {
    case pending
    case downloading
    case completed
    case failed
}

public struct DownloadItem: Identifiable, Codable, Hashable {
    public var id: String { videoId }
    public let videoId: String
    public var title: String
    public var channelTitle: String
    public var duration: String
    public var thumbnail: String
    public var quality: String
    public var fileSize: Int64
    public var downloadedAt: Date
    public var localFilePath: String?
    public var progress: Double
    public var status: DownloadStatus

    public init(
        videoId: String,
        title: String,
        channelTitle: String = "",
        duration: String = "",
        thumbnail: String = "",
        quality: String = "720p",
        fileSize: Int64 = 0,
        downloadedAt: Date = Date(),
        localFilePath: String? = nil,
        progress: Double = 0.0,
        status: DownloadStatus = .pending
    ) {
        self.videoId = videoId
        self.title = title
        self.channelTitle = channelTitle
        self.duration = duration
        self.thumbnail = thumbnail
        self.quality = quality
        self.fileSize = fileSize
        self.downloadedAt = downloadedAt
        self.localFilePath = localFilePath
        self.progress = progress
        self.status = status
    }

    public var formattedFileSize: String {
        ByteCountFormatter.string(fromByteCount: fileSize, countStyle: .file)
    }

    public var localFileUrl: URL? {
        guard let path = localFilePath, !path.isEmpty else { return nil }
        return URL(fileURLWithPath: path)
    }
}
