//
//  CommentsSectionView.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import SwiftUI

/// Displays a rich comments section with author avatars, timestamps, pinned badges,
/// creator hearts, like counts, and expandable replies.
public struct CommentsSectionView: View {
    @ObservedObject var watchViewModel: WatchViewModel
    @State private var expandedReplies: Set<String> = []

    public init(watchViewModel: WatchViewModel) {
        self.watchViewModel = watchViewModel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("\(watchViewModel.commentCount) Comments")
                    .font(.system(size: 16, weight: .bold))

                Spacer()

                Button(action: {}) {
                    HStack(spacing: 4) {
                        Image(systemName: "line.3.horizontal.decrease")
                            .font(.system(size: 14))
                        Text("Top")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 16)

            // Comments List
            if watchViewModel.comments.isEmpty && watchViewModel.isLoadingComments {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding(.vertical, 30)
            } else if watchViewModel.comments.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 32))
                        .foregroundColor(.secondary)
                    Text("No comments yet")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 30)
            } else {
                LazyVStack(alignment: .leading, spacing: 20) {
                    ForEach(watchViewModel.comments) { comment in
                        commentRow(comment: comment)
                            .onAppear {
                                if comment.id == watchViewModel.comments.last?.id {
                                    watchViewModel.loadMoreComments()
                                }
                            }
                    }

                    if watchViewModel.isLoadingComments {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .padding(.vertical, 16)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Comment Row

    private func commentRow(comment: Comment, isReply: Bool = false) -> AnyView {
        AnyView(
            HStack(alignment: .top, spacing: 12) {
                // Author Avatar
                avatarView(url: comment.authorThumbnail, name: comment.author, size: isReply ? 28 : 36)

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    // Pinned Badge
                    if comment.isPinned == true {
                        HStack(spacing: 4) {
                            Image(systemName: "pin.fill")
                                .font(.system(size: 10))
                            Text("Pinned by \(watchViewModel.video?.displayChannelTitle ?? "creator")")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(.secondary)
                        .padding(.bottom, 2)
                    }

                    // Author Name & Timestamp
                    HStack(spacing: 6) {
                        Text(comment.author)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.primary)

                        Text(comment.displayTime)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }

                    // Comment Text
                    Text(comment.text)
                        .font(.system(size: 14))
                        .foregroundColor(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, 2)

                    // Actions: Likes & Heart badge
                    HStack(spacing: 16) {
                        // Like button & count
                        HStack(spacing: 4) {
                            Image(systemName: "hand.thumbsup")
                                .font(.system(size: 12))
                            if !comment.formattedLikes.isEmpty {
                                Text(comment.formattedLikes)
                                    .font(.system(size: 12))
                            }
                        }
                        .foregroundColor(.secondary)

                        // Dislike button
                        Image(systemName: "hand.thumbsdown")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)

                        // Creator Heart
                        if comment.isHearted == true {
                            HStack(spacing: 2) {
                                Image(systemName: "heart.fill")
                                    .font(.system(size: 12))
                                    .foregroundColor(.red)
                            }
                        }
                    }
                    .padding(.top, 4)

                    // Expandable Replies Button
                    if comment.replyCount > 0 || !comment.replies.isEmpty {
                        let isExpanded = expandedReplies.contains(comment.id)
                        Button(action: {
                            toggleReplies(for: comment)
                        }) {
                            HStack(spacing: 6) {
                                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                    .font(.system(size: 11, weight: .bold))
                                let count = max(comment.replyCount, comment.replies.count)
                                Text("\(count) \(count == 1 ? "reply" : "replies")")
                                    .font(.system(size: 13, weight: .bold))
                            }
                            .foregroundColor(.blue)
                            .padding(.top, 6)
                        }

                        // Replies Container
                        if isExpanded {
                            VStack(alignment: .leading, spacing: 14) {
                                ForEach(comment.replies) { reply in
                                    commentRow(comment: reply, isReply: true)
                                }
                            }
                            .padding(.top, 8)
                            .padding(.leading, 8)
                        }
                    }
                }
            }
        )
    }

    // MARK: - Avatar View

    private func avatarView(url: String, name: String, size: CGFloat) -> some View {
        Group {
            if let imgURL = URL(string: url), !url.isEmpty {
                AsyncImage(url: imgURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure, .empty:
                        fallbackAvatar(name: name, size: size)
                    @unknown default:
                        fallbackAvatar(name: name, size: size)
                    }
                }
            } else {
                fallbackAvatar(name: name, size: size)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private func fallbackAvatar(name: String, size: CGFloat) -> some View {
        let initial = name.prefix(1).uppercased()
        return ZStack {
            Color.gray.opacity(0.3)
            Text(initial.isEmpty ? "?" : initial)
                .font(.system(size: size * 0.45, weight: .bold))
                .foregroundColor(.white)
        }
    }

    private func toggleReplies(for comment: Comment) {
        if expandedReplies.contains(comment.id) {
            expandedReplies.remove(comment.id)
        } else {
            expandedReplies.insert(comment.id)
            if comment.replies.isEmpty {
                watchViewModel.loadReplies(for: comment)
            }
        }
    }
}
