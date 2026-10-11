//
//  VideoModels.swift
//  KVTube
//
//  Data models for Invidious video playback, stream metadata, and feeds.
//

import Foundation

public struct ThumbnailImage: Codable, Sendable, Equatable, Hashable {
    public let quality: String?
    public let url: String
    public let width: Int?
    public let height: Int?

    public init(quality: String? = nil, url: String, width: Int? = nil, height: Int? = nil) {
        self.quality = quality
        self.url = url
        self.width = width
        self.height = height
    }
}

public struct VideoFormat: Codable, Sendable, Equatable {
    public let url: String
    public let itag: String?
    public let type: String?
    public let quality: String?
    public let qualityLabel: String?
    public let bitrate: String?
    public let container: String?
    public let resolution: String?
    public let fps: Int?
    public let clen: String?

    public init(
        url: String,
        itag: String? = nil,
        type: String? = nil,
        quality: String? = nil,
        qualityLabel: String? = nil,
        bitrate: String? = nil,
        container: String? = nil,
        resolution: String? = nil,
        fps: Int? = nil,
        clen: String? = nil
    ) {
        self.url = url
        self.itag = itag
        self.type = type
        self.quality = quality
        self.qualityLabel = qualityLabel
        self.bitrate = bitrate
        self.container = container
        self.resolution = resolution
        self.fps = fps
        self.clen = clen
    }
}

public struct InvidiousVideo: Codable, Sendable, Equatable, Identifiable {
    public var id: String { videoId }
    public let videoId: String
    public let title: String
    public let description: String?
    public let author: String
    public let authorId: String
    public let authorUrl: String?
    public let authorThumbnails: [ThumbnailImage]?
    public let lengthSeconds: Int
    public let viewCount: Int
    public let published: Int?
    public let publishedText: String?
    public let formatStreams: [VideoFormat]?
    public let adaptiveFormats: [VideoFormat]?
    public let videoThumbnails: [ThumbnailImage]?
    public let likeCount: Int?

    public init(
        videoId: String,
        title: String,
        description: String? = nil,
        author: String,
        authorId: String,
        authorUrl: String? = nil,
        authorThumbnails: [ThumbnailImage]? = nil,
        lengthSeconds: Int,
        viewCount: Int = 0,
        published: Int? = nil,
        publishedText: String? = nil,
        formatStreams: [VideoFormat]? = nil,
        adaptiveFormats: [VideoFormat]? = nil,
        videoThumbnails: [ThumbnailImage]? = nil,
        likeCount: Int? = nil
    ) {
        self.videoId = videoId
        self.title = title
        self.description = description
        self.author = author
        self.authorId = authorId
        self.authorUrl = authorUrl
        self.authorThumbnails = authorThumbnails
        self.lengthSeconds = lengthSeconds
        self.viewCount = viewCount
        self.published = published
        self.publishedText = publishedText
        self.formatStreams = formatStreams
        self.adaptiveFormats = adaptiveFormats
        self.videoThumbnails = videoThumbnails
        self.likeCount = likeCount
    }
}

public struct InvidiousTrendingVideo: Codable, Sendable, Equatable, Identifiable {
    public var id: String { videoId }
    public let videoId: String
    public let title: String
    public let author: String
    public let authorId: String
    public let viewCount: Int?
    public let published: Int?
    public let publishedText: String?
    public let lengthSeconds: Int
    public let videoThumbnails: [ThumbnailImage]?

    public init(
        videoId: String,
        title: String,
        author: String,
        authorId: String,
        viewCount: Int? = nil,
        published: Int? = nil,
        publishedText: String? = nil,
        lengthSeconds: Int = 0,
        videoThumbnails: [ThumbnailImage]? = nil
    ) {
        self.videoId = videoId
        self.title = title
        self.author = author
        self.authorId = authorId
        self.viewCount = viewCount
        self.published = published
        self.publishedText = publishedText
        self.lengthSeconds = lengthSeconds
        self.videoThumbnails = videoThumbnails
    }
}
