import SwiftUI

public struct ContentView: View {
    @State private var selectedTab: Int = 1
    @EnvironmentObject private var playbackManager: PlaybackManager
    @EnvironmentObject private var settings: SettingsStore

    public init() {}

    public var body: some View {
        ZStack(alignment: .bottom) {
            // Main Tab View matching Android BottomNavBar: Shorts (0), Home (1), Account (2)
            TabView(selection: $selectedTab) {
                ShortsView()
                    .tabItem {
                        Label("Shorts", systemImage: "play.square.stack")
                    }
                    .tag(0)

                HomeView()
                    .tabItem {
                        Label("Home", systemImage: "house.fill")
                    }
                    .tag(1)

                LibraryView()
                    .tabItem {
                        Label("Account", systemImage: "person.fill")
                    }
                    .tag(2)
            }
            .accentColor(.primary)

            // Global Floating Mini Player (docked right above TabBar)
            if playbackManager.isMiniPlayerVisible && !playbackManager.isFullScreenPlayerPresented {
                MiniPlayerBar()
                    .padding(.bottom, 49) // Height of iOS standard TabBar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .fullScreenCover(isPresented: $playbackManager.isFullScreenPlayerPresented) {
            if let video = playbackManager.currentVideo {
                WatchView(videoId: video.videoId, initialVideo: video)
                    .preferredColorScheme(.dark)
            } else {
                WatchView()
                    .preferredColorScheme(.dark)
            }
        }
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                SettingsView()
            }
        }
        .sheet(item: Binding<SearchWrapper?>(
            get: { activeSearchQuery.map { SearchWrapper(query: $0) } },
            set: { activeSearchQuery = $0?.query }
        )) { wrapper in
            NavigationStack {
                SearchView(initialQuery: wrapper.query)
            }
        }
        .sheet(isPresented: $showingSubscriptions) {
            NavigationStack {
                SubscriptionsView()
            }
        }
        .sheet(isPresented: $showingDownloads) {
            NavigationStack {
                DownloadsView()
            }
        }
        .sheet(isPresented: $showingHistory) {
            NavigationStack {
                HistoryView()
            }
        }
        .sheet(item: Binding<ChannelWrapper?>(
            get: { activeChannelId.map { ChannelWrapper(id: $0) } },
            set: { activeChannelId = $0?.id }
        )) { wrapper in
            NavigationStack {
                ChannelView(channelId: wrapper.id)
            }
        }
        .onAppear {
            checkLaunchArguments()
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
    }

    @State private var showingSettings: Bool = false
    @State private var activeSearchQuery: String? = nil
    @State private var showingSubscriptions: Bool = false
    @State private var showingDownloads: Bool = false
    @State private var showingHistory: Bool = false
    @State private var activeChannelId: String? = nil

    private func checkLaunchArguments() {
        let args = CommandLine.arguments
        if let idx = args.firstIndex(of: "-tab"), idx + 1 < args.count {
            let tab = args[idx + 1].lowercased()
            if tab == "shorts" {
                selectedTab = 0
            } else if tab == "home" {
                selectedTab = 1
            } else if tab == "account" || tab == "library" {
                selectedTab = 2
            }
        }
        if args.contains("-settings") {
            showingSettings = true
        }
        if let idx = args.firstIndex(of: "-search") {
            if idx + 1 < args.count && !args[idx + 1].hasPrefix("-") {
                activeSearchQuery = args[idx + 1]
            } else {
                activeSearchQuery = ""
            }
        }
        if args.contains("-subscriptions") {
            showingSubscriptions = true
        }
        if args.contains("-downloads") {
            showingDownloads = true
        }
        if args.contains("-history") {
            showingHistory = true
        }
        if let idx = args.firstIndex(of: "-channel"), idx + 1 < args.count {
            activeChannelId = args[idx + 1]
        }
        if let idx = args.firstIndex(of: "-watch"), idx + 1 < args.count {
            let vid = args[idx + 1]
            let tempVideo = VideoData(videoId: vid, title: "Playing Video")
            playbackManager.play(video: tempVideo)
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "kvtube" else { return }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()

        if host == "shorts" || path.contains("shorts") {
            selectedTab = 0
        } else if host == "home" {
            selectedTab = 1
        } else if host == "account" || host == "library" || path.contains("account") {
            selectedTab = 2
        } else if host == "settings" {
            showingSettings = true
        } else if host == "search" || path.contains("search") {
            if let comps = URLComponents(url: url, resolvingAgainstBaseURL: true),
               let q = comps.queryItems?.first(where: { $0.name == "q" })?.value {
                activeSearchQuery = q
            } else {
                activeSearchQuery = ""
            }
        } else if host == "subscriptions" || path.contains("subscriptions") {
            showingSubscriptions = true
        } else if host == "downloads" || path.contains("downloads") {
            showingDownloads = true
        } else if host == "history" || path.contains("history") {
            showingHistory = true
        } else if host == "channel" || path.contains("channel") {
            if let comps = URLComponents(url: url, resolvingAgainstBaseURL: true),
               let cid = comps.queryItems?.first(where: { $0.name == "id" })?.value {
                activeChannelId = cid
            } else {
                let parts = path.components(separatedBy: "/").filter { !$0.isEmpty }
                if let cid = parts.last {
                    activeChannelId = cid
                }
            }
        } else if host == "watch" || path.contains("watch") {
            if let comps = URLComponents(url: url, resolvingAgainstBaseURL: true),
               let vid = comps.queryItems?.first(where: { $0.name == "v" || $0.name == "id" })?.value {
                let tempVideo = VideoData(videoId: vid, title: "Playing Video")
                playbackManager.play(video: tempVideo)
            }
        }
    }
}

private struct SearchWrapper: Identifiable {
    let id = UUID()
    let query: String
}

private struct ChannelWrapper: Identifiable {
    let id: String
}

#Preview {
    ContentView()
        .environmentObject(SettingsStore.shared)
        .environmentObject(KVApi.shared)
        .environmentObject(DatabaseManager.shared)
        .environmentObject(DownloadManager.shared)
        .environmentObject(PlaybackManager.shared)
}
