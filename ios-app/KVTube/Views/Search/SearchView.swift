import SwiftUI

public struct SearchView: View {
    @StateObject private var viewModel: SearchViewModel
    @EnvironmentObject private var database: DatabaseManager
    @EnvironmentObject private var playbackManager: PlaybackManager
    @Environment(\.dismiss) private var dismiss

    @State private var showingFilterSheet: Bool = false
    @State private var selectedChannelId: String? = nil
    @FocusState private var isSearchFocused: Bool
    private let initialQuery: String

    public init(initialQuery: String = "") {
        self.initialQuery = initialQuery
        let vm = SearchViewModel()
        if !initialQuery.isEmpty {
            vm.query = initialQuery
        }
        _viewModel = StateObject(wrappedValue: vm)
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Search Input Header Bar
            HStack(spacing: 10) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)
                }

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                        .font(.system(size: 14))

                    TextField("Search KV-Tube", text: $viewModel.query)
                        .focused($isSearchFocused)
                        .submitLabel(.search)
                        .onSubmit {
                            Task { await viewModel.performSearch() }
                        }

                    if !viewModel.query.isEmpty {
                        Button {
                            viewModel.query = ""
                            viewModel.isSearching = false
                            viewModel.results = []
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                                .font(.system(size: 14))
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(Color(UIColor.secondarySystemFill))
                .cornerRadius(20)

                // Filter Button with Active Dot
                Button {
                    showingFilterSheet = true
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.primary)
                            .frame(width: 32, height: 32)

                        if viewModel.hasActiveFilters {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 8, height: 8)
                                .offset(x: 2, y: 2)
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color(UIColor.systemBackground))

            Divider()

            // Body: Suggestions / History vs Search Results
            ZStack {
                if !viewModel.isSearching {
                    // Show suggestions when typing or recent search history
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            if !viewModel.suggestions.isEmpty {
                                // Live Autocomplete Suggestions
                                ForEach(viewModel.suggestions, id: \.self) { item in
                                    Button {
                                        viewModel.query = item
                                        isSearchFocused = false
                                        Task { await viewModel.performSearch() }
                                    } label: {
                                        HStack(spacing: 14) {
                                            Image(systemName: "magnifyingglass")
                                                .foregroundColor(.secondary)
                                                .font(.system(size: 14))
                                            Text(item)
                                                .font(.system(size: 15))
                                                .foregroundColor(.primary)
                                            Spacer()
                                            Image(systemName: "arrow.up.left")
                                                .foregroundColor(.secondary.opacity(0.6))
                                                .font(.system(size: 12))
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 12)
                                    }
                                    .buttonStyle(.plain)
                                    Divider().padding(.leading, 44)
                                }
                            } else if !database.searchHistory.isEmpty {
                                // Recent Search History
                                HStack {
                                    Text("Recent Searches")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.secondary)
                                    Spacer()
                                    Button("Clear") {
                                        database.clearSearchHistory()
                                    }
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(.red)
                                }
                                .padding(.horizontal, 16)
                                .padding(.top, 14)
                                .padding(.bottom, 6)

                                ForEach(database.searchHistory, id: \.self) { historyQuery in
                                    HStack {
                                        Button {
                                            viewModel.query = historyQuery
                                            isSearchFocused = false
                                            Task { await viewModel.performSearch() }
                                        } label: {
                                            HStack(spacing: 14) {
                                                Image(systemName: "clock.arrow.circlepath")
                                                    .foregroundColor(.secondary)
                                                    .font(.system(size: 14))
                                                Text(historyQuery)
                                                    .font(.system(size: 15))
                                                    .foregroundColor(.primary)
                                                Spacer()
                                            }
                                        }
                                        .buttonStyle(.plain)

                                        Button {
                                            database.removeSearchQuery(historyQuery)
                                        } label: {
                                            Image(systemName: "xmark")
                                                .font(.system(size: 12))
                                                .foregroundColor(.secondary)
                                                .padding(8)
                                        }
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                }
                            }
                        }
                    }
                } else {
                    // Search Results List
                    if viewModel.isLoading && viewModel.results.isEmpty {
                        ProgressView("Searching...")
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if viewModel.results.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 40))
                                .foregroundColor(.secondary)
                            Text("No results found for \"\(viewModel.query)\"")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(viewModel.results) { item in
                                    switch item {
                                    case .video(let video):
                                        VideoCardView(
                                            video: video,
                                            onSelect: {
                                                playbackManager.play(video: video)
                                            },
                                            onSelectChannel: {
                                                if !video.channelId.isEmpty {
                                                    selectedChannelId = video.channelId
                                                }
                                            }
                                        )

                                    case .channel(let channel):
                                        ChannelSearchResultCard(channel: channel) {
                                            selectedChannelId = channel.id
                                        }

                                    case .playlist(let playlist):
                                        PlaylistSearchResultCard(playlist: playlist)
                                    }
                                }

                                if viewModel.isLoading {
                                    ProgressView()
                                        .padding(.vertical, 16)
                                }
                            }
                            .padding(.top, 8)
                            .padding(.bottom, 64)
                        }
                    }
                }
            }
        }
        .navigationBarHidden(true)
        .sheet(isPresented: $showingFilterSheet) {
            SearchFilterSheet(viewModel: viewModel)
        }
        .navigationDestination(item: $selectedChannelId) { channelId in
            ChannelView(channelId: channelId)
        }
        .onAppear {
            if !initialQuery.isEmpty {
                viewModel.query = initialQuery
                Task { await viewModel.performSearch() }
            }
        }
    }
}

// MARK: - Channel Result Card
private struct ChannelSearchResultCard: View {
    let channel: ChannelInfo
    let onSelect: () -> Void
    @EnvironmentObject private var database: DatabaseManager

    var body: some View {
        HStack(spacing: 14) {
            ChannelAvatarView(avatarUrl: channel.avatarURL, name: channel.title, size: 54)

            VStack(alignment: .leading, spacing: 3) {
                Text(channel.title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.primary)
                Text(channel.formattedSubscribers)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                if let desc = channel.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer()

            let isSub = database.isSubscribed(channelId: channel.id)
            Button {
                database.toggleSubscription(channel: channel)
            } label: {
                Text(isSub ? "Subscribed" : "Subscribe")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(isSub ? Color(UIColor.secondarySystemFill) : Color.primary)
                    .foregroundColor(isSub ? .primary : Color(UIColor.systemBackground))
                    .cornerRadius(16)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .onTapGesture(perform: onSelect)
    }
}

// MARK: - Playlist Result Card
private struct PlaylistSearchResultCard: View {
    let playlist: PlaylistData

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                AsyncImage(url: URL(string: playlist.thumbnail)) { phase in
                    if let img = phase.image {
                        img.resizable().aspectRatio(16/9, contentMode: .fill)
                    } else {
                        Rectangle().fill(Color.gray.opacity(0.3))
                    }
                }
                .frame(width: 140, height: 80)
                .cornerRadius(8)
                .clipped()

                // Playlist badge overlay
                HStack(spacing: 4) {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 10))
                    Text("\(playlist.videoCount)")
                        .font(.system(size: 10, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color.black.opacity(0.8))
                .cornerRadius(4)
                .padding(4)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(playlist.title)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(2)
                    .foregroundColor(.primary)

                Text(playlist.author)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)

                Text("Playlist • \(playlist.videoCount) videos")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }
}
