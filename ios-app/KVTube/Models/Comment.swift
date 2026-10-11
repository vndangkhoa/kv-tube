//
//  Comment.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation

// MARK: - CommentReplies

/// Holds reply continuation metadata or count for nested comments.
public struct CommentReplies: Codable, Hashable, Sendable {
    public var replyCount: Int?
    public var continuation: String?

    public init(replyCount: Int? = nil, continuation: String? = nil) {
        self.replyCount = replyCount
        self.continuation = continuation
    }

    private enum CodingKeys: String, CodingKey {
        case replyCount
        case continuation
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let rc = try? container.decodeIfPresent(Int.self, forKey: .replyCount) {
            replyCount = rc
        } else if let rcStr = try? container.decodeIfPresent(String.self, forKey: .replyCount) {
            replyCount = Int(rcStr)
        } else {
            replyCount = nil
        }
        continuation = try? container.decodeIfPresent(String.self, forKey: .continuation)
    }
}

// MARK: - Comment

/// Represents a single comment on a video.
public struct Comment: Codable, Identifiable, Hashable, Sendable {
    public var author: String
    public var authorThumbnails: [Thumbnail]?
    public var authorId: String?
    public var authorUrl: String?
    public var content: String
    public var publishedText: String?
    public var likeCount: Int?
    public var commentId: String
    public var isHearted: Bool?
    public var isPinned: Bool?
    public var replies: [Comment] = []
    public var repliesInfo: CommentReplies?

    public var id: String { commentId }

    public init(
        author: String = "",
        authorThumbnails: [Thumbnail]? = nil,
        authorId: String? = nil,
        authorUrl: String? = nil,
        content: String = "",
        publishedText: String? = nil,
        likeCount: Int? = nil,
        commentId: String = UUID().uuidString,
        isHearted: Bool? = nil,
        isPinned: Bool? = nil,
        replies: [Comment] = [],
        repliesInfo: CommentReplies? = nil
    ) {
        self.author = author
        self.authorThumbnails = authorThumbnails
        self.authorId = authorId
        self.authorUrl = authorUrl
        self.content = content
        self.publishedText = publishedText
        self.likeCount = likeCount
        self.commentId = commentId
        self.isHearted = isHearted
        self.isPinned = isPinned
        self.replies = replies
        self.repliesInfo = repliesInfo
    }

    /// Compatibility initializer for legacy view call sites
    public init(
        id: String,
        author: String,
        authorThumb: String = "",
        authorId: String = "",
        content: String = "",
        publishedTime: String = "",
        likeCount: Int = 0
    ) {
        self.commentId = id
        self.author = author
        if !authorThumb.isEmpty {
            self.authorThumbnails = [Thumbnail(quality: "medium", url: authorThumb)]
        } else {
            self.authorThumbnails = nil
        }
        self.authorId = authorId.isEmpty ? nil : authorId
        self.authorUrl = nil
        self.content = content
        self.publishedText = publishedTime.isEmpty ? nil : publishedTime
        self.likeCount = likeCount
        self.isHearted = false
        self.isPinned = false
        self.replies = []
        self.repliesInfo = nil
    }

    // MARK: - Compatibility Getters & Setters

    public var authorThumb: String {
        get { bestAvatar?.url ?? "" }
        set {
            if !newValue.isEmpty {
                authorThumbnails = [Thumbnail(quality: "medium", url: newValue)]
            }
        }
    }

    public var authorThumbnail: String {
        get { authorThumb }
        set { authorThumb = newValue }
    }

    public var text: String {
        get { content }
        set { content = newValue }
    }

    public var publishedTime: String {
        get { publishedText ?? "" }
        set { publishedText = newValue }
    }

    public var displayTime: String {
        publishedText ?? ""
    }

    public var likes: Int {
        get { likeCount ?? 0 }
        set { likeCount = newValue }
    }

    public var replyCount: Int {
        repliesInfo?.replyCount ?? replies.count
    }

    // MARK: - Coding Keys & Decoding

    private enum CodingKeys: String, CodingKey {
        case author
        case authorThumbnails
        case author_thumbnail
        case authorId
        case authorUrl
        case content
        case contentHtml
        case publishedText
        case published
        case likeCount
        case likes
        case commentId
        case id
        case isHearted
        case isPinned
        case replies
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        author = (try? container.decodeIfPresent(String.self, forKey: .author)) ?? "User"

        if let thumbs = try? container.decodeIfPresent([Thumbnail].self, forKey: .authorThumbnails) {
            authorThumbnails = thumbs
        } else if let singleThumb = try? container.decodeIfPresent(String.self, forKey: .author_thumbnail), !singleThumb.isEmpty {
            authorThumbnails = [Thumbnail(quality: "medium", url: singleThumb)]
        } else {
            authorThumbnails = nil
        }

