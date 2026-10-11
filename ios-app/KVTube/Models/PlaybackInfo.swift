//
//  PlaybackInfo.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation

// MARK: - StreamFormat

/// Represents an individual video or audio stream format from Invidious/YouTube.
public struct StreamFormat: Codable, Identifiable, Hashable, Sendable {
    public var url: String
    public var itag: String?
    public var type: String?
    public var quality: String?
    public var bitrate: Int64?
    public var container: String?
    public var resolution: String?
    public var qualityLabel: String?
    public var fps: Int?

    // Additional fields for extended stream extraction
    public var width: Int?
    public var vcodec: String?
    public var acodec: String?
    public var ext: String?
    public var filesize: Int64?

    public var id: String {
        if let itag = itag, !itag.isEmpty {
            return "\(itag)_\(qualityLabel ?? resolution ?? "")"
        }
        return url
    }

    public var formatId: String {
        itag ?? ""
    }

    public init(
        url: String,
        itag: String? = nil,
        type: String? = nil,
        quality: String? = nil,
        bitrate: Int64? = nil,
        container: String? = nil,
        resolution: String? = nil,
        qualityLabel: String? = nil,
        fps: Int? = nil,
        width: Int? = nil,
        vcodec: String? = nil,
        acodec: String? = nil,
        ext: String? = nil,
        filesize: Int64? = nil
    ) {
        self.url = url
        self.itag = itag
        self.type = type
        self.quality = quality
        self.bitrate = bitrate
        self.container = container
        self.resolution = resolution
        self.qualityLabel = qualityLabel
        self.fps = fps
        self.width = width
        self.vcodec = vcodec
        self.acodec = acodec
        self.ext = ext
        self.filesize = filesize
    }

    public init(formatId: String = "default", height: Int = 720, url: String, hasAudio: Bool = true) {
        self.url = url
        self.itag = formatId
        self.qualityLabel = "\(height)p"
        self.resolution = "\(Int(Double(height) * 16.0 / 9.0))x\(height)"
        self.type = hasAudio ? "video/mp4" : "video/webm"
    }

    private enum CodingKeys: String, CodingKey {
        case url
        case itag
        case formatId = "format_id"
        case type
        case quality
        case bitrate
        case container
        case resolution
        case qualityLabel
        case fps
        case width
        case height
        case vcodec
        case acodec
        case ext
        case filesize
        case bandwidth
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        url = (try? container.decodeIfPresent(String.self, forKey: .url)) ?? ""

        if let itagStr = try? container.decodeIfPresent(String.self, forKey: .itag) {
            itag = itagStr
        } else if let itagInt = try? container.decodeIfPresent(Int.self, forKey: .itag) {
            itag = String(itagInt)
        } else if let fId = try? container.decodeIfPresent(String.self, forKey: .formatId) {
            itag = fId
        } else {
            itag = nil
        }

        type = try? container.decodeIfPresent(String.self, forKey: .type)
        quality = try? container.decodeIfPresent(String.self, forKey: .quality)

        if let b = try? container.decodeIfPresent(Int64.self, forKey: .bitrate) {
            bitrate = b
        } else if let bInt = try? container.decodeIfPresent(Int.self, forKey: .bandwidth) {
            bitrate = Int64(bInt)
        } else if let bStr = try? container.decodeIfPresent(String.self, forKey: .bitrate) {
            bitrate = Int64(bStr)
        } else {
            bitrate = nil
        }

        self.container = try? container.decodeIfPresent(String.self, forKey: .container)
        resolution = try? container.decodeIfPresent(String.self, forKey: .resolution)
        qualityLabel = try? container.decodeIfPresent(String.self, forKey: .qualityLabel)

        if let f = try? container.decodeIfPresent(Int.self, forKey: .fps) {
            fps = f
        } else if let fStr = try? container.decodeIfPresent(String.self, forKey: .fps) {
            fps = Int(fStr)
        } else {
            fps = nil
        }

        width = try? container.decodeIfPresent(Int.self, forKey: .width)
        vcodec = try? container.decodeIfPresent(String.self, forKey: .vcodec)
        acodec = try? container.decodeIfPresent(String.self, forKey: .acodec)
        ext = try? container.decodeIfPresent(String.self, forKey: .ext)
        filesize = try? container.decodeIfPresent(Int64.self, forKey: .filesize)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(url, forKey: .url)
        try container.encodeIfPresent(itag, forKey: .itag)
        try container.encodeIfPresent(type, forKey: .type)
        try container.encodeIfPresent(quality, forKey: .quality)
        try container.encodeIfPresent(bitrate, forKey: .bitrate)
        try container.encodeIfPresent(self.container, forKey: .container)
        try container.encodeIfPresent(resolution, forKey: .resolution)
        try container.encodeIfPresent(qualityLabel, forKey: .qualityLabel)
        try container.encodeIfPresent(fps, forKey: .fps)
    }

