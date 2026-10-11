//
//  RelatedVideosView.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import SwiftUI

/// Displays a list of related / recommended video cards.
public struct RelatedVideosView: View {
    let videos: [VideoData]
    let onSelectVideo: (VideoData) -> Void

    public init(videos: [VideoData], onSelectVideo: @escaping (VideoData) -> Void) {
        self.videos = videos
        self.onSelectVideo = onSelectVideo
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Related Videos")
                .font(.system(size: 16, weight: .bold))
                .padding(.horizontal, 16)

            LazyVStack(spacing: 16) {
                ForEach(videos) { video in
                    Button(action: {
                        onSelectVideo(video)
                    }) {
                        relatedVideoCard(video: video)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Video Card

    @ViewBuilder
    private func relatedVideoCard(video: VideoData) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // Thumbnail with Duration Overlay
            ZStack(alignment: .bottomTrailing) {
                if let url = video.displayThumbnailUrl {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .failure, .empty:
                            Color.gray.opacity(0.3)
                        @unknown default:
                            Color.gray.opacity(0.3)
                        }
                    }
                } else {
                    Color.gray.opacity(0.3)
                }

                // Duration Badge
                if !video.displayDuration.isEmpty {
                    Text(video.displayDuration)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(Color.black.opacity(0.8))
                        .cornerRadius(3)
                        .padding(4)
                }
            }
            .frame(width: 140, height: 79)
            .clipped()
            .cornerRadius(8)

            // Video Details
            VStack(alignment: .leading, spacing: 4) {
                Text(video.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                Text(video.displayChannelTitle)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    if !video.displayViews.isEmpty {
                        Text(video.displayViews)
                    }
                    if !video.displayViews.isEmpty && !video.displayPublished.isEmpty {
                        Text("•")
                    }
                    if !video.displayPublished.isEmpty {
                        Text(video.displayPublished)
                    }
                }
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .lineLimit(1)
            }

            Spacer(minLength: 0)

            // Overflow Menu
            Menu {
                Button(action: {
                    DatabaseManager.shared.savePlaybackPosition(
                        videoId: video.id,
                        position: 0,
                        duration: Double(video.durationSeconds),
                        video: video
                    )
                }) {
                    Label("Save to Watch Later", systemImage: "clock")
                }

                if let shareURL = URL(string: "https://www.youtube.com/watch?v=\(video.id)") {
                    ShareLink(item: shareURL) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .padding(6)
            }
        }
    }
}
