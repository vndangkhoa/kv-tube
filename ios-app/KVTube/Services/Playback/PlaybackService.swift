//
//  PlaybackService.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import Foundation
import AVFoundation
import MediaPlayer
import UIKit

/// Delegate interface for handling MPRemoteCommandCenter actions and audio session events.
public protocol PlaybackCommandDelegate: AnyObject {
    func remotePlay()
    func remotePause()
    func remoteTogglePlayPause()
    func remoteSeek(to seconds: Double)
    func remoteSeekBy(seconds: Double)
    func handleAudioInterruption(began: Bool, shouldResume: Bool)
    func handleAudioRouteChange(reason: AVAudioSession.RouteChangeReason)
}

/// Manages system audio session configuration, Lock Screen / Control Center Now Playing metadata,
/// and Remote Command Center events.
public final class PlaybackService: @unchecked Sendable {
    public static let shared = PlaybackService()

    public weak var commandDelegate: PlaybackCommandDelegate?

    private let nowPlayingCenter = MPNowPlayingInfoCenter.default()
    private let commandCenter = MPRemoteCommandCenter.shared()

    private var currentArtworkURL: String?
    private var cachedArtworkImage: UIImage?
    private var artworkTask: Task<Void, Never>?
    private var isConfigured = false

    public init() {
        setupAudioSession()
        setupNotifications()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        teardownRemoteCommands()
    }

    // MARK: - Audio Session Configuration

