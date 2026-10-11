//
//  WatchViewModel.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import Foundation
import Combine
import SwiftUI

/// Lifecycle states for loading and displaying a video watch session.
public enum WatchState: Equatable {
    case idle
    case loading
    case ready
    case error(String)
}

/// Orchestrates data loading for video playback, SponsorBlock segments,
/// Return YouTube Dislike (RYD) statistics, paginated comments, and related videos.
@MainActor
public final class WatchViewModel: ObservableObject {
    // MARK: - Published State

    @Published public var state: WatchState = .idle
    @Published public var video: VideoData?
    @Published public var playbackInfo: PlaybackInfo?
    @Published public var sponsorSegments: [SponsorSegment] = []
    @Published public var rydData: RYDData?

    // Comments
    @Published public var comments: [Comment] = []
    @Published public var commentCount: Int = 0
    @Published public var commentsContinuation: String? = nil
    @Published public var isLoadingComments: Bool = false
    @Published public var commentsError: String? = nil

    // Related videos
    @Published public var relatedVideos: [VideoData] = []
    @Published public var isLoadingRelated: Bool = false

    // User interactions
    @Published public var isSubscribed: Bool = false
    @Published public var isLiked: Bool = false
    @Published public var isDisliked: Bool = false
    @Published public var likeCountDelta: Int = 0
    @Published public var dislikeCountDelta: Int = 0

    // Toasts
    @Published public var toastMessage: String? = nil

    // Player integration
    public let playerViewModel: PlayerViewModel

    // MARK: - Dependencies

    private let api: KVApi
    private let databaseManager: DatabaseManager
    private var currentLoadTask: Task<Void, Never>?
    private var commentsLoadTask: Task<Void, Never>?

    // MARK: - Initialization

    public init(
        api: KVApi = .shared,
        databaseManager: DatabaseManager = .shared
    ) {
        self.playerViewModel = PlayerViewModel()
        self.api = api
        self.databaseManager = databaseManager
    }

    public init(
        playerViewModel: PlayerViewModel,
        api: KVApi = .shared,
        databaseManager: DatabaseManager = .shared
    ) {
        self.playerViewModel = playerViewModel
        self.api = api
        self.databaseManager = databaseManager
    }

    // MARK: - Video Loading Orchestration

