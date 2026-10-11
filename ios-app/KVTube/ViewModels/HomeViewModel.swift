import Foundation
import SwiftUI
import Combine

public final class HomeViewModel: ObservableObject {
    @Published public var videos: [VideoData] = []
    @Published public var isLoading: Bool = false
    @Published public var isRefreshing: Bool = false
    @Published public var selectedCategory: String = "All"
    @Published public var errorMessage: String? = nil

    private var currentPage: Int = 1
    private var hasMorePages: Bool = true
    private let api: KVApi

    public init(api: KVApi = .shared) {
        self.api = api
    }

    @MainActor
    public func loadFeed(refresh: Bool = false) async {
        if refresh {
            currentPage = 1
            hasMorePages = true
            isRefreshing = true
        } else {
            guard !isLoading && hasMorePages else { return }
            isLoading = true
        }
        errorMessage = nil

        do {
            let fetched: [VideoData]
            if selectedCategory == "All" {
                fetched = try await api.fetchHomeFeed(page: currentPage)
            } else if selectedCategory == "Trending" {
                fetched = try await api.fetchTrending(region: SettingsStore.shared.region)
            } else {
                // Category search matching Android
                let query = getCategoryQuery(regionCode: SettingsStore.shared.region, category: selectedCategory)
                let searchItems = try await api.search(
                    query: query,
                    page: currentPage,
                    sortBy: .relevance,
                    type: .video,
                    region: SettingsStore.shared.region
                )
                fetched = searchItems.compactMap { item in
                    if case .video(let v) = item { return v }
                    return nil
                }
            }

            if refresh {
                self.videos = fetched
            } else {
                let existingIds = Set(self.videos.map { $0.id })
                let newUnique = fetched.filter { !existingIds.contains($0.id) }
                self.videos.append(contentsOf: newUnique)
            }

            self.hasMorePages = !fetched.isEmpty
            self.currentPage += 1
        } catch {
            if self.videos.isEmpty {
                self.errorMessage = "Could not load feed. Check server settings."
            }
        }

        isLoading = false
        isRefreshing = false
    }

    public func selectCategory(_ category: String) {
        guard selectedCategory != category else { return }
        selectedCategory = category
        Task {
            await loadFeed(refresh: true)
        }
    }

    public func loadMoreIfNeeded(currentItem: VideoData) {
        guard let last = videos.last, last.id == currentItem.id else { return }
        Task {
            await loadFeed(refresh: false)
        }
    }

    private func getCategoryQuery(regionCode: String, category: String) -> String {
        switch category {
        case "Music": return regionCode == "VN" ? "nhạc trẻ mới nhất 2026" : "music 2026 trending"
        case "Gaming": return regionCode == "VN" ? "gaming việt nam" : "gaming gameplay 2026"
        case "News": return regionCode == "VN" ? "tin tức 24h" : "news today"
        case "Sports": return regionCode == "VN" ? "bóng đá việt nam" : "sports highlights"
        case "Live": return "live stream"
        case "Education": return "educational video tutorial"
        case "Comedy": return regionCode == "VN" ? "phim hài việt nam" : "comedy sketch funny"
        case "Tech": return "tech review gadget 2026"
        case "Food": return regionCode == "VN" ? "món ăn ngon ẩm thực" : "cooking recipe"
        case "Travel": return "travel vlog 4k"
        case "Fashion": return "fashion style"
        case "Science": return "science documentary"
        default: return category
        }
    }
}
