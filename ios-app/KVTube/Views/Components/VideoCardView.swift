import SwiftUI

public struct VideoCardView: View {
    public let video: VideoData
    public var onSelect: (() -> Void)? = nil
    public var onSelectChannel: (() -> Void)? = nil

    @EnvironmentObject private var database: DatabaseManager
    @EnvironmentObject private var downloadManager: DownloadManager
    @EnvironmentObject private var playbackManager: PlaybackManager

    public init(video: VideoData, onSelect: (() -> Void)? = nil, onSelectChannel: (() -> Void)? = nil) {
        self.video = video
        self.onSelect = onSelect
        self.onSelectChannel = onSelectChannel
    }

    private var resumeProgress: Double {
        if let hist = database.history.first(where: { $0.videoId == video.id }) {
            return hist.progressFraction
        }
        return 0.0
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // 16:9 Thumbnail Container
            ZStack(alignment: .bottomTrailing) {
                Color.clear
                    .aspectRatio(16/9, contentMode: .fit)
                    .overlay(
                        AsyncImage(url: video.displayThumbnailUrl) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFill()
                            case .failure:
                                Rectangle()
                                    .fill(Color.gray.opacity(0.2))
                                    .overlay(
                                        Image(systemName: "photo")
                                            .font(.system(size: 32))
                                            .foregroundColor(.secondary)
                                    )
                            case .empty:
                                Rectangle()
                                    .fill(Color.gray.opacity(0.15))
                                    .overlay(ProgressView())
                            @unknown default:
                                EmptyView()
                            }
                        }
                    )
                    .clipped()
                    .cornerRadius(12)

                // Duration Badge
                if !video.duration.isEmpty {
                    Text(video.duration)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(video.duration == "LIVE" ? Color.red : Color.black.opacity(0.82))
                        .cornerRadius(4)
                        .padding(8)
                }

                // Resume progress bar
                if resumeProgress > 0.01 {
                    GeometryReader { geo in
                        VStack {
                            Spacer()
                            ZStack(alignment: .leading) {
                                Rectangle()
                                    .fill(Color.black.opacity(0.5))
                                    .frame(height: 3)
                                Rectangle()
                                    .fill(Color.red)
                                    .frame(width: geo.size.width * CGFloat(resumeProgress), height: 3)
                            }
                        }
                    }
                    .cornerRadius(12)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if let onSelect = onSelect {
                    onSelect()
                } else {
                    playbackManager.play(video: video)
                }
            }

            // Video Meta Row
            HStack(alignment: .top, spacing: 12) {
                // Channel Avatar
                Button {
                    onSelectChannel?()
                } label: {
                    ChannelAvatarView(
                        avatarUrl: video.bestAuthorThumbnailURL?.absoluteString,
                        name: video.uploader,
                        size: 38
                    )
                }
                .buttonStyle(.plain)

                // Title and Metadata
                VStack(alignment: .leading, spacing: 4) {
                    Text(video.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 4) {
                        Text(video.uploader)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.secondary)
                            .lineLimit(1)

                        Text("•")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)

                        Text(video.formattedViews)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)

                        if !video.uploadDate.isEmpty {
                            Text("•")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)

                            Text(video.uploadDate)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture {
                    if let onSelect = onSelect {
                        onSelect()
                    } else {
                        playbackManager.play(video: video)
                    }
                }

                // Options Menu
                Menu {
                    Button {
                        downloadManager.startDownload(video: video)
                    } label: {
                        Label("Download", systemImage: "arrow.down.circle")
                    }

                    Button {
                        database.toggleLike(video: video)
                    } label: {
                        Label(
                            database.isLiked(videoId: video.id) ? "Liked" : "Like Video",
                            systemImage: database.isLiked(videoId: video.id) ? "hand.thumbsup.fill" : "hand.thumbsup"
                        )
                    }

                    ShareLink(item: URL(string: "https://www.youtube.com/watch?v=\(video.id)")!) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .rotationEffect(.degrees(90))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