    // MARK: - Computed Properties

    public var asURL: URL? {
        URL(string: url)
    }

    /// Whether this stream is audio-only (no video channel).
    public var isAudioOnly: Bool {
        if let type = type?.lowercased() {
            return type.hasPrefix("audio/")
        }
        return container?.lowercased() == "m4a" || container?.lowercased() == "opus"
    }

    /// Whether this stream is video-only (no audio channel).
    public var isVideoOnly: Bool {
        if let type = type?.lowercased() {
            return type.hasPrefix("video/") && !type.contains("codecs=\"")
        }
        return false
    }

    /// Whether this stream has both audio and video multiplexed.
    public var hasAudio: Bool {
        if isAudioOnly { return true }
        if let type = type?.lowercased() {
            return type.contains("audio") || (type.contains("codecs=") && type.contains("mp4a"))
        }
        return !isVideoOnly
    }

    /// Extracted numeric vertical resolution (e.g. 1080 from "1080p" or "1920x1080").
    public var height: Int {
        if let label = qualityLabel {
            let digits = label.prefix { $0.isNumber }
            if let h = Int(digits), h > 0 { return h }
        }
        if let res = resolution {
            let parts = res.split(separator: "x")
            if parts.count == 2, let h = Int(parts[1]), h > 0 { return h }
        }
        if let q = quality {
            let digits = q.prefix { $0.isNumber }
            if let h = Int(digits), h > 0 { return h }
        }
        return 0
    }

    /// User-friendly label for display in resolution picker.
    public var displayLabel: String {
        if isAudioOnly {
            if let br = bitrate, br > 0 {
                return "Audio (\(br / 1000) kbps)"
            }
            return "Audio Only"
        }
        var base = qualityLabel ?? (height > 0 ? "\(height)p" : (quality ?? "Auto"))
        if let fps = fps, fps > 30 {
            base += "\(fps)"
        }
        return base
    }

    /// Short label (e.g. "1080p", "720p", "Auto").
    public var shortLabel: String {
        if height > 0 {
            return "\(height)p"
        }
        return qualityLabel ?? "Auto"
    }

    /// Formatted bitrate string (e.g. "1.5 Mbps" or "128 kbps").
    public var formattedBitrate: String {
        guard let br = bitrate, br > 0 else { return "" }
        if br >= 1_000_000 {
            return String(format: "%.1f Mbps", Double(br) / 1_000_000.0)
        } else {
            return "\(br / 1000) kbps"
        }
    }
}

public typealias PlaybackFormat = StreamFormat

// MARK: - PlaybackInfo

/// Full playback information returned by Invidious / KV-Tube for a video.
public struct PlaybackInfo: Codable, Hashable, Sendable {
    public var videoId: String
    public var title: String
    public var description: String?
    public var hlsUrl: String?
    public var dashUrl: String?
    public var formatStreams: [StreamFormat]?
    public var adaptiveFormats: [StreamFormat]?

    public init(
        videoId: String = "",
        title: String = "",
        description: String? = nil,
        hlsUrl: String? = nil,
        dashUrl: String? = nil,
        formatStreams: [StreamFormat]? = nil,
        adaptiveFormats: [StreamFormat]? = nil
    ) {
        self.videoId = videoId
        self.title = title
        self.description = description
        self.hlsUrl = hlsUrl
        self.dashUrl = dashUrl
        self.formatStreams = formatStreams
        self.adaptiveFormats = adaptiveFormats
    }

    // Convenience initializer for callers passing videoFormats
    public init(
        title: String = "",
        duration: Double = 0.0,
        videoFormats: [StreamFormat] = [],
        audioFormat: StreamFormat? = nil,
        hlsUrl: String? = nil
    ) {
        self.videoId = ""
        self.title = title
        self.description = nil
        self.hlsUrl = hlsUrl
        self.dashUrl = nil
        self.formatStreams = videoFormats.filter { $0.hasAudio }
        var adaptives = videoFormats.filter { !$0.hasAudio }
        if let audio = audioFormat {
            adaptives.append(audio)
        }
        self.adaptiveFormats = adaptives
    }

