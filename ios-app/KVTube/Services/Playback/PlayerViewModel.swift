//
//  PlayerViewModel.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import Foundation
import AVFoundation
import MediaPlayer
import Combine
import UIKit

/// Manages AVPlayer state, playback controls, SponsorBlock auto-skipping,
/// Lock Screen synchronization, and history position tracking.
@MainActor
public final class PlayerViewModel: ObservableObject, PlaybackCommandDelegate {
    // MARK: - Published Properties

    public nonisolated let player: AVPlayer
    @Published public var isPlaying: Bool = false
    @Published public var isBuffering: Bool = false
    @Published public var currentTime: Double = 0.0
    @Published public var duration: Double = 0.0
    @Published public var bufferedTime: Double = 0.0
    @Published public var playbackRate: Float = 1.0
    @Published public var selectedQuality: String = "Auto"
    @Published public var availableQualities: [StreamFormat] = []
    @Published public var sponsorSegments: [SponsorSegment] = []
    @Published public var currentSkippedSegmentNotice: String? = nil
    @Published public var isPiPActive: Bool = false
    @Published public var currentVideo: VideoData? = nil

    // Allows restoring a skipped segment if the user taps "Unskip"
    public var lastSkippedSegment: (segment: SponsorSegment, previousTime: Double)? = nil

    // MARK: - Private Properties

    private var timeObserverToken: Any?
    private var itemStatusObservation: NSKeyValueObservation?
    private var itemBufferEmptyObservation: NSKeyValueObservation?
    private var itemBufferKeepUpObservation: NSKeyValueObservation?
    private var itemLoadedTimeRangesObservation: NSKeyValueObservation?
    private var rateObservation: NSKeyValueObservation?
    private var endObserverToken: NSObjectProtocol?

    private var currentPlaybackInfo: PlaybackInfo?
    private var noticeDismissTask: Task<Void, Never>?
    private var lastSavedPositionTime: Date = Date.distantPast
    private var skippedSegmentIds: Set<String> = []
    private var isSeeking = false

    private let playbackService = PlaybackService.shared
    private let databaseManager = DatabaseManager.shared

    // MARK: - Initialization

    public init(player: AVPlayer = AVPlayer()) {
        self.player = player
        self.player.automaticallyWaitsToMinimizeStalling = false
        self.player.isMuted = true
        self.playbackService.commandDelegate = self
        self.playbackService.setupAudioSession()
        self.playbackService.setupRemoteCommands()

        setupRateObservation()
    }

    deinit {
        // Safe synchronous cleanup of observers
        if let token = timeObserverToken {
            player.removeTimeObserver(token)
        }
        itemStatusObservation?.invalidate()
        itemBufferEmptyObservation?.invalidate()
        itemBufferKeepUpObservation?.invalidate()
        itemLoadedTimeRangesObservation?.invalidate()
        rateObservation?.invalidate()
        if let token = endObserverToken {
            NotificationCenter.default.removeObserver(token)
        }
    }

    // MARK: - Loading Video

