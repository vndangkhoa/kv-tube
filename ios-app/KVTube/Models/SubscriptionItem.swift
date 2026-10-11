import Foundation

public struct SubscriptionItem: Identifiable, Codable, Hashable {
    public var id: String { channelId }
    public let channelId: String
    public var channelTitle: String
    public var channelAvatar: String
    public var subscribedAt: Date
    public var hasNewVideos: Bool

    public init(
        channelId: String,
        channelTitle: String,
        channelAvatar: String = "",
        subscribedAt: Date = Date(),
        hasNewVideos: Bool = false
    ) {
        self.channelId = channelId
        self.channelTitle = channelTitle
        self.channelAvatar = channelAvatar
        self.subscribedAt = subscribedAt
        self.hasNewVideos = hasNewVideos
    }
}