    /// Configures the shared AVAudioSession for background audio and movie playback.
    public func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [])
            try session.setActive(true, options: [])
        } catch {
            print("[PlaybackService] Failed to activate AVAudioSession: \(error.localizedDescription)")
        }
    }

    public func deactivateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("[PlaybackService] Failed to deactivate AVAudioSession: \(error.localizedDescription)")
        }
    }

    // MARK: - Remote Command Center

    /// Sets up Lock Screen and Control Center commands.
    public func setupRemoteCommands() {
        guard !isConfigured else { return }
        isConfigured = true

        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.commandDelegate?.remotePlay()
            return .success
        }

        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.commandDelegate?.remotePause()
            return .success
        }

        commandCenter.togglePlayPauseCommand.isEnabled = true
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.commandDelegate?.remoteTogglePlayPause()
            return .success
        }

        // 10s Seek Backward
        commandCenter.skipBackwardCommand.isEnabled = true
        commandCenter.skipBackwardCommand.preferredIntervals = [10]
        commandCenter.skipBackwardCommand.addTarget { [weak self] _ in
            self?.commandDelegate?.remoteSeekBy(seconds: -10)
            return .success
        }

        commandCenter.seekBackwardCommand.isEnabled = true
        commandCenter.seekBackwardCommand.addTarget { [weak self] _ in
            self?.commandDelegate?.remoteSeekBy(seconds: -10)
            return .success
        }

        // 10s Seek Forward
        commandCenter.skipForwardCommand.isEnabled = true
        commandCenter.skipForwardCommand.preferredIntervals = [10]
        commandCenter.skipForwardCommand.addTarget { [weak self] _ in
            self?.commandDelegate?.remoteSeekBy(seconds: 10)
            return .success
        }

        commandCenter.seekForwardCommand.isEnabled = true
        commandCenter.seekForwardCommand.addTarget { [weak self] _ in
            self?.commandDelegate?.remoteSeekBy(seconds: 10)
            return .success
        }

        // Scrubber position change
        commandCenter.changePlaybackPositionCommand.isEnabled = true
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            self?.commandDelegate?.remoteSeek(to: positionEvent.positionTime)
            return .success
        }
    }

    public func teardownRemoteCommands() {
        commandCenter.playCommand.removeTarget(nil)
        commandCenter.pauseCommand.removeTarget(nil)
        commandCenter.togglePlayPauseCommand.removeTarget(nil)
        commandCenter.skipBackwardCommand.removeTarget(nil)
        commandCenter.skipForwardCommand.removeTarget(nil)
        commandCenter.seekBackwardCommand.removeTarget(nil)
        commandCenter.seekForwardCommand.removeTarget(nil)
        commandCenter.changePlaybackPositionCommand.removeTarget(nil)
        isConfigured = false
    }

    // MARK: - Now Playing Info Center

    /// Updates the full Now Playing metadata for the active video.
    public func updateNowPlaying(
        title: String,
        channelName: String,
        artworkUrl: String?,
        duration: Double,
        currentTime: Double,
        playbackRate: Float
    ) {
        var info = nowPlayingCenter.nowPlayingInfo ?? [String: Any]()
        info[MPMediaItemPropertyTitle] = title
        info[MPMediaItemPropertyArtist] = channelName
        info[MPMediaItemPropertyPlaybackDuration] = max(0.0, duration)
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = max(0.0, currentTime)
        info[MPNowPlayingInfoPropertyPlaybackRate] = Double(playbackRate)
        info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0

        // Handle artwork caching & async fetching
        if let artworkUrl = artworkUrl, !artworkUrl.isEmpty {
            if currentArtworkURL == artworkUrl, let image = cachedArtworkImage {
                let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                info[MPMediaItemPropertyArtwork] = artwork
            } else if currentArtworkURL != artworkUrl {
                currentArtworkURL = artworkUrl
                cachedArtworkImage = nil
                loadArtwork(from: artworkUrl)
            }
        } else {
            currentArtworkURL = nil
            cachedArtworkImage = nil
            info.removeValue(forKey: MPMediaItemPropertyArtwork)
        }

        nowPlayingCenter.nowPlayingInfo = info
    }

    /// Lightweight update for periodic elapsed time / rate synchronization.
    public func updatePlaybackProgress(currentTime: Double, duration: Double, playbackRate: Float) {
        guard var info = nowPlayingCenter.nowPlayingInfo else { return }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = max(0.0, currentTime)
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        info[MPNowPlayingInfoPropertyPlaybackRate] = Double(playbackRate)
        nowPlayingCenter.nowPlayingInfo = info
    }

    public func clearNowPlaying() {
        artworkTask?.cancel()
        artworkTask = nil
        currentArtworkURL = nil
        cachedArtworkImage = nil
        nowPlayingCenter.nowPlayingInfo = nil
    }

    // MARK: - Artwork Loading

    private func loadArtwork(from urlString: String) {
        artworkTask?.cancel()
        guard let url = URL(string: urlString) else { return }

        artworkTask = Task { [weak self] in
            do {
                let (data, response) = try await URLSession.shared.data(from: url)
                guard !Task.isCancelled,
                      let httpResponse = response as? HTTPURLResponse,
                      httpResponse.statusCode == 200,
                      let image = UIImage(data: data) else {
                    return
                }

                guard let strongSelf = self else { return }
                await MainActor.run {
                    guard strongSelf.currentArtworkURL == urlString else { return }
                    strongSelf.cachedArtworkImage = image
                    var currentInfo = strongSelf.nowPlayingCenter.nowPlayingInfo ?? [String: Any]()
                    let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    currentInfo[MPMediaItemPropertyArtwork] = artwork
                    strongSelf.nowPlayingCenter.nowPlayingInfo = currentInfo
                }
            } catch {
                // Ignore download failure or cancellation
            }
        }
    }

    // MARK: - Audio Session Notifications

    private func setupNotifications() {
        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(handleInterruption(notification:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        center.addObserver(
            self,
            selector: #selector(handleRouteChange(notification:)),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            commandDelegate?.handleAudioInterruption(began: true, shouldResume: false)
        case .ended:
            var shouldResume = false
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                shouldResume = options.contains(.shouldResume)
            }
            setupAudioSession()
            commandDelegate?.handleAudioInterruption(began: false, shouldResume: shouldResume)
        @unknown default:
            break
        }
    }

    @objc private func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        commandDelegate?.handleAudioRouteChange(reason: reason)
    }
}
