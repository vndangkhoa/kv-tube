import Foundation

public struct PlaylistData: Identifiable, Codable, Hashable {
    public let id: String
    public var title: String
    public var author: String
    public var authorId: String
    public var videoCount: Int
    public var thumbnail: String

    public enum CodingKeys: String, CodingKey {
        case id
        case playlistId
        case title
        case author
        case authorId
        case videoCount
        case thumbnail = "playlistThumbnail"
        case thumbnailAlt = "thumbnail"
    }

    public init(
        id: String,
        title: String,
        author: String = "",
        authorId: String = "",
        videoCount: Int = 0,
        thumbnail: String = ""
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.authorId = authorId
        self.videoCount = videoCount
        self.thumbnail = thumbnail
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = (try? container.decode(String.self, forKey: .id))
            ?? (try? container.decode(String.self, forKey: .playlistId))
            ?? ""
        self.title = (try? container.decode(String.self, forKey: .title)) ?? "Playlist"
        self.author = (try? container.decode(String.self, forKey: .author)) ?? ""
        self.authorId = (try? container.decode(String.self, forKey: .authorId)) ?? ""
        self.videoCount = (try? container.decode(Int.self, forKey: .videoCount)) ?? 0
        self.thumbnail = (try? container.decode(String.self, forKey: .thumbnail))
            ?? (try? container.decode(String.self, forKey: .thumbnailAlt))
            ?? ""
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        try container.encode(author, forKey: .author)
        try container.encode(authorId, forKey: .authorId)
        try container.encode(videoCount, forKey: .videoCount)
        try container.encode(thumbnail, forKey: .thumbnail)
    }
}
