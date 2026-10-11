//
//  CustomPlayerView.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import SwiftUI
import AVFoundation
import AVKit

/// Internal UIView subclass hosting an AVPlayerLayer.
public final class PlayerContainerView: UIView {
    public override static var layerClass: AnyClass {
        return AVPlayerLayer.self
    }

    public var playerLayer: AVPlayerLayer {
        return layer as! AVPlayerLayer
    }
}

/// UIViewRepresentable wrapping AVPlayerLayer for seamless playback and PiP attachment.
public struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer
    let onLayerReady: (AVPlayerLayer) -> Void

    public init(player: AVPlayer, onLayerReady: @escaping (AVPlayerLayer) -> Void) {
        self.player = player
        self.onLayerReady = onLayerReady
    }

    public func makeUIView(context: Context) -> PlayerContainerView {
        let view = PlayerContainerView()
        view.backgroundColor = .black
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
        onLayerReady(view.playerLayer)
        return view
    }

    public func updateUIView(_ uiView: PlayerContainerView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
            onLayerReady(uiView.playerLayer)
        }
    }
}

/// Production-ready custom video player view with gesture-based scrubbing,
/// SponsorBlock track markers, double-tap seek ripples, PiP, and quality switching.
public struct CustomPlayerView: View {
    @ObservedObject var playerViewModel: PlayerViewModel
    @ObservedObject private var pipController = PiPController.shared

    @Binding var isFullscreen: Bool

    @State private var showControls: Bool = true
    @State private var controlsTimer: Task<Void, Never>? = nil

    // Scrubbing gesture state
    @State private var isScrubbing: Bool = false
    @State private var scrubTime: Double = 0.0

    // Double-tap ripple state
    @State private var showLeftRipple: Bool = false
    @State private var showRightRipple: Bool = false
    @State private var leftRippleTask: Task<Void, Never>? = nil
    @State private var rightRippleTask: Task<Void, Never>? = nil

    @State private var showingQualitySheet: Bool = false

    public init(playerViewModel: PlayerViewModel, isFullscreen: Binding<Bool> = .constant(false)) {
        self.playerViewModel = playerViewModel
        self._isFullscreen = isFullscreen
    }

    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.black

                // 1. Native Video Player
                VideoPlayer(player: playerViewModel.player)
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .disabled(true)

                // 2. Double Tap Left / Right Seek Touch Zones
                HStack(spacing: 0) {
                    // Left half (seek -10s)
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture(count: 2) {
                            handleDoubleTapSeek(forward: false)
                        }
                        .onTapGesture(count: 1) {
                            toggleControls()
                        }

                    // Right half (seek +10s)
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture(count: 2) {
                            handleDoubleTapSeek(forward: true)
                        }
                        .onTapGesture(count: 1) {
                            toggleControls()
                        }
                }

                // 3. Double-Tap Ripple Feedback
                if showLeftRipple {
                    seekRippleOverlay(text: "10s", isForward: false)
                        .position(x: geometry.size.width * 0.25, y: geometry.size.height * 0.5)
                        .transition(.opacity)
                }

                if showRightRipple {
                    seekRippleOverlay(text: "10s", isForward: true)
                        .position(x: geometry.size.width * 0.75, y: geometry.size.height * 0.5)
                        .transition(.opacity)
                }

                // 4. Buffering Indicator
                if playerViewModel.isBuffering {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(1.6)
                }

                // 5. Controls Overlay
                if showControls {
                    controlsOverlay(geometry: geometry)
                        .transition(.opacity)
                }