    private enum CodingKeys: String, CodingKey {
        case videoId
        case id
        case title
        case description
        case hlsUrl = "hlsUrl"
        case hls_url = "hls_url"
        case dashUrl = "dashUrl"
        case dash_url = "dash_url"
        case formatStreams = "formatStreams"
        case adaptiveFormats = "adaptiveFormats"
        case videoFormats = "video_formats"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        videoId = (try? container.decodeIfPresent(String.self, forKey: .videoId))
            ?? (try? container.decodeIfPresent(String.self, forKey: .id)) ?? ""
        title = (try? container.decodeIfPresent(String.self, forKey: .title)) ?? ""
        description = try? container.decodeIfPresent(String.self, forKey: .description)

        hlsUrl = (try? container.decodeIfPresent(String.self, forKey: .hlsUrl))
            ?? (try? container.decodeIfPresent(String.self, forKey: .hls_url))

        dashUrl = (try? container.decodeIfPresent(String.self, forKey: .dashUrl))
            ?? (try? container.decodeIfPresent(String.self, forKey: .dash_url))

        let fs = try? container.decodeIfPresent([StreamFormat].self, forKey: .formatStreams)
        let vf = try? container.decodeIfPresent([StreamFormat].self, forKey: .videoFormats)
        formatStreams = fs ?? vf

        adaptiveFormats = try? container.decodeIfPresent([StreamFormat].self, forKey: .adaptiveFormats)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(videoId, forKey: .videoId)
        try container.encode(title, forKey: .title)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(hlsUrl, forKey: .hlsUrl)
        try container.encodeIfPresent(dashUrl, forKey: .dashUrl)
        try container.encodeIfPresent(formatStreams, forKey: .formatStreams)
        try container.encodeIfPresent(adaptiveFormats, forKey: .adaptiveFormats)
    }

    // MARK: - Computed Helpers

    public var hlsURL: URL? {
        guard let hls = hlsUrl, !hls.isEmpty else { return nil }
        return URL(string: hls)
    }

    public var dashURL: URL? {
        guard let dash = dashUrl, !dash.isEmpty else { return nil }
        return URL(string: dash)
    }

    public var duration: Double {
        0.0
    }

    /// Progressive format streams (audio + video combined in one stream, e.g. 720p / 360p MP4).
    public var progressiveStreams: [StreamFormat] {
        (formatStreams ?? []).filter { !$0.url.isEmpty }
    }

    /// All video formats (progressive + adaptive video formats).
    public var videoFormats: [StreamFormat] {
        progressiveStreams + (adaptiveFormats ?? []).filter { !$0.isAudioOnly && !$0.url.isEmpty }
    }

    /// Highest resolution progressive stream available (audio + video combined).
    public var bestProgressiveFormat: StreamFormat? {
        progressiveStreams.max(by: { $0.height < $1.height })
    }

    /// Best available audio-only format (highest bitrate, typically m4a / aac or opus).
    public var bestAudioFormat: StreamFormat? {
        let audios = (adaptiveFormats ?? []).filter { $0.isAudioOnly && !$0.url.isEmpty }
        if let bestM4A = audios.filter({ ($0.container ?? "").lowercased() == "m4a" || ($0.type ?? "").contains("mp4") }).max(by: { ($0.bitrate ?? 0) < ($1.bitrate ?? 0) }) {
            return bestM4A
        }
        return audios.max(by: { ($0.bitrate ?? 0) < ($1.bitrate ?? 0) })
    }

    public var audioFormat: StreamFormat? {
        bestAudioFormat
    }

    /// Progressive stream matching a preferred target height (e.g. 1080, 720, 480).
    public func progressiveFormat(targetHeight: Int) -> StreamFormat? {
        let available = progressiveStreams.sorted(by: { $0.height > $1.height })
        if available.isEmpty { return nil }
        if let exact = available.first(where: { $0.height == targetHeight }) {
            return exact
        }
        if let lowerOrEqual = available.first(where: { $0.height <= targetHeight }) {
            return lowerOrEqual
        }
        return available.first
    }

    /// Returns the best playable progressive stream that contains both video and audio,
    /// or falls back to the highest resolution stream available.
    public var preferredStream: StreamFormat? {
        let withAudio = videoFormats.filter { $0.hasAudio && !$0.url.isEmpty }
        if let bestMuxed = withAudio.max(by: { $0.height < $1.height }) {
            return bestMuxed
        }
        return videoFormats.filter { !$0.url.isEmpty }.max(by: { $0.height < $1.height })
    }
}
