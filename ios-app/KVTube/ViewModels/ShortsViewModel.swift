import Foundation
import AVFoundation
import SwiftUI
import Combine

public final class ShortsViewModel: ObservableObject {
    @Published public var shorts: [VideoData] = []
    @Published public var currentIndex: Int = 0
    @Published public var isLoading: Bool = false
    @Published public var isMuted: Bool = false
    @Published public var likedShorts: Set<String> = []
    @Published public var dislikedShorts: Set<String> = []
    @Published public var activeCommentsShortId: String? = nil

    public var player: AVPlayer = AVPlayer()
    private var loopObserver: Any?
    private let api: KVApi

    public init(api: KVApi = .shared) {
        self.api = api
        self.isMuted = true
        self.player.isMuted = true
        setupLooping()
    }

    private func setupLooping() {
        loopObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] notif in
            guard let self = self,
                  let currentItem = self.player.currentItem,
                  (notif.object as? AVPlayerItem) == currentItem else { return }
            self.player.seek(to: .zero)
            self.player.play()
        }
    }

    deinit {
        if let observer = loopObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    @MainActor
    public func loadShorts() async {
        guard shorts.isEmpty else { return }
        isLoading = true

        do {
            let reg = SettingsStore.shared.region
            let query = (reg == "VN") ? "#shorts việt nam trending" : "#shorts trending"
            var extracted = try await api.search(
                query: query,
                type: "video"
            )

            if extracted.isEmpty {
                // Fallback to trending
                let trend = try await api.fetchTrending(region: reg)
                extracted = trend.filter { $0.lengthSeconds <= 90 || $0.isShort }
            }

            self.shorts = extracted
            if let first = extracted.first {
                playShort(first)
            }
        } catch {
            print("[ShortsViewModel] Error loading shorts: \(error)")
        }

        isLoading = false
    }

    public func playShort(at index: Int) {
        guard index >= 0 && index < shorts.count else { return }
        currentIndex = index
        playShort(shorts[index])
    }

    public func playShort(_ video: VideoData) {
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            do {
                let playback = try await self.api.fetchPlaybackInfo(videoId: video.id)
                var streamURL: URL? = nil
                if let prog = playback.formatStreams?.first(where: { !$0.url.isEmpty }), let u = URL(string: prog.url) {
                    streamURL = u
                } else if let hls = playback.hlsUrl, !hls.isEmpty, let u = URL(string: hls) {
                    streamURL = u
                } else if let adapt = playback.adaptiveFormats?.first(where: { !$0.url.isEmpty }), let u = URL(string: adapt.url) {
                    streamURL = u
                }

                if let streamURL = streamURL {
                    let item = AVPlayerItem(url: streamURL)
                    self.player.replaceCurrentItem(with: item)
                    self.player.isMuted = self.isMuted
                    self.player.play()
                }
            } catch {
                print("[ShortsViewModel] Error fetching short stream: \(error)")
            }
        }
    }

    public func pause() {
        player.pause()
    }

    public func resume() {
        player.play()
    }

    public func toggleMute() {
        isMuted.toggle()
        player.isMuted = isMuted
    }

    public func toggleLike(shortId: String) {
        if likedShorts.contains(shortId) {
            likedShorts.remove(shortId)
        } else {
            likedShorts.insert(shortId)
            dislikedShorts.remove(shortId)
        }
    }

    public func toggleDislike(shortId: String) {
        if dislikedShorts.contains(shortId) {
            dislikedShorts.remove(shortId)
        } else {
            dislikedShorts.insert(shortId)
            likedShorts.remove(shortId)
        }
    }
}