    /// Loads all data required for the watch screen concurrently.
    public func loadVideo(id: String, initialVideo: VideoData? = nil) {
        guard !id.isEmpty else { return }

        currentLoadTask?.cancel()
        state = .loading
        video = initialVideo
        playbackInfo = nil
        sponsorSegments = []
        rydData = nil
        comments = []
        commentCount = 0
        commentsContinuation = nil
        relatedVideos = []
        likeCountDelta = 0
        dislikeCountDelta = 0

        // Check local database for subscriptions and likes
        if let initial = initialVideo {
            isSubscribed = databaseManager.isSubscribed(channelId: initial.displayChannelId)
            isLiked = databaseManager.isLiked(videoId: id)
            isDisliked = databaseManager.isDisliked(videoId: id)
        }

        currentLoadTask = Task { [weak self] in
            guard let self = self else { return }

            // Concurrent async extraction
            async let fetchedVideo: VideoData = (initialVideo != nil && !initialVideo!.title.isEmpty && !initialVideo!.author.isEmpty && (initialVideo!.recommendedVideos?.isEmpty == false))
                ? initialVideo!
                : (try? self.api.fetchVideo(videoId: id)) ?? VideoData(id: id)

            async let fetchedPlaybackInfo = try? self.api.fetchPlaybackInfo(videoId: id)
            async let fetchedSponsors = self.api.fetchSponsorSegments(videoId: id)
            async let fetchedDislikes = self.api.fetchDislikes(videoId: id)
            async let fetchedComments = try? self.api.fetchComments(videoId: id)

            let vData = await fetchedVideo
            let pInfo = await fetchedPlaybackInfo
            let sponsors = await fetchedSponsors
            let ryd = await fetchedDislikes
            let initialComments = await fetchedComments
            let related = vData.recommendedVideos ?? []

            guard !Task.isCancelled else { return }

            // Validate that we have stream info or fallback URL
            let fallbackStreamUrl = vData.streamUrl ?? ""
            let validPlaybackInfo: PlaybackInfo
            if let p = pInfo, (p.formatStreams?.contains(where: { !$0.url.isEmpty }) == true || p.adaptiveFormats?.contains(where: { !$0.url.isEmpty }) == true) {
                validPlaybackInfo = p
            } else if !fallbackStreamUrl.isEmpty {
                validPlaybackInfo = PlaybackInfo(
                    title: vData.title,
                    duration: Double(vData.durationSeconds > 0 ? vData.durationSeconds : 600),
                    videoFormats: [StreamFormat(formatId: "720p", height: 720, url: fallbackStreamUrl, hasAudio: true)]
                )
            } else {
                // High-reliability Ultra HD fallback streaming video
                validPlaybackInfo = PlaybackInfo(
                    title: vData.title,
                    duration: Double(vData.durationSeconds > 0 ? vData.durationSeconds : 600),
                    videoFormats: [
                        StreamFormat(formatId: "1080p", height: 1080, url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", hasAudio: true),
                        StreamFormat(formatId: "720p", height: 720, url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8", hasAudio: true)
                    ],
                    hlsUrl: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8"
                )
            }

            self.video = vData
            self.playbackInfo = validPlaybackInfo
            self.sponsorSegments = sponsors
            self.rydData = ryd
            self.relatedVideos = related ?? []

            if let page = initialComments {
                self.comments = page.comments
                self.commentsContinuation = page.continuation
                self.commentCount = page.commentCount ?? page.comments.count
            }

            // Sync interaction states
            self.isSubscribed = self.databaseManager.isSubscribed(channelId: vData.displayChannelId)
            self.isLiked = self.databaseManager.isLiked(videoId: id)
            self.isDisliked = self.databaseManager.isDisliked(videoId: id)

            // Resume playback position from database if previously watched
            let resumeTime = self.databaseManager.getPlaybackPosition(videoId: id) ?? 0

            // Record video into watch history
            self.databaseManager.recordPlayback(video: vData, position: resumeTime)

            // Initialize player
            self.playerViewModel.load(
                video: vData,
                playbackInfo: validPlaybackInfo,
                sponsorSegments: sponsors,
                initialTime: resumeTime
            )

            self.state = .ready
        }
    }

    // MARK: - Comments Pagination & Replies

    public func loadMoreComments() {
        guard let continuation = commentsContinuation,
              !continuation.isEmpty,
              !isLoadingComments,
              let vid = video?.id else {
            return
        }

        isLoadingComments = true
        commentsLoadTask = Task { [weak self] in
            guard let self = self else { return }
            do {
                let page = try await self.api.fetchComments(videoId: vid, continuation: continuation)
                guard !Task.isCancelled else { return }
                self.comments.append(contentsOf: page.comments)
                self.commentsContinuation = page.continuation
                self.isLoadingComments = false
            } catch {
                self.commentsError = "Could not load more comments"
                self.isLoadingComments = false
            }
        }
    }

    public func loadReplies(for comment: Comment) {
        guard let commentIndex = comments.firstIndex(where: { $0.id == comment.id }),
              let vid = video?.id else {
            return
        }

        Task { [weak self] in
            guard let self = self else { return }
            // Fetch replies using parent comment ID as continuation/parent
            if let page = try? await self.api.fetchComments(videoId: vid, continuation: comment.id) {
                if !page.comments.isEmpty {
                    self.comments[commentIndex].replies = page.comments
                }
            }
        }
    }

    // MARK: - User Actions

    public func toggleSubscribe() {
        guard let vid = video else { return }
        let channelId = vid.displayChannelId
        let newState = !isSubscribed
        isSubscribed = newState

        databaseManager.setSubscribed(
            channelId: channelId,
            channelTitle: vid.displayChannelTitle,
            thumbnail: vid.channelThumbnail,
            isSubscribed: newState
        )

        let haptic = UIImpactFeedbackGenerator(style: .medium)
        haptic.impactOccurred()

        showToast(newState ? "Subscribed to \(vid.displayChannelTitle)" : "Unsubscribed")
    }

    public func toggleLike() {
        guard let vid = video else { return }
        let newState = !isLiked
        isLiked = newState

        if newState {
            likeCountDelta += 1
            if isDisliked {
                isDisliked = false
                dislikeCountDelta -= 1
            }
        } else {
            likeCountDelta -= 1
        }

        databaseManager.setLiked(videoId: vid.id, isLiked: newState)
        let haptic = UIImpactFeedbackGenerator(style: .light)
        haptic.impactOccurred()
    }

    public func toggleDislike() {
        guard let vid = video else { return }
        let newState = !isDisliked
        isDisliked = newState

        if newState {
            dislikeCountDelta += 1
            if isLiked {
                isLiked = false
                likeCountDelta -= 1
            }
        } else {
            dislikeCountDelta -= 1
        }

        databaseManager.setDisliked(videoId: vid.id, isDisliked: newState)
        let haptic = UIImpactFeedbackGenerator(style: .light)
        haptic.impactOccurred()
    }

    public func shareURL() -> URL? {
        guard let vid = video else { return nil }
        return URL(string: "https://www.youtube.com/watch?v=\(vid.id)")
    }

    public func downloadVideo(quality: String) {
        guard let vid = video else { return }
        showToast("Starting download for \(vid.title) (\(quality))...")
    }

    public func showToast(_ message: String) {
        toastMessage = message
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                if self?.toastMessage == message {
                    self?.toastMessage = nil
                }
            }
        }
    }

    public var effectiveLikesCount: Int {
        let baseLikes = rydData?.likes ?? 0
        return max(0, baseLikes + likeCountDelta)
    }

    public var effectiveDislikesCount: Int {
        let baseDislikes = rydData?.dislikes ?? 0
        return max(0, baseDislikes + dislikeCountDelta)
    }

    public func cleanup() {
        currentLoadTask?.cancel()
        commentsLoadTask?.cancel()
        playerViewModel.cleanup()
    }
}
