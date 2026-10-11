//
//  DownloadManager.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation
import Combine

/// Background download manager for offline video playback.
/// Uses a background URLSession to continue downloads when the app is suspended.
public class DownloadManager: NSObject, ObservableObject {
    public static let shared = DownloadManager()

    public static let backgroundSessionIdentifier = "com.kvtube.downloads"

    @Published public private(set) var downloadedItems: [DownloadedItem] = []
    @Published public var activeDownloads: [String: Double] = [:]
    @Published public private(set) var totalStorageUsage: Int64 = 0

    public var totalDiskUsageFormatted: String {
        ByteCountFormatter.string(fromByteCount: totalStorageUsage, countStyle: .file)
    }

    public var backgroundCompletionHandler: (() -> Void)?

    private var urlSession: URLSession!
    private let fileManager = FileManager.default
    private let ioQueue = DispatchQueue(label: "com.kvtube.downloadmanager.io", qos: .utility)

    // Storage directory: Documents/Downloads
    public lazy var downloadsDirectory: URL = {
        let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docs.appendingPathComponent("Downloads", isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }()

    public var downloadsFolder: URL {
        downloadsDirectory
    }

    private var catalogFileURL: URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = appSupport.appendingPathComponent("KVTubeData", isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir.appendingPathComponent("downloaded_videos.json")
    }

    // Task description metadata for background resumption
    private struct TaskMetadata: Codable {
        let videoId: String
        let title: String
        let author: String
        let thumbnailUrl: String
        let durationSeconds: Int
    }

    public override init() {
        super.init()
        let config = URLSessionConfiguration.background(withIdentifier: Self.backgroundSessionIdentifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        self.urlSession = URLSession(configuration: config, delegate: self, delegateQueue: nil)

        loadCatalog()
        cleanMissingFiles()
        updateStorageUsage()
        restoreActiveTasks()
    }

    // MARK: - Catalog Persistence

    private func loadCatalog() {
        ioQueue.sync {
            guard let data = try? Data(contentsOf: catalogFileURL),
                  let items = try? JSONDecoder().decode([DownloadedItem].self, from: data) else {
                return
            }
            self.downloadedItems = items
        }
    }

    private func persistCatalog() {
        let items = downloadedItems
        let file = catalogFileURL
        ioQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            if let data = try? encoder.encode(items) {
                try? data.write(to: file, options: .atomic)
            }
        }
    }

    /// Prunes database entries if the physical file on disk was deleted externally.
    private func cleanMissingFiles() {
        var existing: [DownloadedItem] = []
        for item in downloadedItems {
            if fileManager.fileExists(atPath: item.localFilePath) {
                existing.append(item)
            }
        }
        if existing.count != downloadedItems.count {
            downloadedItems = existing
            persistCatalog()
        }
    }

    public func updateStorageUsage() {
        var total: Int64 = 0
        for item in downloadedItems {
            if let attrs = try? fileManager.attributesOfItem(atPath: item.localFilePath),
               let size = attrs[.size] as? Int64 {
                total += size
            }
        }
        DispatchQueue.main.async {
            self.totalStorageUsage = total
        }
    }

    public var storageUsageString: String {
        ByteCountFormatter.string(fromByteCount: totalStorageUsage, countStyle: .file)
    }

    private func restoreActiveTasks() {
        urlSession.getAllTasks { tasks in
            DispatchQueue.main.async {
                for task in tasks {
                    if let meta = self.decodeMetadata(from: task.taskDescription) {
                        if self.activeDownloads[meta.videoId] == nil {
                            self.activeDownloads[meta.videoId] = 0.0
                        }
                    }
                }
            }
        }
    }

    // MARK: - Public Operations

    /// Starts downloading a video stream to disk using direct stream URL.
    public func startDownload(video: VideoData, streamUrl: URL) {
        let videoId = video.videoId
        guard !videoId.isEmpty else { return }

        // Already downloaded or active
        if isDownloaded(videoId: videoId) || isDownloading(videoId: videoId) {
            return
        }

        let metadata = TaskMetadata(
            videoId: video.videoId,
            title: video.title,
            author: video.author,
            thumbnailUrl: video.bestThumbnail?.url ?? "",
            durationSeconds: video.lengthSeconds
        )

        let task = urlSession.downloadTask(with: streamUrl)
        task.taskDescription = encodeMetadata(metadata)

        let downloadItem = DownloadItem(
            videoId: video.videoId,
            title: video.title,
            channelTitle: video.author,
            duration: video.formattedDuration,
            thumbnail: video.bestThumbnail?.url ?? "",
            quality: "720p",
            fileSize: 0,
            downloadedAt: Date(),
            localFilePath: nil,
            progress: 0.0,
            status: .downloading
        )

        DispatchQueue.main.async {
            self.activeDownloads[videoId] = 0.0
            DatabaseManager.shared.saveDownload(downloadItem)
        }

        task.resume()
    }

    /// Convenience starter resolving stream URL from Invidious server.
    public func startDownload(video: VideoData, quality: String = "720p") {
        let base = SettingsStore.shared.cleanServerUrl()
        guard !base.isEmpty, let url = URL(string: "\(base)/latest_version?id=\(video.id)&itag=22") else {
            return
        }
        startDownload(video: video, streamUrl: url)
    }

    /// Cancels an active download for a given video ID.
    public func cancelDownload(videoId: String) {
        urlSession.getAllTasks { tasks in
            for task in tasks {
                if let meta = self.decodeMetadata(from: task.taskDescription), meta.videoId == videoId {
                    task.cancel()
                }
            }
        }
        DispatchQueue.main.async {
            self.activeDownloads.removeValue(forKey: videoId)
        }
    }

    /// Deletes a downloaded video from the filesystem, catalog, and DatabaseManager.
    public func deleteDownloadedItem(videoId: String) {
        let dest = downloadsDirectory.appendingPathComponent("\(videoId).mp4")
        try? fileManager.removeItem(at: dest)

        DispatchQueue.main.async {
            if let item = self.downloadedItems.first(where: { $0.videoId == videoId }) {
                try? self.fileManager.removeItem(atPath: item.localFilePath)
            }
            self.downloadedItems.removeAll { $0.videoId == videoId }
            self.activeDownloads.removeValue(forKey: videoId)
            self.persistCatalog()
            DatabaseManager.shared.removeDownload(videoId: videoId)
            self.updateStorageUsage()
        }
    }

    public func deleteDownload(videoId: String) {
        deleteDownloadedItem(videoId: videoId)
    }

    /// Checks if a video is downloaded and available on disk.
    public func isDownloaded(videoId: String) -> Bool {
        downloadedItems.contains(where: { $0.videoId == videoId && $0.fileExists })
    }

    /// Checks if a video is currently downloading.
    public func isDownloading(videoId: String) -> Bool {
        activeDownloads[videoId] != nil
    }

    /// Retrieves current download progress (0.0 ... 1.0).
    public func progressFor(videoId: String) -> Double {
        activeDownloads[videoId] ?? 0.0
    }

    /// Returns local file URL if downloaded.
    public func localURLFor(videoId: String) -> URL? {
        guard let item = downloadedItems.first(where: { $0.videoId == videoId && $0.fileExists }) else {
            return nil
        }
        return item.fileURL
    }

    // MARK: - Metadata Serialization

    private func encodeMetadata(_ meta: TaskMetadata) -> String? {
        guard let data = try? JSONEncoder().encode(meta) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func decodeMetadata(from desc: String?) -> TaskMetadata? {
        guard let desc = desc, let data = desc.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(TaskMetadata.self, from: data)
    }
}

// MARK: - URLSessionDownloadDelegate

extension DownloadManager: URLSessionDownloadDelegate {
    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard let meta = decodeMetadata(from: downloadTask.taskDescription) else { return }

        let targetFilename = "\(meta.videoId).mp4"
        let targetDestination = downloadsDirectory.appendingPathComponent(targetFilename)

        // Remove existing file if any
        try? fileManager.removeItem(at: targetDestination)

        do {
            try fileManager.moveItem(at: location, to: targetDestination)
            let attributes = try? fileManager.attributesOfItem(atPath: targetDestination.path)
            let fileSize = (attributes?[.size] as? NSNumber)?.int64Value ?? 0

            let item = DownloadedItem(
                videoId: meta.videoId,
                title: meta.title,
                author: meta.author,
                thumbnailUrl: meta.thumbnailUrl,
                localFilePath: targetDestination.path,
                fileSizeBytes: fileSize,
                downloadedAt: Date(),
                durationSeconds: meta.durationSeconds
            )

            let downloadItem = DownloadItem(
                videoId: meta.videoId,
                title: meta.title,
                channelTitle: meta.author,
                duration: item.formattedDuration,
                thumbnail: meta.thumbnailUrl,
                quality: "720p",
                fileSize: fileSize,
                downloadedAt: Date(),
                localFilePath: targetDestination.path,
                progress: 1.0,
                status: .completed
            )

            DispatchQueue.main.async {
                self.downloadedItems.removeAll { $0.videoId == meta.videoId }
                self.downloadedItems.insert(item, at: 0)
                self.activeDownloads.removeValue(forKey: meta.videoId)
                self.persistCatalog()
                DatabaseManager.shared.saveDownload(downloadItem)
                self.updateStorageUsage()
            }
        } catch {
            DispatchQueue.main.async {
                self.activeDownloads.removeValue(forKey: meta.videoId)
            }
        }
    }

    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        guard let meta = decodeMetadata(from: downloadTask.taskDescription) else { return }
        guard totalBytesExpectedToWrite > 0 else { return }

        let progress = min(1.0, max(0.0, Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)))

        DispatchQueue.main.async {
            self.activeDownloads[meta.videoId] = progress
        }
    }

    public func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        guard let meta = decodeMetadata(from: task.taskDescription) else { return }

        DispatchQueue.main.async {
            self.activeDownloads.removeValue(forKey: meta.videoId)
        }
    }

    public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.backgroundCompletionHandler?()
            self.backgroundCompletionHandler = nil
        }
    }
}
