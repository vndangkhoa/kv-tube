import SwiftUI

public struct LibraryView: View {
    @StateObject private var viewModel = LibraryViewModel()
    @EnvironmentObject private var playbackManager: PlaybackManager
    @State private var showingSettings: Bool = false

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Profile / Header Row matching Android LibraryScreen
                    HStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 56, height: 56)
                            Image(systemName: "person.fill")
                                .font(.system(size: 28))
                                .foregroundColor(.white)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text("KV-Tube User")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.primary)
                            Text("Connected to KV-Tube Server")
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                    Divider().padding(.horizontal, 16)

                    // 4 Action Cards matching Android LibraryScreen
                    VStack(spacing: 10) {
                        NavigationLink {
                            HistoryView()
                        } label: {
                            AccountActionCard(
                                icon: "clock.arrow.circlepath",
                                title: "History",
                                subtitle: viewModel.recentHistory.isEmpty ? "Videos you watch will appear here" : "\(viewModel.recentHistory.count) watched videos"
                            )
                        }
                        .buttonStyle(.plain)

                        NavigationLink {
                            SubscriptionsView()
                        } label: {
                            AccountActionCard(
                                icon: "bell.fill",
                                title: "Subscriptions",
                                subtitle: "Latest videos from your channels"
                            )
                        }
                        .buttonStyle(.plain)

                        NavigationLink {
                            DownloadsView()
                        } label: {
                            AccountActionCard(
                                icon: "arrow.down.circle.fill",
                                title: "Downloads",
                                subtitle: "\(viewModel.downloads.count) videos • \(viewModel.storageUsageText)"
                            )
                        }
                        .buttonStyle(.plain)

                        Button {
                            showingSettings = true
                        } label: {
                            AccountActionCard(
                                icon: "gearshape.fill",
                                title: "Settings",
                                subtitle: "Server, Invidious token, region, theme & updates"
                            )
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)

                    Divider().padding(.horizontal, 16)

                    // History Section
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.system(size: 16, weight: .bold))
                            Text("Recent History")
                                .font(.system(size: 18, weight: .bold))
                            Spacer()
                            NavigationLink {
                                HistoryView()
                            } label: {
                                Text("See all")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.blue)
                            }
                        }
                        .padding(.horizontal, 16)

                        if viewModel.recentHistory.isEmpty {
                            Text("No recently watched videos")
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                        } else {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(viewModel.recentHistory) { item in
                                        Button {
                                            playbackManager.play(video: item.asVideoData())
                                        } label: {
                                            VStack(alignment: .leading, spacing: 6) {
                                                // Thumbnail with resume progress bar
                                                ZStack(alignment: .bottom) {
                                                    AsyncImage(url: URL(string: item.thumbnail)) { phase in
                                                        if let img = phase.image {
                                                            img.resizable().aspectRatio(16/9, contentMode: .fill)
                                                        } else {
                                                            Rectangle().fill(Color.gray.opacity(0.3)).aspectRatio(16/9, contentMode: .fit)
                                                        }
                                                    }
                                                    .frame(width: 140, height: 80)
                                                    .cornerRadius(8)
                                                    .clipped()

                                                    // Resume Progress Bar
                                                    if item.progressFraction > 0.01 {
                                                        GeometryReader { geo in
                                                            VStack {
                                                                Spacer()
                                                                ZStack(alignment: .leading) {
                                                                    Rectangle()
                                                                        .fill(Color.black.opacity(0.5))
                                                                        .frame(height: 3)
                                                                    Rectangle()
                                                                        .fill(Color.red)
                                                                        .frame(width: geo.size.width * CGFloat(item.progressFraction), height: 3)
                                                                }
                                                            }
                                                        }
                                                        .frame(width: 140, height: 80)
                                                        .cornerRadius(8)
                                                    }
                                                }

                                                Text(item.title)
                                                    .font(.system(size: 12, weight: .medium))
                                                    .foregroundColor(.primary)
                                                    .lineLimit(2)
                                                    .multilineTextAlignment(.leading)
                                                    .frame(width: 140, alignment: .leading)

                                                Text(item.channelTitle)
                                                    .font(.system(size: 11))
                                                    .foregroundColor(.secondary)
                                                    .lineLimit(1)
                                                    .frame(width: 140, alignment: .leading)
                                            }
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                    }
                    .padding(.top, 8)

                    Divider().padding(.horizontal, 16)

                    // Quick Action Rows: Downloads & Settings
                    VStack(spacing: 4) {
                        NavigationLink {
                            DownloadsView()
                        } label: {
                            HStack(spacing: 16) {
                                ZStack {
                                    Circle()
                                        .fill(Color.blue.opacity(0.15))
                                        .frame(width: 38, height: 38)
                                    Image(systemName: "arrow.down.circle.fill")
                                        .foregroundColor(.blue)
                                        .font(.system(size: 20))
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Downloads")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.primary)
                                    Text("\(viewModel.downloads.count) videos • \(viewModel.storageUsageText)")
                                        .font(.system(size: 12))
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.secondary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                        }
                        .buttonStyle(.plain)
                    }

                    Divider().padding(.horizontal, 16)

                    // Liked Videos Section
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Image(systemName: "hand.thumbsup.fill")
                                .foregroundColor(.red)
                            Text("Liked Videos (\(viewModel.likedVideos.count))")
                                .font(.system(size: 18, weight: .bold))
                            Spacer()
                        }
                        .padding(.horizontal, 16)

                        if viewModel.likedVideos.isEmpty {
                            Text("Videos you like will appear here.")
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 16)
                        } else {
                            LazyVStack(spacing: 10) {
                                ForEach(viewModel.likedVideos) { video in
                                    VideoCardView(video: video) {
                                        playbackManager.play(video: video)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.bottom, 64)
            }
            .navigationTitle("Account")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .foregroundColor(.primary)
                    }
                }
            }
            .sheet(isPresented: $showingSettings) {
                NavigationStack {
                    SettingsView()
                }
            }
        }
    }
}

struct AccountActionCard: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color.gray.opacity(0.18))
                    .frame(width: 40, height: 40)
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(.primary)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.primary)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.gray.opacity(0.12))
        .cornerRadius(12)
    }
}
