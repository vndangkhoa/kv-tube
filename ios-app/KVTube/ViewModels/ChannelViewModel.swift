import Foundation
import Combine

public enum ChannelTab: String, CaseIterable, Identifiable {
    case videos = "Videos"
    case shorts = "Shorts"
    case playlists = "Playlists"
    case about = "About"

    public var id: String { rawValue }
}

public final class ChannelViewModel: ObservableObject {
    @Published public var channel: ChannelInfo?
    @Published public var videos: [VideoData] = []
    @Published public var shorts: [VideoData] = []
    @Published public var playlists: [PlaylistData] = []
    @Published public var selectedTab: ChannelTab = .videos
    @Published public var isLoading: Bool = false
    @Published public var errorMessage: String? = nil

    private let api: KVApi

    public init(api: KVApi = .shared) {
        self.api = api
    }

    @MainActor
    public func loadChannel(channelId: String) async {
        guard !channelId.isEmpty else { return }
        isLoading = true
        errorMessage = nil

        do {
            async let pageTask = api.fetchChannelPage(channelId: channelId)
            async let playlistsTask = api.fetchChannelPlaylists(channelId: channelId)

            let (page, channelPlaylists) = try await (pageTask, playlistsTask)
            self.channel = page.channel
            self.playlists = channelPlaylists

            // Segregate videos and shorts with fallback to latestVideos
            let allVids = !page.videos.isEmpty ? page.videos : (page.channel.latestVideos ?? [])
            let normalVideos = allVids.filter { !$0.isShort && $0.durationSeconds > 60 }
            self.videos = normalVideos.isEmpty ? allVids : normalVideos
            self.shorts = allVids.filter { $0.isShort || ($0.durationSeconds > 0 && $0.durationSeconds <= 60) }

            // Check if subscribed locally
            if var ch = self.channel {
                ch.isSubscribed = DatabaseManager.shared.isSubscribed(channelId: channelId)
                self.channel = ch
            }
        } catch {
            self.errorMessage = "Failed to load channel: \(error.localizedDescription)"
        }

        isLoading = false
    }

    public func toggleSubscription() {
        guard let ch = channel else { return }
        DatabaseManager.shared.toggleSubscription(channel: ch)
        var updated = ch
        updated.isSubscribed.toggle()
        self.channel = updated
    }
}
