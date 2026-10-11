//
//  DatabaseManager.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation
import Combine

// MARK: - LikedVideoItem

/// Video saved in the user's local "Liked Videos" collection.
public struct LikedVideoItem: Codable, Identifiable, Hashable, Sendable {
    public var videoId: String
    public var title: String
    public var uploader: String
    public var channelId: String
    public var thumbnailUrl: String
    public var duration: String
    public var durationSeconds: Int
    public var likedAt: Date

    public var id: String { videoId }

    public init(
        videoId: String,
        title: String,
        uploader: String = "",
        channelId: String = "",
        thumbnailUrl: String = "",
        duration: String = "",
        durationSeconds: Int = 0,
        likedAt: Date = Date()
    ) {
        self.videoId = videoId
        self.title = title
        self.uploader = uploader
        self.channelId = channelId
        self.thumbnailUrl = thumbnailUrl
        self.duration = duration
        self.durationSeconds = durationSeconds
        self.likedAt = likedAt
    }

    public func toVideoData() -> VideoData {
        VideoData(
            videoId: videoId,
            title: title,
            author: uploader,
            authorId: channelId,
            videoThumbnails: [Thumbnail(quality: "medium", url: thumbnailUrl)],
            lengthSeconds: durationSeconds
        )
    }
}

// MARK: - LocalSubscriptionItem

/// Channel subscribed to locally without requiring Invidious server account credentials.
public struct LocalSubscriptionItem: Codable, Identifiable, Hashable, Sendable {
    public var channelId: String
    public var channelName: String
    public var channelAvatar: String
    public var subscribedAt: Date

    public var id: String { channelId }

    public init(
        channelId: String,
        channelName: String,
        channelAvatar: String = "",
        subscribedAt: Date = Date()
    ) {
        self.channelId = channelId
        self.channelName = channelName
        self.channelAvatar = channelAvatar
        self.subscribedAt = subscribedAt
    }

    public func toSubscription() -> Subscription {
        Subscription(
            author: channelName,
            authorId: channelId,
            authorThumbnail: channelAvatar
        )
    }
}

// MARK: - DatabaseManager

/// Standalone zero-dependency persistence layer for Watch History, Liked Videos, Subscriptions, Downloads, and Search History.
/// Saves atomically to disk as JSON files in Application Support.
public class DatabaseManager: ObservableObject {
    public static let shared = DatabaseManager()

    @Published public private(set) var history: [HistoryItem] = []
    @Published public private(set) var likedVideos: [LikedVideoItem] = []
    @Published public private(set) var localSubscriptions: [LocalSubscriptionItem] = []
    @Published public private(set) var subscriptions: [SubscriptionItem] = []
    @Published public private(set) var downloads: [DownloadItem] = []
    @Published public private(set) var searchHistory: [String] = []

    private let ioQueue = DispatchQueue(label: "com.kvtube.databasemanager.io", qos: .utility)
    private let fileManager = FileManager.default

    private lazy var storageDirectory: URL = {
        let paths = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)
        let appSupport = paths.first ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = appSupport.appendingPathComponent("KVTubeData", isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }()

    private var historyFileURL: URL {
        storageDirectory.appendingPathComponent("watch_history.json")
    }

    private var likedFileURL: URL {
        storageDirectory.appendingPathComponent("liked_videos.json")
    }

    private var subscriptionsFileURL: URL {
        storageDirectory.appendingPathComponent("local_subscriptions.json")
    }

    private var channelSubsFileURL: URL {
        storageDirectory.appendingPathComponent("channel_subscriptions.json")
    }

    private var downloadsFileURL: URL {
        storageDirectory.appendingPathComponent("downloads.json")
    }

    private var searchHistoryFileURL: URL {
        storageDirectory.appendingPathComponent("search_history.json")
    }

    public init() {
        loadAll()
    }

    // MARK: - Disk Loading