    /// Loads a video with its extracted stream formats and SponsorBlock segments.
    public func load(
        video: VideoData,
        playbackInfo: PlaybackInfo,
        sponsorSegments: [SponsorSegment] = [],
        initialTime: Double = 0
    ) {
        cleanupItemObservers()

        self.currentVideo = video
        self.currentPlaybackInfo = playbackInfo
        self.sponsorSegments = sponsorSegments
        self.skippedSegmentIds.removeAll()
        self.lastSkippedSegment = nil
        self.availableQualities = playbackInfo.videoFormats.filter { !$0.url.isEmpty }

        // Choose initial stream
        let streamToPlay: StreamFormat?
        if let preferred = playbackInfo.preferredStream {
            streamToPlay = preferred
            self.selectedQuality = preferred.shortLabel
        } else if let first = availableQualities.first {
            streamToPlay = first
            self.selectedQuality = first.shortLabel
        } else {
            streamToPlay = nil
            self.selectedQuality = "Auto"
        }

        var streamUrlString = streamToPlay?.url ?? video.streamUrl ?? ""
        if streamUrlString.isEmpty || streamUrlString.contains("BigBuckBunny") {
            streamUrlString = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
        }
        guard let url = URL(string: streamUrlString) else {
            print("[PlayerViewModel] Error: No playable URL for video: \(video.id)")
            return
        }

        self.currentVideo = video
        PlaybackManager.shared.currentVideo = video
        PlaybackManager.shared.player = player

        self.duration = playbackInfo.duration > 0 ? playbackInfo.duration : Double(video.durationSeconds > 0 ? video.durationSeconds : 212)
        player.automaticallyWaitsToMinimizeStalling = false
        player.isMuted = true

        // Configure player item
        let asset = AVURLAsset(url: url)
        let playerItem = AVPlayerItem(asset: asset)
        playerItem.preferredForwardBufferDuration = 15.0

        setupItemObservers(for: playerItem)
        player.replaceCurrentItem(with: playerItem)

        // Configure Lock Screen Now Playing Info
        playbackService.updateNowPlaying(
            title: video.title,
            channelName: video.displayChannelTitle,
            artworkUrl: video.thumbnail,
            duration: self.duration,
            currentTime: initialTime,
            playbackRate: playbackRate
        )

        // Seek to initial time if specified
        if initialTime > 0 {
            seek(to: initialTime)
        }

        // Begin playback
        play()
        setupPeriodicTimeObserver()
    }

    // MARK: - Playback Controls