        authorId = try? container.decodeIfPresent(String.self, forKey: .authorId)
        authorUrl = try? container.decodeIfPresent(String.self, forKey: .authorUrl)

        let rawContent = (try? container.decodeIfPresent(String.self, forKey: .content))
            ?? (try? container.decodeIfPresent(String.self, forKey: .contentHtml))
            ?? ""
        // Strip basic HTML tags
        content = rawContent.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression, range: nil)

        publishedText = (try? container.decodeIfPresent(String.self, forKey: .publishedText))
            ?? (try? container.decodeIfPresent(String.self, forKey: .published))

        if let lc = try? container.decodeIfPresent(Int.self, forKey: .likeCount) {
            likeCount = lc
        } else if let l = try? container.decodeIfPresent(Int.self, forKey: .likes) {
            likeCount = l
        } else if let lcStr = try? container.decodeIfPresent(String.self, forKey: .likeCount) {
            likeCount = Int(lcStr)
        } else {
            likeCount = nil
        }

        commentId = (try? container.decodeIfPresent(String.self, forKey: .commentId))
            ?? (try? container.decodeIfPresent(String.self, forKey: .id))
            ?? UUID().uuidString

        isHearted = try? container.decodeIfPresent(Bool.self, forKey: .isHearted)
        isPinned = try? container.decodeIfPresent(Bool.self, forKey: .isPinned)

        if let repliesArray = try? container.decodeIfPresent([Comment].self, forKey: .replies) {
            replies = repliesArray
            repliesInfo = nil
        } else if let repliesObj = try? container.decodeIfPresent(CommentReplies.self, forKey: .replies) {
            replies = []
            repliesInfo = repliesObj
        } else {
            replies = []
            repliesInfo = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(author, forKey: .author)
        try container.encodeIfPresent(authorThumbnails, forKey: .authorThumbnails)
        try container.encodeIfPresent(authorId, forKey: .authorId)
        try container.encodeIfPresent(authorUrl, forKey: .authorUrl)
        try container.encode(content, forKey: .content)
        try container.encodeIfPresent(publishedText, forKey: .publishedText)
        try container.encodeIfPresent(likeCount, forKey: .likeCount)
        try container.encode(commentId, forKey: .commentId)
        try container.encodeIfPresent(isHearted, forKey: .isHearted)
        try container.encodeIfPresent(isPinned, forKey: .isPinned)
        if !replies.isEmpty {
            try container.encode(replies, forKey: .replies)
        } else if let info = repliesInfo {
            try container.encode(info, forKey: .replies)
        }
    }

    // MARK: - Computed Properties

    public var bestAvatar: Thumbnail? {
        authorThumbnails?.bestThumbnail
    }

    public var authorThumbnailURL: URL? {
        bestAvatar?.asURL
    }

    public var formattedLikes: String {
        guard let count = likeCount, count > 0 else { return "" }
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000.0)
        } else if count >= 1_000 {
            return String(format: "%.1fK", Double(count) / 1_000.0)
        } else {
            return "\(count)"
        }
    }
}

// MARK: - CommentsPage

/// Paginated comment list from Invidious.
public struct CommentsPage: Codable, Sendable {
    public var comments: [Comment]
    public var continuation: String?
    public var commentCount: Int?

    public init(
        comments: [Comment] = [],
        continuation: String? = nil,
        commentCount: Int? = nil
    ) {
        self.comments = comments
        self.continuation = continuation
        self.commentCount = commentCount
    }

    private enum CodingKeys: String, CodingKey {
        case comments
        case continuation
        case commentCount = "commentCount"
        case comment_count = "comment_count"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        comments = (try? container.decodeIfPresent([Comment].self, forKey: .comments)) ?? []
        continuation = try? container.decodeIfPresent(String.self, forKey: .continuation)

        if let cc = try? container.decodeIfPresent(Int.self, forKey: .commentCount) {
            commentCount = cc
        } else if let ccAlt = try? container.decodeIfPresent(Int.self, forKey: .comment_count) {
            commentCount = ccAlt
        } else if let ccStr = try? container.decodeIfPresent(String.self, forKey: .commentCount) {
            commentCount = Int(ccStr)
        } else {
            commentCount = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(comments, forKey: .comments)
        try container.encodeIfPresent(continuation, forKey: .continuation)
        try container.encodeIfPresent(commentCount, forKey: .commentCount)
    }
}
