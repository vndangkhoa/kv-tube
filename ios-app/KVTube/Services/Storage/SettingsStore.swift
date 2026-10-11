//
//  SettingsStore.swift
//  KVTube
//
//  Created for KV-Tube iOS native client.
//

import Foundation
import Combine

/// Manages application-wide user settings, preferences, and server configuration.
/// Persists values to UserDefaults and syncs with network services.
public class SettingsStore: ObservableObject {
    public static let shared = SettingsStore()

    // MARK: - Keys

    public enum Keys {
        public static let serverURL = "kv_server_url"
        public static let authToken = "kv_auth_token"
        public static let region = "kv_region"
        public static let defaultQuality = "kv_default_quality"
        public static let sponsorBlockEnabled = "kv_sponsorblock_enabled"
        public static let sponsorBlockCategories = "kv_sponsorblock_categories"
        public static let returnYouTubeDislikeEnabled = "kv_ryd_enabled"
        public static let themeMode = "kv_theme_mode"
        public static let audioOnlyMode = "kv_audio_only_mode"

        // Legacy compatibility keys
        public static let legacyBackendUrl = "kvtube_backend_url"
        public static let legacyToken = "kvtube_invidious_token"
    }

    // MARK: - Defaults

    public static let defaultServerURL = "http://127.0.0.1:7601"
    public static let defaultRegion = "VN"
    public static let defaultQualitySetting = "Auto"
    public static let defaultSponsorBlockCategories = ["sponsor", "intro", "outro", "selfpromo"]

    private let defaults: UserDefaults

    // MARK: - Published Properties

    @Published public var serverURL: String {
        didSet {
            defaults.set(serverURL, forKey: Keys.serverURL)
            KVApi.shared.setServerURL(serverURL)
        }
    }

    @Published public var authToken: String {
        didSet {
            defaults.set(authToken, forKey: Keys.authToken)
            KVApi.shared.setAuthToken(authToken)
        }
    }

    @Published public var region: String {
        didSet {
            defaults.set(region, forKey: Keys.region)
        }
    }

    @Published public var defaultQuality: String {
        didSet {
            defaults.set(defaultQuality, forKey: Keys.defaultQuality)
        }
    }

    @Published public var sponsorBlockEnabled: Bool {
        didSet {
            defaults.set(sponsorBlockEnabled, forKey: Keys.sponsorBlockEnabled)
        }
    }

    @Published public var sponsorBlockCategories: [String] {
        didSet {
            defaults.set(sponsorBlockCategories, forKey: Keys.sponsorBlockCategories)
        }
    }

    @Published public var returnYouTubeDislikeEnabled: Bool {
        didSet {
            defaults.set(returnYouTubeDislikeEnabled, forKey: Keys.returnYouTubeDislikeEnabled)
        }
    }

    @Published public var themeMode: String {
        didSet {
            defaults.set(themeMode, forKey: Keys.themeMode)
        }
    }

    @Published public var audioOnlyMode: Bool {
        didSet {
            defaults.set(audioOnlyMode, forKey: Keys.audioOnlyMode)
        }
    }

    @Published public var audioPreference: String {
        didSet {
            defaults.set(audioPreference, forKey: "kv_audio_pref")
        }
    }

    // MARK: - Compatibility Aliases

    public var invidiousToken: String {
        get { authToken }
        set { authToken = newValue }
    }

    public func cleanServerUrl() -> String {
        KVApi.normalizeUrl(serverURL)
    }

    // MARK: - Initialization

    public init(userDefaults: UserDefaults = .standard) {
        self.defaults = userDefaults

        // 1. serverURL
        let savedServerURL = userDefaults.string(forKey: Keys.serverURL)
            ?? userDefaults.string(forKey: Keys.legacyBackendUrl)
            ?? Self.defaultServerURL
        self.serverURL = savedServerURL

        // 2. authToken
        self.authToken = userDefaults.string(forKey: Keys.authToken)
            ?? userDefaults.string(forKey: Keys.legacyToken)
            ?? ""

        // 3. region
        self.region = userDefaults.string(forKey: Keys.region) ?? Self.defaultRegion

        // 4. defaultQuality
        self.defaultQuality = userDefaults.string(forKey: Keys.defaultQuality) ?? Self.defaultQualitySetting

        // 5. sponsorBlockEnabled
        if userDefaults.object(forKey: Keys.sponsorBlockEnabled) != nil {
            self.sponsorBlockEnabled = userDefaults.bool(forKey: Keys.sponsorBlockEnabled)
        } else {
            self.sponsorBlockEnabled = true
        }

        // 6. sponsorBlockCategories
        if let savedCategories = userDefaults.stringArray(forKey: Keys.sponsorBlockCategories) {
            self.sponsorBlockCategories = savedCategories
        } else {
            self.sponsorBlockCategories = Self.defaultSponsorBlockCategories
        }

        // 7. returnYouTubeDislikeEnabled
        if userDefaults.object(forKey: Keys.returnYouTubeDislikeEnabled) != nil {
            self.returnYouTubeDislikeEnabled = userDefaults.bool(forKey: Keys.returnYouTubeDislikeEnabled)
        } else {
            self.returnYouTubeDislikeEnabled = true
        }

        // 8. themeMode
        let savedTheme = userDefaults.string(forKey: Keys.themeMode)
        if savedTheme == nil || savedTheme == "system" {
            self.themeMode = "dark"
        } else {
            self.themeMode = savedTheme!
        }

        // 9. audioOnlyMode
        self.audioOnlyMode = userDefaults.bool(forKey: Keys.audioOnlyMode)

        // 10. audioPreference
        self.audioPreference = userDefaults.string(forKey: "kv_audio_pref") ?? "Auto"

        // Sync initial server credentials with KVApi shared client
        KVApi.shared.setServerURL(serverURL)
        KVApi.shared.setAuthToken(authToken)
    }

    // MARK: - SponsorBlock Category Helpers

    public func isCategoryEnabled(_ category: String) -> Bool {
        sponsorBlockCategories.contains(category.lowercased())
    }

    public func isSponsorCategoryEnabled(_ category: String) -> Bool {
        isCategoryEnabled(category)
    }

    public func setSponsorCategoryEnabled(_ category: String, enabled: Bool) {
        let cat = category.lowercased()
        if enabled && !sponsorBlockCategories.contains(cat) {
            sponsorBlockCategories.append(cat)
        } else if !enabled {
            sponsorBlockCategories.removeAll { $0 == cat }
        }
    }

    public func toggleCategory(_ category: String) {
        let cat = category.lowercased()
        if let idx = sponsorBlockCategories.firstIndex(of: cat) {
            sponsorBlockCategories.remove(at: idx)
        } else {
            sponsorBlockCategories.append(cat)
        }
    }

    public func toggleSponsorCategory(_ category: String) {
        toggleCategory(category)
    }

    // MARK: - Reset

    /// Restores all settings to default values.
    public func resetToDefaults() {
        serverURL = Self.defaultServerURL
        authToken = ""
        region = Self.defaultRegion
        defaultQuality = Self.defaultQualitySetting
        sponsorBlockEnabled = true
        sponsorBlockCategories = Self.defaultSponsorBlockCategories
        returnYouTubeDislikeEnabled = true
        themeMode = "dark"
        audioOnlyMode = false
    }
}

#if canImport(SwiftUI)
import SwiftUI

extension SettingsStore {
    public var colorScheme: ColorScheme? {
        switch themeMode.lowercased() {
        case "dark":
            return .dark
        case "light":
            return .light
        default:
            return nil
        }
    }
}
#endif
