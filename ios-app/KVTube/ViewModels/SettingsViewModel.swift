import Foundation
import Combine

public final class SettingsViewModel: ObservableObject {
    @Published public var serverTestStatus: String? = nil
    @Published public var isTestingConnection: Bool = false
    @Published public var serverTestSuccess: Bool? = nil
    @Published public var importExportStatus: String? = nil
    @Published public var exportedJson: String? = nil

    private let api: KVApi
    private let database: DatabaseManager

    public init(
        api: KVApi = .shared,
        database: DatabaseManager = .shared
    ) {
        self.api = api
        self.database = database
    }

    @MainActor
    public func testConnection(url: String) async {
        isTestingConnection = true
        serverTestStatus = "Probing connection..."
        serverTestSuccess = nil

        let result = await api.testServerConnection(url: url)
        self.serverTestSuccess = result.ok
        self.serverTestStatus = result.message
        self.isTestingConnection = false
    }

    public func exportSubscriptions() {
        let subs = database.subscriptions
        if let data = try? JSONEncoder().encode(subs),
           let json = String(data: data, encoding: .utf8) {
            self.exportedJson = json
            self.importExportStatus = "Exported \(subs.count) subscriptions."
        }
    }

    public func importSubscriptions(from jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let subs = try? JSONDecoder().decode([SubscriptionItem].self, from: data) else {
            self.importExportStatus = "Invalid JSON format."
            return
        }
        database.importSubscriptions(subs)
        self.importExportStatus = "Successfully imported \(subs.count) subscriptions."
    }

    public func clearCache() {
        URLCache.shared.removeAllCachedResponses()
    }
}
