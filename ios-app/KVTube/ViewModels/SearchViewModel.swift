import Foundation
import Combine

public final class SearchViewModel: ObservableObject {
    @Published public var query: String = ""
    @Published public var suggestions: [String] = []
    @Published public var results: [SearchResultItem] = []
    @Published public var isLoading: Bool = false
    @Published public var isSearching: Bool = false
    @Published public var errorMessage: String? = nil

    // Filter Options
    @Published public var sortBy: SearchSortBy = .relevance
    @Published public var uploadDate: SearchUploadDate = .all
    @Published public var searchType: SearchType = .all
    @Published public var duration: SearchDuration = .all

    private var currentPage: Int = 1
    private var hasMore: Bool = true
    private let api: KVApi
    private var cancellables = Set<AnyCancellable>()

    public init(api: KVApi = .shared) {
        self.api = api

        // Debounce search suggestions
        $query
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] q in
                self?.fetchSuggestions(q)
            }
            .store(in: &cancellables)
    }

    private func fetchSuggestions(_ q: String) {
        guard !q.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            self.suggestions = []
            return
        }
        Task { [weak self] in
            guard let self = self else { return }
            let list = await self.api.fetchSuggestions(query: q)
            await MainActor.run {
                self.suggestions = list
            }
        }
    }

    @MainActor
    public func performSearch(newQuery: String? = nil) async {
        if let newQ = newQuery {
            self.query = newQ
        }

        let trimmed = self.query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Persist to search history
        DatabaseManager.shared.addSearchQuery(trimmed)

        self.isLoading = true
        self.isSearching = true
        self.currentPage = 1
        self.errorMessage = nil

        do {
            let res = try await api.search(
                query: trimmed,
                page: currentPage,
                sortBy: sortBy,
                date: uploadDate,
                type: searchType,
                duration: duration,
                region: SettingsStore.shared.region
            )
            self.results = res
            self.hasMore = !res.isEmpty
            self.currentPage += 1
        } catch {
            self.errorMessage = "Search failed: \(error.localizedDescription)"
        }

        self.isLoading = false
    }

    @MainActor
    public func loadMoreResults() async {
        guard !isLoading && hasMore else { return }
        let trimmed = self.query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isLoading = true
        do {
            let res = try await api.search(
                query: trimmed,
                page: currentPage,
                sortBy: sortBy,
                date: uploadDate,
                type: searchType,
                duration: duration,
                region: SettingsStore.shared.region
            )
            let existingIds = Set(self.results.map { $0.id })
            let newUnique = res.filter { !existingIds.contains($0.id) }
            self.results.append(contentsOf: newUnique)
            self.hasMore = !res.isEmpty
            self.currentPage += 1
        } catch {}
        isLoading = false
    }

    public var hasActiveFilters: Bool {
        sortBy != .relevance || uploadDate != .all || searchType != .all || duration != .all
    }

    public func resetFilters() {
        sortBy = .relevance
        uploadDate = .all
        searchType = .all
        duration = .all
    }
}
