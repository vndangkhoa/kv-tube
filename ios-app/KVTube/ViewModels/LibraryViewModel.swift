import Foundation
import Combine

public final class LibraryViewModel: ObservableObject {
    @Published public var searchQuery: String = ""

    private let database: DatabaseManager
    private let downloadManager: DownloadManager
    private var cancellables = Set<AnyCancellable>()

    public init(
        database: DatabaseManager = .shared,
        downloadManager: DownloadManager = .shared
    ) {
        self.database = database
        self.downloadManager = downloadManager

        database.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)

        downloadManager.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)
    }

    public var recentHistory: [HistoryItem] {
        Array(database.history.prefix(10))
    }

    public var allHistory: [HistoryItem] {
        if searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return database.history
        }
        return database.history.filter {
            $0.title.localizedCaseInsensitiveContains(searchQuery) ||
            $0.uploader.localizedCaseInsensitiveContains(searchQuery)
        }
    }

    public var likedVideos: [VideoData] {
        database.likedVideos.map { $0.toVideoData() }
    }

    public var downloads: [DownloadItem] {
        database.downloads
    }

    public var storageUsageText: String {
        downloadManager.totalDiskUsageFormatted
    }

    public func removeHistoryItem(videoId: String) {
        database.removeHistoryItem(videoId: videoId)
    }

    public func clearAllHistory() {
        database.clearHistory()
    }

    public func removeDownload(videoId: String) {
        downloadManager.deleteDownload(videoId: videoId)
    }
}