                // 6. SponsorBlock Skipped Toast
                if let notice = playerViewModel.currentSkippedSegmentNotice {
                    VStack {
                        ToastView(
                            message: notice,
                            iconName: "forward.fill",
                            iconColor: Color(red: 0.0, green: 0.84, blue: 0.42),
                            actionTitle: "Unskip",
                            onAction: {
                                playerViewModel.unskip()
                            }
                        )
                        .padding(.top, 16)
                        Spacer()
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(10)
                }
            }
            .clipped()
        }
        .aspectRatio(isFullscreen ? nil : 16/9, contentMode: .fit)
        .sheet(isPresented: $showingQualitySheet) {
            QualityPickerSheet(
                availableQualities: playerViewModel.availableQualities,
                selectedQuality: playerViewModel.selectedQuality,
                currentSpeed: playerViewModel.playbackRate,
                onSelectQuality: { format in
                    playerViewModel.switchQuality(format: format)
                },
                onSelectSpeed: { speed in
                    playerViewModel.setRate(speed)
                }
            )
        }
        .onAppear {
            scheduleControlsAutoHide()
        }
    }

    // MARK: - Controls Overlay

    @ViewBuilder
    private func controlsOverlay(geometry: GeometryProxy) -> some View {
        ZStack {
            // Dark gradient overlay
            Color.black.opacity(0.45)
                .allowsHitTesting(false)

            VStack(spacing: 0) {
                // Top Bar
                topBarView
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                Spacer()

                // Center Play/Pause & Skip Buttons
                centerControlsView

                Spacer()

                // Bottom Timeline & Scrubber Bar
                bottomBarView(width: geometry.size.width)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Top Bar

    private var topBarView: some View {
        HStack(spacing: 16) {
            Button(action: {
                if isFullscreen {
                    isFullscreen = false
                } else {
                    PlaybackManager.shared.isFullScreenPlayerPresented = false
                    PlaybackManager.shared.isMiniPlayerVisible = true
                }
            }) {
                Image(systemName: "chevron.down")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
            }

            if isFullscreen, let video = playerViewModel.currentVideo {
                Text(video.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }

            Spacer()

            // Picture in Picture
            if PiPController.isSupported {
                Button(action: {
                    pipController.togglePictureInPicture()
                }) {
                    Image(systemName: pipController.isPiPActive ? "pip.exit" : "pip.enter")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white)
                }
            }

            // Quality & Speed Settings
            Button(action: {
                showingQualitySheet = true
                scheduleControlsAutoHide()
            }) {
                HStack(spacing: 4) {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 16))
                    Text(playerViewModel.selectedQuality)
                        .font(.system(size: 12, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.white.opacity(0.2))
                .clipShape(Capsule())
            }

            // Fullscreen Toggle
            Button(action: {
                withAnimation(.easeInOut(duration: 0.25)) {
                    isFullscreen.toggle()
                }
                scheduleControlsAutoHide()
            }) {
                Image(systemName: isFullscreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Center Controls

    private var centerControlsView: some View {
        HStack(spacing: 40) {
            // Seek -10s
            Button(action: {
                playerViewModel.seekBy(seconds: -10)
                scheduleControlsAutoHide()
            }) {
                Image(systemName: "gobackward.10")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundColor(.white)
            }

            // Play / Pause
            Button(action: {
                playerViewModel.togglePlayPause()
                scheduleControlsAutoHide()
            }) {
                Image(systemName: playerViewModel.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 42, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 68, height: 68)
                    .background(Circle().fill(Color.black.opacity(0.35)))
            }

            // Seek +10s
            Button(action: {
                playerViewModel.seekBy(seconds: 10)
                scheduleControlsAutoHide()
            }) {
                Image(systemName: "goforward.10")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Bottom Scrubber Bar

    private func bottomBarView(width: CGFloat) -> some View {
        VStack(spacing: 6) {
            // Scrubber Slider
            scrubberTrackView(totalWidth: width - 32)

            // Timestamps
            HStack {
                let displayCurrent = isScrubbing ? scrubTime : playerViewModel.currentTime
                Text(formatTime(displayCurrent))
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)

                Text("/")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.6))

                Text(formatTime(playerViewModel.duration))
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.white.opacity(0.8))

                Spacer()

                if playerViewModel.playbackRate != 1.0 {
                    Text(String(format: "%.2gx", playerViewModel.playbackRate))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.yellow)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.yellow.opacity(0.2))
                        .cornerRadius(4)
                }
            }
        }
    }

    // MARK: - Scrubber Track with Sponsor Markers

    private func scrubberTrackView(totalWidth: CGFloat) -> some View {
        let dur = max(1.0, playerViewModel.duration)
        let activeTime = isScrubbing ? scrubTime : playerViewModel.currentTime
        let progressRatio = max(0.0, min(1.0, activeTime / dur))
        let bufferedRatio = max(0.0, min(1.0, playerViewModel.bufferedTime / dur))

        return GeometryReader { trackGeo in
            let trackWidth = trackGeo.size.width
            ZStack(alignment: .leading) {
                // 1. Base track
                Capsule()
                    .fill(Color.white.opacity(0.3))
                    .frame(height: 4)

                // 2. Buffered track
                Capsule()
                    .fill(Color.white.opacity(0.6))
                    .frame(width: max(0, trackWidth * CGFloat(bufferedRatio)), height: 4)

                // 3. SponsorBlock Segment Markers
                ForEach(playerViewModel.sponsorSegments) { segment in
                    let startX = trackWidth * CGFloat(segment.startTime / dur)
                    let segmentW = max(2.0, trackWidth * CGFloat(segment.duration / dur))
                    Rectangle()
                        .fill(segment.categoryColor)
                        .frame(width: segmentW, height: 4)
                        .offset(x: startX)
                }

                // 4. Played progress track
                Capsule()
                    .fill(Color.red)
                    .frame(width: max(0, trackWidth * CGFloat(progressRatio)), height: 4)

                // 5. Draggable Scrubber Thumb
                Circle()
                    .fill(Color.red)
                    .frame(width: 14, height: 14)
                    .offset(x: max(0, min(trackWidth - 14, (trackWidth * CGFloat(progressRatio)) - 7)))
                    .shadow(radius: 2)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isScrubbing = true
                        controlsTimer?.cancel()
                        let ratio = max(0.0, min(1.0, value.location.x / trackWidth))
                        scrubTime = Double(ratio) * dur
                    }
                    .onEnded { value in
                        let ratio = max(0.0, min(1.0, value.location.x / trackWidth))
                        let target = Double(ratio) * dur
                        playerViewModel.seek(to: target)
                        isScrubbing = false
                        scheduleControlsAutoHide()
                    }
            )
        }
        .frame(height: 16)
    }

    // MARK: - Double-Tap Seek Ripples

    private func handleDoubleTapSeek(forward: Bool) {
        if forward {
            playerViewModel.seekBy(seconds: 10)
            showRightRipple = true
            rightRippleTask?.cancel()
            rightRippleTask = Task {
                try? await Task.sleep(nanoseconds: 600_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run { showRightRipple = false }
            }
        } else {
            playerViewModel.seekBy(seconds: -10)
            showLeftRipple = true
            leftRippleTask?.cancel()
            leftRippleTask = Task {
                try? await Task.sleep(nanoseconds: 600_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run { showLeftRipple = false }
            }
        }

        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
        scheduleControlsAutoHide()
    }

    private func seekRippleOverlay(text: String, isForward: Bool) -> some View {
        VStack(spacing: 4) {
            Image(systemName: isForward ? "goforward.10" : "gobackward.10")
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(.white)
            Text("\(isForward ? "+" : "-")\(text)")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
        }
        .padding(20)
        .background(Circle().fill(Color.white.opacity(0.2)))
    }

    // MARK: - Auto-Hide Controls

    private func toggleControls() {
        withAnimation(.easeInOut(duration: 0.2)) {
            showControls.toggle()
        }
        if showControls {
            scheduleControlsAutoHide()
        }
    }

    private func scheduleControlsAutoHide() {
        controlsTimer?.cancel()
        controlsTimer = Task {
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                if playerViewModel.isPlaying && !isScrubbing {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        showControls = false
                    }
                }
            }
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite && !seconds.isNaN else { return "0:00" }
        let total = Int(seconds)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        } else {
            return String(format: "%d:%02d", minutes, secs)
        }
    }
}
