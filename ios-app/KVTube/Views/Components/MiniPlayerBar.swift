import SwiftUI

public struct MiniPlayerBar: View {
    @EnvironmentObject private var playbackManager: PlaybackManager

    public init() {}

    public var body: some View {
        if playbackManager.isMiniPlayerVisible, let video = playbackManager.currentVideo {
            VStack(spacing: 0) {
                // Progress line
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color.gray.opacity(0.3))
                            .frame(height: 2)
                        if playbackManager.duration > 0 {
                            Rectangle()
                                .fill(Color.red)
                                .frame(width: geo.size.width * CGFloat(playbackManager.currentTime / playbackManager.duration), height: 2)
                        }
                    }
                }
                .frame(height: 2)

                HStack(spacing: 12) {
                    // Small thumbnail
                    AsyncImage(url: video.displayThumbnailUrl) { phase in
                        if let img = phase.image {
                            img.resizable().aspectRatio(16/9, contentMode: .fill)
                        } else {
                            Rectangle().fill(Color.gray.opacity(0.3))
                        }
                    }
                    .frame(width: 72, height: 42)
                    .cornerRadius(6)
                    .clipped()

                    // Title & Channel
                    VStack(alignment: .leading, spacing: 2) {
                        Text(video.title)
                            .font(.system(size: 13, weight: .medium))
                            .lineLimit(1)
                            .foregroundColor(.primary)

                        Text(video.uploader)
                            .font(.system(size: 11))
                            .lineLimit(1)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    // Play/Pause Button
                    Button {
                        playbackManager.togglePlayPause()
                    } label: {
                        Image(systemName: playbackManager.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.primary)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)

                    // Close Button
                    Button {
                        playbackManager.dismissMiniPlayer()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.secondary)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 12)
                .frame(height: 52)
                .background(
                    Color(UIColor.secondarySystemBackground)
                        .shadow(color: Color.black.opacity(0.12), radius: 6, x: 0, y: -2)
                )
            }
            .contentShape(Rectangle())
            .onTapGesture {
                playbackManager.isFullScreenPlayerPresented = true
            }
        }
    }
}
