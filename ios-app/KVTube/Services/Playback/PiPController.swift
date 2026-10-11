//
//  PiPController.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import Foundation
import AVKit
import Combine
import UIKit

/// Manages Picture-in-Picture (PiP) lifecycle, player layer binding, and UI restoration.
@MainActor
public final class PiPController: NSObject, ObservableObject {
    public static let shared = PiPController()

    @Published public private(set) var isPiPActive: Bool = false
    @Published public private(set) var isPiPPossible: Bool = false

    /// Closure invoked when the user taps the restore button in the PiP window.
    public var onRestoreUserInterface: (() -> Void)?

    private var pipController: AVPictureInPictureController?
    private var pipPossibleObservation: NSKeyValueObservation?
    private weak var boundPlayerLayer: AVPlayerLayer?

    public override init() {
        super.init()
    }

    deinit {
        pipPossibleObservation?.invalidate()
    }

    /// Checks if Picture-in-Picture is supported on the current device.
    public static var isSupported: Bool {
        return AVPictureInPictureController.isPictureInPictureSupported()
    }

    /// Binds an AVPlayerLayer to the PiP controller.
    public func setup(with playerLayer: AVPlayerLayer) {
        guard Self.isSupported else { return }

        // If already bound to the same player layer, avoid recreating
        if boundPlayerLayer === playerLayer && pipController != nil {
            return
        }

        cleanup()
        self.boundPlayerLayer = playerLayer

        guard let controller = AVPictureInPictureController(playerLayer: playerLayer) else {
            return
        }

        controller.delegate = self
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        self.pipController = controller

        // Observe isPictureInPicturePossible
        pipPossibleObservation = controller.observe(
            \.isPictureInPicturePossible,
            options: [.initial, .new]
        ) { [weak self] controller, _ in
            Task { @MainActor [weak self] in
                self?.isPiPPossible = controller.isPictureInPicturePossible
            }
        }
    }

    /// Starts Picture-in-Picture playback.
    public func startPictureInPicture() {
        guard let controller = pipController, controller.isPictureInPicturePossible else { return }
        controller.startPictureInPicture()
    }

    /// Stops Picture-in-Picture playback.
    public func stopPictureInPicture() {
        pipController?.stopPictureInPicture()
    }

    /// Toggles Picture-in-Picture playback.
    public func togglePictureInPicture() {
        if isPiPActive {
            stopPictureInPicture()
        } else {
            startPictureInPicture()
        }
    }

    /// Cleans up observers and delegates.
    public func cleanup() {
        pipPossibleObservation?.invalidate()
        pipPossibleObservation = nil
        pipController?.delegate = nil
        pipController = nil
        boundPlayerLayer = nil
        isPiPActive = false
        isPiPPossible = false
    }
}

// MARK: - AVPictureInPictureControllerDelegate

extension PiPController: AVPictureInPictureControllerDelegate {
    public func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        isPiPActive = true
    }

    public func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        isPiPActive = true
    }

    public func pictureInPictureControllerWillStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        // Will stop
    }

    public func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        isPiPActive = false
    }

    public func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        isPiPActive = false
        print("[PiPController] Failed to start PiP: \(error.localizedDescription)")
    }

    public func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        // Automatically restore app UI when user taps restore button on PiP window
        onRestoreUserInterface?()
        completionHandler(true)
    }
}
