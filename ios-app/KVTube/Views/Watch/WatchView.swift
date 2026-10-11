//
//  WatchView.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import SwiftUI

/// Main video watching screen combining video playback, channel metadata,
/// interactive action buttons (Like/Dislike with RYD, Share, Download), expandable description,
/// and tabbed or stacked comments and related videos.
public struct WatchView: View {
    @StateObject private var viewModel: WatchViewModel
    @State private var isFullscreen: Bool = false
    @State private var isDescriptionExpanded: Bool = false
    @State private var selectedBottomTab: BottomTab = .related

    private let videoId: String
    private let initialVideo: VideoData?

    public enum BottomTab: String, CaseIterable {
        case related = "Related"
        case comments = "Comments"
    }

    public init(videoId: String = "", initialVideo: VideoData? = nil) {
        self.videoId = videoId
        self.initialVideo = initialVideo
        _viewModel = StateObject(wrappedValue: WatchViewModel())
    }

    public var body: some View {
        ZStack(alignment: .top) {
            Color(red: 0.06, green: 0.06, blue: 0.06) // YouTube Dark #0F0F0F
                .ignoresSafeArea()

            // Pure black safe area background behind status bar / Dynamic Island
            Color.black
                .frame(height: 60)
                .ignoresSafeArea(edges: .top)

            if isFullscreen {
                // Fullscreen Player Only
                CustomPlayerView(
                    playerViewModel: viewModel.playerViewModel,
                    isFullscreen: $isFullscreen
                )
                .ignoresSafeArea()
                .statusBar(hidden: true)
            } else {
                // Portrait / Regular Watch Experience
                VStack(spacing: 0) {
                    // Top: Custom Video Player
                    CustomPlayerView(
                        playerViewModel: viewModel.playerViewModel,
                        isFullscreen: $isFullscreen
                    )
                    .zIndex(1)

                    // Middle & Bottom: Scrollable Content
                    switch viewModel.state {
                    case .loading:
                        loadingStateView
                    case .ready:
                        scrollableContentView
                    case .error(let message):
                        errorStateView(message: message)
                    case .idle:
                        loadingStateView
                    }
                }
            }

            // Global Toast Overlay
            if let toast = viewModel.toastMessage {
                VStack {
                    Spacer()
                    ToastView(
                        message: toast,
                        iconName: "info.circle.fill",
                        iconColor: .white
                    )
                    .padding(.bottom, 24)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(100)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            viewModel.loadVideo(id: videoId, initialVideo: initialVideo)
        }
        .onDisappear {
            // Only cleanup if disappearing completely from navigation
            viewModel.cleanup()
        }
    }

    // MARK: - Scrollable Content

    private var scrollableContentView: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                // 1. Video Title
                if let video = viewModel.video {
                    Text(video.title)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 16)
                        .padding(.top, 10)
                }

                // 2. Channel Info Row
                channelInfoRow
                    .padding(.horizontal, 16)

                // 3. Action Buttons Row (Like/Dislike, Share, Download, Save)
                actionButtonsRow
                    .padding(.horizontal, 16)

                // 4. Expandable Description Card
                descriptionCard
                    .padding(.horizontal, 16)

                Divider()
                    .padding(.vertical, 4)

                // 5. Section Switcher (Related / Comments)
                sectionTabsPicker
                    .padding(.horizontal, 16)

                // 6. Active Tab Content
                if selectedBottomTab == .related {
                    RelatedVideosView(videos: viewModel.relatedVideos) { selectedVideo in
                        viewModel.loadVideo(id: selectedVideo.id, initialVideo: selectedVideo)
                    }
                } else {
                    CommentsSectionView(watchViewModel: viewModel)
                }

                Spacer(minLength: 40)
            }
        }
    }

    // MARK: - Channel Info Row

    private var channelInfoRow: some View {
        HStack(spacing: 12) {
            // Channel Avatar
            if let urlString = viewModel.video?.channelThumbnail, let url = URL(string: urlString), !urlString.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure, .empty:
                        fallbackAvatar
                    @unknown default:
                        fallbackAvatar
                    }
                }
                .frame(width: 40, height: 40)
                .clipShape(Circle())
            } else {
                fallbackAvatar
                    .frame(width: 40, height: 40)
                    .clipShape(Circle())
            }

            // Channel Title & Subscriber Count
            VStack(alignment: .leading, spacing: 2) {
                Text(viewModel.video?.displayChannelTitle ?? "")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                if let subs = viewModel.video?.subscriberCount, !subs.isEmpty {
                    Text(subs)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Subscribe Button
            Button(action: {
                viewModel.toggleSubscribe()
            }) {
                Text(viewModel.isSubscribed ? "Subscribed" : "Subscribe")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(viewModel.isSubscribed ? .primary : .white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(viewModel.isSubscribed ? Color(UIColor.secondarySystemBackground) : Color.red)
                    .clipShape(Capsule())
            }
        }
    }

    private var fallbackAvatar: some View {
        ZStack {
            Color.gray.opacity(0.3)
            let initial = viewModel.video?.displayChannelTitle.prefix(1).uppercased() ?? "?"
            Text(initial)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
        }
    }

    // MARK: - Action Buttons Row

    private var actionButtonsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                // Like / Dislike Combined Pill (with RYD Count)
                HStack(spacing: 0) {
                    // Like
                    Button(action: {
                        viewModel.toggleLike()
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: viewModel.isLiked ? "hand.thumbsup.fill" : "hand.thumbsup")
                                .font(.system(size: 14))
                            Text(formatCount(viewModel.effectiveLikesCount))
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundColor(viewModel.isLiked ? .blue : .primary)
                        .padding(.leading, 14)
                        .padding(.trailing, 10)
                        .padding(.vertical, 8)
                    }

                    // Vertical Divider
                    Rectangle()
                        .fill(Color.gray.opacity(0.3))
                        .frame(width: 1, height: 18)

                    // Dislike with RYD
                    Button(action: {
                        viewModel.toggleDislike()
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: viewModel.isDisliked ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                                .font(.system(size: 14))
                            if viewModel.effectiveDislikesCount > 0 {
                                Text(formatCount(viewModel.effectiveDislikesCount))
                                    .font(.system(size: 13, weight: .semibold))
                            }
                        }
                        .foregroundColor(viewModel.isDisliked ? .red : .primary)
                        .padding(.leading, 10)
                        .padding(.trailing, 14)
                        .padding(.vertical, 8)
                    }
                }
                .background(Color(UIColor.secondarySystemBackground))
                .clipShape(Capsule())

                // Share Button
                if let shareURL = viewModel.shareURL() {
                    ShareLink(item: shareURL) {
                        HStack(spacing: 6) {
                            Image(systemName: "arrowshape.turn.up.right")
                                .font(.system(size: 14))
                            Text("Share")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundColor(.primary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color(UIColor.secondarySystemBackground))
                        .clipShape(Capsule())
                    }
                }

                // Download Button
                Button(action: {
                    viewModel.downloadVideo(quality: viewModel.playerViewModel.selectedQuality)
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.down.to.line")
                            .font(.system(size: 14))
                        Text("Download")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color(UIColor.secondarySystemBackground))
                    .clipShape(Capsule())
                }

                // Save to Playlist Button
                Button(action: {
                    if let vid = viewModel.video {
                        DatabaseManager.shared.savePlaybackPosition(
                            videoId: vid.id,
                            position: 0,
                            duration: Double(vid.durationSeconds),
                            video: vid
                        )
                        viewModel.showToast("Saved to Watch Later")
                    }
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "bookmark")
                            .font(.system(size: 14))
                        Text("Save")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color(UIColor.secondarySystemBackground))
                    .clipShape(Capsule())
                }
            }
        }
    }

    // MARK: - Description Card

    private var descriptionCard: some View {
        Button(action: {
            withAnimation(.easeInOut(duration: 0.2)) {
                isDescriptionExpanded.toggle()
            }
        }) {
            VStack(alignment: .leading, spacing: 6) {
                // Meta header: Views • Date
                HStack(spacing: 6) {
                    if let views = viewModel.video?.displayViews, !views.isEmpty {
                        Text(views)
                            .font(.system(size: 12, weight: .bold))
                    }
                    if let published = viewModel.video?.displayPublished, !published.isEmpty {
                        Text("•")
                        Text(published)
                            .font(.system(size: 12, weight: .bold))
                    }
                    Spacer()
                }
                .foregroundColor(.primary)

                // Description Text
                if let desc = viewModel.video?.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .lineLimit(isDescriptionExpanded ? nil : 2)
                        .multilineTextAlignment(.leading)
                }

                // Expand / Collapse indicator
                Text(isDescriptionExpanded ? "Show less" : "...more")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.blue)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(UIColor.secondarySystemBackground))
            .cornerRadius(10)
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Section Tabs Picker

    private var sectionTabsPicker: some View {
        HStack(spacing: 20) {
            ForEach(BottomTab.allCases, id: \.self) { tab in
                Button(action: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedBottomTab = tab
                    }
                }) {
                    VStack(spacing: 6) {
                        HStack(spacing: 4) {
                            Text(tab.rawValue)
                                .font(.system(size: 15, weight: selectedBottomTab == tab ? .bold : .medium))
                                .foregroundColor(selectedBottomTab == tab ? .primary : .secondary)

                            if tab == .comments && viewModel.commentCount > 0 {
                                Text("\(viewModel.commentCount)")
                                    .font(.system(size: 11, weight: .bold))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.gray.opacity(0.2))
                                    .clipShape(Capsule())
                            }
                        }

                        // Tab Indicator
                        Rectangle()
                            .fill(selectedBottomTab == tab ? Color.red : Color.clear)
                            .frame(height: 2)
                    }
                }
                .buttonStyle(PlainButtonStyle())
            }

            Spacer()
        }
    }

    // MARK: - State Views

    private var loadingStateView: some View {
        VStack(spacing: 20) {
            ProgressView("Loading stream and data...")
                .padding(.top, 40)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func errorStateView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundColor(.yellow)
                .padding(.top, 40)

            Text(message)
                .font(.system(size: 15))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            Button(action: {
                viewModel.loadVideo(id: videoId, initialVideo: initialVideo)
            }) {
                Text("Retry")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Color.red)
                    .clipShape(Capsule())
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func formatCount(_ count: Int) -> String {
        let d = Double(count)
        if d >= 1_000_000 {
            return String(format: "%.1fM", d / 1_000_000)
        } else if d >= 1_000 {
            return String(format: "%.1fK", d / 1_000)
        } else {
            return "\(count)"
        }
    }
}
