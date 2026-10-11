import SwiftUI
import AVFoundation

@main
public struct KVTubeApp: App {
    @StateObject private var settings = SettingsStore.shared
    @StateObject private var api = KVApi.shared
    @StateObject private var database = DatabaseManager.shared
    @StateObject private var downloadManager = DownloadManager.shared
    @StateObject private var playbackManager = PlaybackManager.shared

    public init() {
        configureAudioSession()
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [.allowAirPlay, .duckOthers])
            try session.setActive(true)
        } catch {
            print("[KVTubeApp] Error setting up audio session: \(error)")
        }
    }

    public var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settings)
                .environmentObject(api)
                .environmentObject(database)
                .environmentObject(downloadManager)
                .environmentObject(playbackManager)
                .preferredColorScheme(settings.colorScheme)
        }
    }
}
