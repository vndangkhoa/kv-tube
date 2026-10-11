import SwiftUI
import AVKit

public struct ShortsView: View {
    @StateObject private var viewModel = ShortsViewModel()
    @EnvironmentObject private var database: DatabaseManager
    @State private var showingCommentsSheet: Bool = false
    @State private var comments: [Comment] = []
    @State private var isLoadingComments: Bool = false

    public init() {}

    public var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()

                if viewModel.shorts.isEmpty && viewModel.isLoading {
                    VStack(spacing: 12) {
                        ProgressView().tint(.white)
                        Text("Loading Shorts...")
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.8))
                    }
                } else if viewModel.shorts.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "play.rectangle.on.rectangle")
                            .font(.system(size: 48))
                            .foregroundColor(.white.opacity(0.6))
                        Text("No Shorts available")
                            .foregroundColor(.white)
                        Button("Refresh") {
                            Task { await viewModel.loadShorts() }
                        }
                        .foregroundColor(.red)
                    }
                } else {
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            ForEach(Array(viewModel.shorts.enumerated()), id: \.element.id) { index, short in
                                ShortPageItemView(
                                    short: short,
                                    isCurrent: index == viewModel.currentIndex,
                                    player: viewModel.player,
                                    isMuted: viewModel.isMuted,
                                    isLiked: viewModel.likedShorts.contains(short.id),
                                    isDisliked: viewModel.dislikedShorts.contains(short.id),
                                    onLike: { viewModel.toggleLike(shortId: short.id) },
                                    onDislike: { viewModel.toggleDislike(shortId: short.id) },
                                    onComment: {
                                        viewModel.activeCommentsShortId = short.id
                                        showingCommentsSheet = true
                                        Task { await loadComments(for: short.id) }
                                    },
                                    onToggleMute: { viewModel.toggleMute() }
                                )
                                .frame(width: geo.size.width, height: geo.size.height)
                                .id(index)
                                .onAppear {
                                    viewModel.playShort(at: index)
                                }
                            }
                        }
                        .scrollTargetLayout()
                    }
                    .scrollTargetBehavior(.paging)
                }
            }
        }
        .sheet(isPresented: $showingCommentsSheet) {
            NavigationStack {
                VStack(spacing: 0) {
                    if isLoadingComments {
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if comments.isEmpty {
                        Text("No comments yet")
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        List(comments) { comment in
                            HStack(alignment: .top, spacing: 10) {
                                ChannelAvatarView(avatarUrl: comment.authorThumb, name: comment.author, size: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(comment.author)
                                            .font(.system(size: 12, weight: .semibold))
                                        Text(comment.publishedTime)
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                    }
                                    Text(comment.content)
                                        .font(.system(size: 13))
                                    if let likes = comment.likeCount, likes > 0 {
                                        Text("❤️ \(likes)")
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                            .padding(.top, 2)
                                    }
                                }
                            }
                            .listRowSeparator(.hidden)
                        }
                        .listStyle(.plain)
                    }
                }
                .navigationTitle("Comments")
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.medium, .large])
        }
        .onAppear {
            viewModel.resume()
        }
        .onDisappear {
            viewModel.pause()
        }
        .task {
            await viewModel.loadShorts()
        }
    }

    private func loadComments(for shortId: String) async {
        isLoadingComments = true
        comments = (try? await KVApi.shared.fetchComments(videoId: shortId))?.comments ?? []
        isLoadingComments = false
    }
}

private struct ShortPageItemView: View {
    let short: VideoData
    let isCurrent: Bool
    let player: AVPlayer
    let isMuted: Bool
    let isLiked: Bool
    let isDisliked: Bool
    let onLike: () -> Void
    let onDislike: () -> Void
    let onComment: () -> Void
    let onToggleMute: () -> Void

    @EnvironmentObject private var database: DatabaseManager

    var body: some View {
        ZStack(alignment: .bottom) {
            // Video Layer
            if isCurrent {
                PlayerLayerView(player: player) { _ in }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onToggleMute()
                    }
            } else {
                AsyncImage(url: short.displayThumbnailUrl) { phase in
                    if let image = phase.image {
                        image.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Rectangle().fill(Color.black)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
            }

            // Vignette gradient for readability
            LinearGradient(
                colors: [Color.clear, Color.black.opacity(0.85)],
                startPoint: .center,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            // Overlays Container
            HStack(alignment: .bottom, spacing: 12) {
                // Bottom-Left Overlay: Channel name, avatar, Subscribe, Title
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        ChannelAvatarView(avatarUrl: short.bestAuthorThumbnailURL?.absoluteString, name: short.uploader, size: 34)

                        Text("@\(short.uploader)")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(1)

                        let isSub = database.isSubscribed(channelId: short.channelId)
                        Button {
                            if isSub {
                                database.unsubscribe(channelId: short.channelId)
                            } else {
                                database.subscribe(channelId: short.channelId, title: short.uploader, avatar: "")
                            }
                        } label: {
                            Text(isSub ? "Subscribed" : "Subscribe")
                                .font(.system(size: 12, weight: .bold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 5)
                                .background(isSub ? Color.white.opacity(0.25) : Color.red)
                                .foregroundColor(.white)
                                .cornerRadius(16)
                        }
                    }

                    Text(short.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                .padding(.leading, 14)
                .padding(.bottom, 64)

                Spacer()

                // Right-Side Action Column: Like, Dislike, Comments, Share, Sound
                VStack(spacing: 18) {
                    // Like
                    Button(action: onLike) {
                        VStack(spacing: 4) {
                            Image(systemName: isLiked ? "hand.thumbsup.fill" : "hand.thumbsup")
                                .font(.system(size: 24))
                                .foregroundColor(isLiked ? .red : .white)
                            Text(isLiked ? "Liked" : ((short.viewCount ?? 0) > 0 ? "\((short.viewCount ?? 0) / 20)" : "Like"))
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }

                    // Dislike
                    Button(action: onDislike) {
                        VStack(spacing: 4) {
                            Image(systemName: isDisliked ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                                .font(.system(size: 24))
                                .foregroundColor(isDisliked ? .red : .white)
                            Text("Dislike")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }

                    // Comments
                    Button(action: onComment) {
                        VStack(spacing: 4) {
                            Image(systemName: "bubble.left.and.bubble.right.fill")
                                .font(.system(size: 22))
                                .foregroundColor(.white)
                            Text("Comments")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }

                    // Share
                    ShareLink(item: URL(string: "https://www.youtube.com/shorts/\(short.id)")!) {
                        VStack(spacing: 4) {
                            Image(systemName: "arrowshape.turn.up.right.fill")
                                .font(.system(size: 22))
                                .foregroundColor(.white)
                            Text("Share")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }

                    // Mute / Sound toggle
                    Button(action: onToggleMute) {
                        VStack(spacing: 4) {
                            Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                                .font(.system(size: 22))
                                .foregroundColor(.white)
                            Text(isMuted ? "Muted" : "Sound")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }
                }
                .padding(.trailing, 12)
                .padding(.bottom, 64)
            }
        }
    }
}
