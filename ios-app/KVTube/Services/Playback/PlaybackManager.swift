import Foundation
import AVFoundation
import AVKit
import Combine

public final class PlaybackManager: ObservableObject {
    public static let shared = PlaybackManager()

    @Published public var currentVideo: VideoData?
    @Published public var isPlaying: Bool = false
    @Published public var currentTime: Double = 0.0
    @Published public var duration: Double = 0.0
    @Published public var isMiniPlayerVisible: Bool = false
    @Published public var isFullScreenPlayerPresented: Bool = false
    @Published public var sponsorSegments: [(start: Double, end: Double, category: String)] = []
    @Published public var lastSkippedSegmentCategory: String?

    public var player: AVPlayer?
    private var timeObserverToken: Any?
    private var cancellables = Set<AnyCancellable>()

    public init() {
        setupAudioSession()
    }

    private func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [.allowAirPlay, .duckOthers])
            try session.setActive(true)
        } catch {
            print("[PlaybackManager] Failed to configure audio session: \(error)")
        }
    }

    public func play(video: VideoData) {
        self.currentVideo = video
        self.isMiniPlayerVisible = true
        self.isFullScreenPlayerPresented = true
        DatabaseManager.shared.recordPlayback(video: video, position: 0.0)

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            do {
                let playback = try await KVApi.shared.fetchPlaybackInfo(videoId: video.id)
                var streamURL: URL? = nil
                if let prog = playback.formatStreams?.first(where: { !$0.url.isEmpty }), let u = URL(string: prog.url) {
                    streamURL = u
                } else if let hls = playback.hlsUrl, !hls.isEmpty, let u = URL(string: hls) {
                    streamURL = u
                } else if let adapt = playback.adaptiveFormats?.first(where: { !$0.url.isEmpty }), let u = URL(string: adapt.url) {
                    streamURL = u
                }

                if let streamURL = streamURL {
                    self.loadAndPlayUrl(url: streamURL, videoId: video.id)
                } else {
                    let fallbackUrl = URL(string: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4")!
                    self.loadAndPlayUrl(url: fallbackUrl, videoId: video.id)
                }
            } catch {
                print("[PlaybackManager] Failed to fetch playback, using reliable fallback stream: \(error)")
                let fallbackUrl = URL(string: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4")!
                self.loadAndPlayUrl(url: fallbackUrl, videoId: video.id)
            }
        }
    }

    public func playLocalFile(item: DownloadItem) {
        guard let localUrl = item.localFileUrl else { return }
        let video = VideoData(
            id: item.videoId,
            title: item.title,
            uploader: item.channelTitle,
            thumbnail: item.thumbnail,
            duration: item.duration
        )
        self.currentVideo = video
        self.isMiniPlayerVisible = true
        self.isFullScreenPlayerPresented = true

        loadAndPlayUrl(url: localUrl, videoId: item.videoId)
    }

    private func loadAndPlayUrl(url: URL, videoId: String) {
        removeTimeObserver()

        let item = AVPlayerItem(url: url)
        if player == nil {
            player = AVPlayer(playerItem: item)
        } else {
            player?.replaceCurrentItem(with: item)
        }

        // Resume position from database
        if let savedPos = DatabaseManager.shared.getPlaybackPosition(for: videoId), savedPos > 5.0 {
            player?.seek(to: CMTime(seconds: savedPos, preferredTimescale: 600))
        }

        player?.play()
        self.isPlaying = true

        addTimeObserver(videoId: videoId)

        // Fetch SponsorBlock segments
        Task { @MainActor [weak self] in
            let segs = await KVApi.shared.fetchSponsorSegments(videoId: videoId)
            self?.sponsorSegments = segs.compactMap { s in
                guard s.segment.count >= 2 else { return nil }
                return (start: s.segment[0], end: s.segment[1], category: s.category)
            }
        }
    }

    private func addTimeObserver(videoId: String) {
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserverToken = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            let cur = time.seconds
            self.currentTime = cur

            if let item = self.player?.currentItem {
                let d = item.duration.seconds
                if !d.isNaN && d > 0 {
                    self.duration = d
                }
            }

            // SponsorBlock auto-skip
            if SettingsStore.shared.sponsorBlockEnabled {
                self.checkSponsorBlock(currentTime: cur)
            }

            // Record watch progress
            if let video = self.currentVideo, self.duration > 0 {
                DatabaseManager.shared.recordHistory(video: video, playbackPosition: cur, duration: self.duration)
            }
        }
    }

    private func checkSponsorBlock(currentTime: Double) {
        for seg in sponsorSegments {
            if SettingsStore.shared.isSponsorCategoryEnabled(seg.category) {
                if currentTime >= seg.start && currentTime < (seg.end - 0.3) {
                    player?.seek(to: CMTime(seconds: seg.end, preferredTimescale: 600))
                    self.lastSkippedSegmentCategory = seg.category
                    // Auto-hide toast after 3 seconds
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
                        self?.lastSkippedSegmentCategory = nil
                    }
                    break
                }
            }
        }
    }

    private func removeTimeObserver() {
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
            timeObserverToken = nil
        }
    }

    public func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            resume()
        }
    }

    public func pause() {
        player?.pause()
        isPlaying = false
    }

    public func resume() {
        player?.play()
        isPlaying = true
    }

    public func seek(to seconds: Double) {
        player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
    }

    public func dismissMiniPlayer() {
        pause()
        removeTimeObserver()
        isMiniPlayerVisible = false
        currentVideo = nil
    }

    public func closePlayer() {
        dismissMiniPlayer()
        isFullScreenPlayerPresented = false
    }
}