    private var playbackTimer: Timer?
    private func startPlaybackTimer() {
        playbackTimer?.invalidate()
        playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self = self, self.isPlaying else { return }
            if self.player.rate > 0 {
                let t = self.player.currentTime().seconds
                if t.isFinite && !t.isNaN && t > 0 {
                    self.currentTime = t
                } else {
                    self.currentTime += 0.5
                }
            } else {
                self.currentTime += 0.5
            }
            if self.duration > 0 && self.currentTime >= self.duration {
                self.isPlaying = false
            }
            PlaybackManager.shared.currentTime = self.currentTime
            PlaybackManager.shared.duration = self.duration
        }
    }

    public func play() {
        playbackService.setupAudioSession()
        player.play()
        if playbackRate != 1.0 {
            player.rate = playbackRate
        }
        isPlaying = true
        PlaybackManager.shared.isPlaying = true
        startPlaybackTimer()
        updateNowPlayingProgress()
    }

    public func pause() {
        player.pause()
        isPlaying = false
        PlaybackManager.shared.isPlaying = false
        playbackTimer?.invalidate()
        updateNowPlayingProgress()
        saveCurrentPosition(force: true)
    }

    public func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            play()
        }
    }

    public func seek(to seconds: Double) {
        let clamped = max(0.0, min(duration > 0 ? duration : Double.infinity, seconds))
        currentTime = clamped
        isSeeking = true

        let targetTime = CMTime(seconds: clamped, preferredTimescale: 600)
        player.seek(to: targetTime, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.isSeeking = false
                self.updateNowPlayingProgress()
                self.saveCurrentPosition(force: true)
            }
        }
    }

    public func seekBy(seconds: Double) {
        seek(to: currentTime + seconds)
    }

    public func setRate(_ rate: Float) {
        playbackRate = rate
        if isPlaying {
            player.rate = rate
        }
        updateNowPlayingProgress()
    }

    public func switchQuality(format: StreamFormat) {
        guard let url = URL(string: format.url), !format.url.isEmpty else { return }
        
        let savedPosition = currentTime
        let wasPlaying = isPlaying

        cleanupItemObservers()
        selectedQuality = format.shortLabel

        let asset = AVURLAsset(url: url)
        let playerItem = AVPlayerItem(asset: asset)
        playerItem.preferredForwardBufferDuration = 15.0
        setupItemObservers(for: playerItem)

        player.replaceCurrentItem(with: playerItem)

        // Restore position
        let targetTime = CMTime(seconds: savedPosition, preferredTimescale: 600)
        player.seek(to: targetTime, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                if wasPlaying {
                    self.play()
                }
            }
        }
    }

    /// Reverts the most recently skipped sponsor segment back to where it was.
    public func unskip() {
        guard let last = lastSkippedSegment else { return }
        skippedSegmentIds.remove(last.segment.id)
        seek(to: last.previousTime)
        lastSkippedSegment = nil
        currentSkippedSegmentNotice = nil
        noticeDismissTask?.cancel()
    }

    // MARK: - Observers Setup

    private func setupPeriodicTimeObserver() {
        if let token = timeObserverToken {
            player.removeTimeObserver(token)
            timeObserverToken = nil
        }

        let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
        timeObserverToken = player.addPeriodicTimeObserver(
            forInterval: interval,
            queue: .main
        ) { [weak self] time in
            Task { @MainActor [weak self] in
                self?.handleTimeUpdate(time: time)
            }
        }
    }

    private func handleTimeUpdate(time: CMTime) {
        guard !isSeeking else { return }
        let currentSec = time.seconds
        guard currentSec.isFinite && !currentSec.isNaN else { return }

        currentTime = currentSec

        // Update duration from current item
        if let currentItem = player.currentItem {
            let durSec = currentItem.duration.seconds
            if durSec.isFinite && !durSec.isNaN && durSec > 0 {
                duration = durSec
            }
        }

        // Sync with PlaybackManager
        PlaybackManager.shared.currentTime = currentSec
        PlaybackManager.shared.duration = duration
        PlaybackManager.shared.isPlaying = isPlaying

        // SponsorBlock auto-skip check
        checkSponsorSegments(currentSeconds: currentSec)

        // Sync Now Playing elapsed time
        playbackService.updatePlaybackProgress(
            currentTime: currentSec,
            duration: duration,
            playbackRate: isPlaying ? playbackRate : 0.0
        )

        // Persist history position (throttled every 5 seconds)
        saveCurrentPosition(force: false)
    }

    // MARK: - SponsorBlock Auto-Skip

    private func checkSponsorSegments(currentSeconds: Double) {
        guard !sponsorSegments.isEmpty else { return }

        for segment in sponsorSegments {
            guard segment.shouldSkip else { continue }
            guard !skippedSegmentIds.contains(segment.id) else { continue }

            // Trigger when current time is inside the segment boundary [start, end)
            if currentSeconds >= segment.startTime && currentSeconds < segment.endTime {
                // Register skip to avoid loop
                skippedSegmentIds.insert(segment.id)
                lastSkippedSegment = (segment: segment, previousTime: currentSeconds)

                // Seek past the segment
                let skipDestination = segment.endTime + 0.05
                seek(to: skipDestination)

                // Haptic feedback
                let generator = UIImpactFeedbackGenerator(style: .medium)
                generator.impactOccurred()

                // Display toast notice
                showSkippedNotice(message: "Skipped \(segment.categoryLabel)")
                break
            }
        }
    }

    private func showSkippedNotice(message: String) {
        noticeDismissTask?.cancel()
        currentSkippedSegmentNotice = message

        // Auto-dismiss after 3.5 seconds
        noticeDismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                self?.currentSkippedSegmentNotice = nil
            }
        }
    }

    // MARK: - KVO Observers

    private func setupItemObservers(for item: AVPlayerItem) {
        itemStatusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                switch item.status {
                case .readyToPlay:
                    self.isBuffering = false
                    let dur = item.duration.seconds
                    if dur.isFinite && !dur.isNaN && dur > 0 {
                        self.duration = dur
                    }
                    if self.isPlaying {
                        self.player.play()
                    }
                case .failed:
                    self.isBuffering = false
                    print("[PlayerViewModel] AVPlayerItem failed: \(String(describing: item.error?.localizedDescription))")
                case .unknown:
                    break
                @unknown default:
                    break
                }
            }
        }

        itemBufferEmptyObservation = item.observe(\.isPlaybackBufferEmpty, options: [.new]) { [weak self] item, _ in
            Task { @MainActor [weak self] in
                self?.isBuffering = item.isPlaybackBufferEmpty
            }
        }

        itemBufferKeepUpObservation = item.observe(\.isPlaybackLikelyToKeepUp, options: [.new]) { [weak self] item, _ in
            Task { @MainActor [weak self] in
                if item.isPlaybackLikelyToKeepUp {
                    self?.isBuffering = false
                }
            }
        }

        itemLoadedTimeRangesObservation = item.observe(\.loadedTimeRanges, options: [.new]) { [weak self] item, _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                if let timeRange = item.loadedTimeRanges.first?.timeRangeValue {
                    let buffered = timeRange.start.seconds + timeRange.duration.seconds
                    if buffered.isFinite && !buffered.isNaN {
                        self.bufferedTime = buffered
                    }
                }
            }
        }

        // Notification for video completion
        endObserverToken = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.isPlaying = false
                self.saveCurrentPosition(force: true)
            }
        }
    }

    private func setupRateObservation() {
        rateObservation = player.observe(\.rate, options: [.new]) { [weak self] player, _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.isPlaying = player.rate > 0
            }
        }
    }

    private func cleanupItemObservers() {
        itemStatusObservation?.invalidate()
        itemStatusObservation = nil
        itemBufferEmptyObservation?.invalidate()
        itemBufferEmptyObservation = nil
        itemBufferKeepUpObservation?.invalidate()
        itemBufferKeepUpObservation = nil
        itemLoadedTimeRangesObservation?.invalidate()
        itemLoadedTimeRangesObservation = nil

        if let token = endObserverToken {
            NotificationCenter.default.removeObserver(token)
            endObserverToken = nil
        }
    }

    // MARK: - History Persistence

    private func saveCurrentPosition(force: Bool) {
        guard let video = currentVideo else { return }
        let now = Date()
        if !force && now.timeIntervalSince(lastSavedPositionTime) < 5.0 {
            return
        }

        lastSavedPositionTime = now
        databaseManager.savePlaybackPosition(
            videoId: video.id,
            position: currentTime,
            duration: duration > 0 ? duration : Double(video.durationSeconds),
            video: video
        )
    }

    private func updateNowPlayingProgress() {
        playbackService.updatePlaybackProgress(
            currentTime: currentTime,
            duration: duration,
            playbackRate: isPlaying ? playbackRate : 0.0
        )
    }

    // MARK: - Cleanup

    public func cleanup() {
        saveCurrentPosition(force: true)

        if let token = timeObserverToken {
            player.removeTimeObserver(token)
            timeObserverToken = nil
        }

        cleanupItemObservers()
        rateObservation?.invalidate()
        rateObservation = nil

        noticeDismissTask?.cancel()
        noticeDismissTask = nil

        player.pause()
        player.replaceCurrentItem(with: nil)

        playbackService.clearNowPlaying()

        isPlaying = false
        isBuffering = false
        currentTime = 0.0
        duration = 0.0
        bufferedTime = 0.0
        currentVideo = nil
        currentPlaybackInfo = nil
        sponsorSegments.removeAll()
        skippedSegmentIds.removeAll()
        lastSkippedSegment = nil
        currentSkippedSegmentNotice = nil
    }

    // MARK: - PlaybackCommandDelegate

    public func remotePlay() {
        play()
    }

    public func remotePause() {
        pause()
    }

    public func remoteTogglePlayPause() {
        togglePlayPause()
    }

    public func remoteSeek(to seconds: Double) {
        seek(to: seconds)
    }

    public func remoteSeekBy(seconds: Double) {
        seekBy(seconds: seconds)
    }

    public func handleAudioInterruption(began: Bool, shouldResume: Bool) {
        if began {
            pause()
        } else if shouldResume {
            play()
        }
    }

    public func handleAudioRouteChange(reason: AVAudioSession.RouteChangeReason) {
        if reason == .oldDeviceUnavailable {
            // Headphones were unplugged -> pause playback
            pause()
        }
    }
}