    private func loadAll() {
        ioQueue.sync {
            let decoder = JSONDecoder()

            // History
            if let data = try? Data(contentsOf: historyFileURL),
               let items = try? decoder.decode([HistoryItem].self, from: data) {
                self.history = items
            }

            // Liked
            if let data = try? Data(contentsOf: likedFileURL),
               let items = try? decoder.decode([LikedVideoItem].self, from: data) {
                self.likedVideos = items
            }

            // Subscriptions
            if let data = try? Data(contentsOf: subscriptionsFileURL),
               let items = try? decoder.decode([LocalSubscriptionItem].self, from: data) {
                self.localSubscriptions = items
            }

            // Channel Subscriptions
            if let data = try? Data(contentsOf: channelSubsFileURL),
               let items = try? decoder.decode([SubscriptionItem].self, from: data) {
                self.subscriptions = items
            }

            // Downloads
            if let data = try? Data(contentsOf: downloadsFileURL),
               let items = try? decoder.decode([DownloadItem].self, from: data) {
                self.downloads = items
            }

            // Search History
            if let data = try? Data(contentsOf: searchHistoryFileURL),
               let items = try? decoder.decode([String].self, from: data) {
                self.searchHistory = items
            }
        }
    }

    private func persistHistory() {
        let items = history
        let file = historyFileURL
        ioQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            if let data = try? encoder.encode(items) {
                try? data.write(to: file, options: .atomic)
            }
        }
    }

    private func persistLiked() {
        let items = likedVideos
        let file = likedFileURL
        ioQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            if let data = try? encoder.encode(items) {
                try? data.write(to: file, options: .atomic)
            }
        }
    }

    private func persistSubscriptions() {
        let items = localSubscriptions
        let file = subscriptionsFileURL
        ioQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            if let data = try? encoder.encode(items) {
                try? data.write(to: file, options: .atomic)
            }
        }
    }

    private func persistChannelSubscriptions() {
        let items = subscriptions
        let file = channelSubsFileURL
        ioQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            if let data = try? encoder.encode(items) {
                try? data.write(to: file, options: .atomic)
            }
        }
    }

    private func persistDownloads() {
        let items = downloads
        let file = downloadsFileURL
        ioQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            if let data = try? encoder.encode(items) {
                try? data.write(to: file, options: .atomic)
            }
        }
    }

    private func persistSearchHistory() {
        let items = searchHistory
        let file = searchHistoryFileURL
        ioQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            if let data = try? encoder.encode(items) {
                try? data.write(to: file, options: .atomic)
            }
        }
    }

    // MARK: - Watch History Operations

    /// Records or updates video playback history, including timestamp and completion status.
    public func recordPlayback(
        videoId: String,
        title: String,
        uploader: String = "",
        channelId: String = "",
        thumbnailUrl: String = "",
        duration: String = "",
        durationSeconds: Int = 0,
        position: Double = 0.0
    ) {
        guard !videoId.isEmpty else { return }

        let isCompleted = durationSeconds > 0 && position >= Double(durationSeconds) * 0.92

        DispatchQueue.main.async {
            var updated = self.history.filter { $0.videoId != videoId }
            let item = HistoryItem(
                videoId: videoId,
                title: title,
                uploader: uploader,
                channelId: channelId,
                thumbnailUrl: thumbnailUrl,
                duration: duration,
                durationSeconds: durationSeconds,
                lastPlaybackPosition: position,
                watchedAt: Date(),
                isCompleted: isCompleted
            )
            // Insert newest at front
            updated.insert(item, at: 0)

            // Keep capped at reasonable size (e.g. 500 entries)
            if updated.count > 500 {
                updated = Array(updated.prefix(500))
            }

            self.history = updated
            self.persistHistory()
        }
    }

    /// Records playback directly using a VideoData object.
    public func recordPlayback(video: VideoData, position: Double) {
        recordPlayback(
            videoId: video.videoId,
            title: video.title,
            uploader: video.author,
            channelId: video.authorId,
            thumbnailUrl: video.bestThumbnail?.url ?? "",
            duration: video.formattedDuration,
            durationSeconds: video.lengthSeconds,
            position: position
        )
    }

    /// Records playback with duration.
    public func recordHistory(video: VideoData, playbackPosition: Double, duration: Double) {
        recordPlayback(
            videoId: video.id,
            title: video.title,
            uploader: video.uploader,
            channelId: video.channelId,
            thumbnailUrl: video.thumbnail,
            duration: video.duration,
            durationSeconds: Int(duration),
            position: playbackPosition
        )
    }

    /// Saves playback position for resume.
    public func savePlaybackPosition(videoId: String, position: Double, duration: Double, video: VideoData? = nil) {
        if let video = video {
            recordHistory(video: video, playbackPosition: position, duration: duration)
        } else {
            updatePlaybackPosition(videoId: videoId, position: position)
        }
    }

    /// Updates only the playback timestamp position for a video without changing metadata.
    public func updatePlaybackPosition(videoId: String, position: Double) {
        guard !videoId.isEmpty else { return }

        DispatchQueue.main.async {
            guard let idx = self.history.firstIndex(where: { $0.videoId == videoId }) else { return }
            var item = self.history[idx]
            item.playbackPositionSeconds = position
            item.watchedAt = Date()
            if item.durationSeconds > 0 && position >= item.durationSeconds * 0.92 {
                item.isCompleted = true
            }
            self.history[idx] = item
            self.persistHistory()
        }
    }

    /// Retrieves last saved playback position in seconds (useful for resume playback).
    public func getPlaybackPosition(videoId: String) -> Double? {
        guard let item = history.first(where: { $0.videoId == videoId }) else { return nil }
        // If completed or near end, start from beginning
        if item.isCompleted { return 0 }
        return item.playbackPositionSeconds > 5 ? item.playbackPositionSeconds : nil
    }

    public func getPlaybackPosition(for videoId: String) -> Double? {
        getPlaybackPosition(videoId: videoId)
    }

    /// Removes a specific video from watch history.
    public func removeFromHistory(videoId: String) {
        DispatchQueue.main.async {
            self.history.removeAll { $0.videoId == videoId }
            self.persistHistory()
        }
    }

    public func removeHistoryItem(videoId: String) {
        removeFromHistory(videoId: videoId)
    }

    /// Clears the entire local watch history.
    public func clearHistory() {
        DispatchQueue.main.async {
            self.history.removeAll()
            self.persistHistory()
        }
    }

    // MARK: - Liked Videos Operations

    public func isLiked(videoId: String) -> Bool {
        likedVideos.contains(where: { $0.videoId == videoId })
    }

    public func likeVideo(_ video: VideoData) {
        guard !video.videoId.isEmpty else { return }

        DispatchQueue.main.async {
            guard !self.isLiked(videoId: video.videoId) else { return }
            let item = LikedVideoItem(
                videoId: video.videoId,
                title: video.title,
                uploader: video.author,
                channelId: video.authorId,
                thumbnailUrl: video.bestThumbnail?.url ?? "",
                duration: video.formattedDuration,
                durationSeconds: video.lengthSeconds,
                likedAt: Date()
            )
            self.likedVideos.insert(item, at: 0)
            self.persistLiked()
        }
    }

    public func unlikeVideo(videoId: String) {
        DispatchQueue.main.async {
            self.likedVideos.removeAll { $0.videoId == videoId }
            self.persistLiked()
        }
    }

    public func toggleLike(video: VideoData) {
        if isLiked(videoId: video.videoId) {
            unlikeVideo(videoId: video.videoId)
        } else {
            likeVideo(video)
        }
    }

    public func clearLiked() {
        DispatchQueue.main.async {
            self.likedVideos.removeAll()
            self.dislikedVideoIds.removeAll()
            self.persistLiked()
        }
    }

    // MARK: - Likes & Dislikes Extended

    @Published public private(set) var dislikedVideoIds: Set<String> = []

    public func isDisliked(videoId: String) -> Bool {
        dislikedVideoIds.contains(videoId)
    }

    public func setLiked(videoId: String, isLiked: Bool) {
        if isLiked {
            if !self.isLiked(videoId: videoId) {
                likeVideo(VideoData(id: videoId))
            }
            dislikedVideoIds.remove(videoId)
        } else {
            unlikeVideo(videoId: videoId)
        }
    }

    public func setDisliked(videoId: String, isDisliked: Bool) {
        DispatchQueue.main.async {
            if isDisliked {
                self.dislikedVideoIds.insert(videoId)
                self.unlikeVideo(videoId: videoId)
            } else {
                self.dislikedVideoIds.remove(videoId)
            }
        }
    }

    public func setSubscribed(channelId: String, channelTitle: String, thumbnail: String, isSubscribed: Bool) {
        if isSubscribed {
            subscribeLocally(channelId: channelId, name: channelTitle, avatar: thumbnail)
        } else {
            unsubscribeLocally(channelId: channelId)
        }
    }

    // MARK: - Local Subscriptions Operations

    public func isLocallySubscribed(channelId: String) -> Bool {
        localSubscriptions.contains(where: { $0.channelId == channelId }) ||
        subscriptions.contains(where: { $0.channelId == channelId })
    }

    public func isSubscribed(channelId: String) -> Bool {
        isLocallySubscribed(channelId: channelId)
    }

    public func subscribe(channelId: String, title: String, avatar: String = "") {
        subscribeLocally(channelId: channelId, name: title, avatar: avatar)
    }

    public func subscribeLocally(channelId: String, name: String, avatar: String = "") {
        guard !channelId.isEmpty else { return }

        DispatchQueue.main.async {
            guard !self.isLocallySubscribed(channelId: channelId) else { return }
            let item = LocalSubscriptionItem(
                channelId: channelId,
                channelName: name,
                channelAvatar: avatar,
                subscribedAt: Date()
            )
            self.localSubscriptions.insert(item, at: 0)
            self.persistSubscriptions()

            let subItem = SubscriptionItem(
                channelId: channelId,
                channelTitle: name,
                channelAvatar: avatar,
                subscribedAt: Date()
            )
            self.subscriptions.insert(subItem, at: 0)
            self.persistChannelSubscriptions()
        }
    }

    public func unsubscribeLocally(channelId: String) {
        DispatchQueue.main.async {
            self.localSubscriptions.removeAll { $0.channelId == channelId }
            self.subscriptions.removeAll { $0.channelId == channelId }
            self.persistSubscriptions()
            self.persistChannelSubscriptions()
        }
    }

    public func unsubscribe(channelId: String) {
        unsubscribeLocally(channelId: channelId)
    }

    public func toggleSubscription(channel: ChannelInfo) {
        if isSubscribed(channelId: channel.authorId) {
            unsubscribeLocally(channelId: channel.authorId)
        } else {
            subscribeLocally(
                channelId: channel.authorId,
                name: channel.author,
                avatar: channel.bestAvatar?.url ?? ""
            )
        }
    }

    public func toggleLocalSubscription(channelId: String, name: String, avatar: String = "") {
        if isLocallySubscribed(channelId: channelId) {
            unsubscribeLocally(channelId: channelId)
        } else {
            subscribeLocally(channelId: channelId, name: name, avatar: avatar)
        }
    }

    public func importSubscriptions(_ remoteSubs: [Subscription]) {
        DispatchQueue.main.async {
            for sub in remoteSubs {
                guard !self.isSubscribed(channelId: sub.authorId) else { continue }
                let item = SubscriptionItem(
                    channelId: sub.authorId,
                    channelTitle: sub.author,
                    channelAvatar: sub.authorThumbnail ?? "",
                    subscribedAt: Date()
                )
                self.subscriptions.append(item)
            }
            self.persistChannelSubscriptions()
        }
    }

    public func importSubscriptions(_ items: [SubscriptionItem]) {
        DispatchQueue.main.async {
            for item in items {
                guard !self.isSubscribed(channelId: item.channelId) else { continue }
                self.subscriptions.append(item)
            }
            self.persistChannelSubscriptions()
        }
    }

    public func clearLocalSubscriptions() {
        DispatchQueue.main.async {
            self.localSubscriptions.removeAll()
            self.subscriptions.removeAll()
            self.persistSubscriptions()
            self.persistChannelSubscriptions()
        }
    }

    // MARK: - Downloads Operations

    public func saveDownload(_ item: DownloadItem) {
        DispatchQueue.main.async {
            self.downloads.removeAll { $0.videoId == item.videoId }
            self.downloads.insert(item, at: 0)
            self.persistDownloads()
        }
    }

    public func removeDownload(videoId: String) {
        DispatchQueue.main.async {
            self.downloads.removeAll { $0.videoId == videoId }
            self.persistDownloads()
        }
    }

    // MARK: - Search History Operations

    public func addSearchQuery(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        DispatchQueue.main.async {
            self.searchHistory.removeAll { $0.lowercased() == trimmed.lowercased() }
            self.searchHistory.insert(trimmed, at: 0)
            if self.searchHistory.count > 25 {
                self.searchHistory = Array(self.searchHistory.prefix(25))
            }
            self.persistSearchHistory()
        }
    }

    public func removeSearchQuery(_ query: String) {
        DispatchQueue.main.async {
            self.searchHistory.removeAll { $0 == query }
            self.persistSearchHistory()
        }
    }

    public func clearSearchHistory() {
        DispatchQueue.main.async {
            self.searchHistory.removeAll()
            self.persistSearchHistory()
        }
    }
}
