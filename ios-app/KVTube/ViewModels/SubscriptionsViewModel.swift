import Foundation
import Combine

public final class SubscriptionsViewModel: ObservableObject {
    @Published public var subscriptions: [SubscriptionItem] = []
    @Published public var feedVideos: [VideoData] = []
    @Published public var isLoading: Bool = false
    @Published public var selectedChannelId: String? = nil

    private let api: KVApi

    public init(api: KVApi = .shared) {
        self.api = api
    }

    @MainActor
    public func loadSubscriptionsAndFeed() async {
        isLoading = true

        // 1. Sync local subscriptions
        var subs = DatabaseManager.shared.subscriptions

        // 2. If token present, attempt to sync remote Invidious subscriptions
        if !SettingsStore.shared.invidiousToken.isEmpty {
            if let remoteSubs = try? await api.fetchRemoteSubscriptions(), !remoteSubs.isEmpty {
                DatabaseManager.shared.importSubscriptions(remoteSubs)
                subs = DatabaseManager.shared.subscriptions
            }
        }

        self.subscriptions = subs

        guard !subs.isEmpty else {
            self.feedVideos = []
            self.isLoading = false
            return
        }

        // 3. Fetch latest videos from top channels
        var fetchedVideos: [VideoData] = []
        let channelsToFetch = Array(subs.prefix(12))

        await withTaskGroup(of: [VideoData].self) { group in
            for sub in channelsToFetch {
                group.addTask {
                    if let page = try? await self.api.fetchChannelPage(channelId: sub.channelId) {
                        return Array(page.videos.prefix(4))
                    }
                    return []
                }
            }

            for await vids in group {
                fetchedVideos.append(contentsOf: vids)
            }
        }

        // De-duplicate and order
        var seen = Set<String>()
        var unique: [VideoData] = []
        for vid in fetchedVideos {
            if !seen.contains(vid.id) {
                seen.insert(vid.id)
                unique.append(vid)
            }
        }

        self.feedVideos = unique
        self.isLoading = false
    }

    public var displayedVideos: [VideoData] {
        if let sel = selectedChannelId {
            return feedVideos.filter { $0.channelId == sel }
        }
        return feedVideos
    }
}
