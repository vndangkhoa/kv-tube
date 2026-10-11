import SwiftUI

public struct HomeView: View {
    @StateObject private var viewModel = HomeViewModel()
    @State private var isNotificationsPresented: Bool = false
    @State private var isSearchPresented: Bool = false
    @State private var selectedChannelId: String? = nil

    @EnvironmentObject private var playbackManager: PlaybackManager

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Top Custom Navigation Bar
                HStack(spacing: 8) {
                    // KV-Tube Logo & Name
                    HStack(spacing: 6) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Color.red)
                                .frame(width: 28, height: 20)
                            Image(systemName: "play.fill")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.white)
                        }
                        Text("KV-Tube")
                            .font(.system(size: 20, weight: .black, design: .rounded))
                            .tracking(-0.5)
                            .foregroundColor(.primary)
                    }

                    Spacer()

                    // Notifications Button (matching Android top bar)
                    Button {
                        isNotificationsPresented = true
                    } label: {
                        Image(systemName: "bell")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(.primary)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)

                    // Search Button
                    Button {
                        isSearchPresented = true
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(.primary)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(Color(UIColor.systemBackground))

                // Category Filter Pills
                CategoryPillsView(
                    selectedCategory: $viewModel.selectedCategory
                ) { category in
                    viewModel.selectCategory(category)
                }
                .background(Color(UIColor.systemBackground))

                Divider()

                // Content Feed
                ZStack {
                    if viewModel.videos.isEmpty && viewModel.isLoading {
                        VStack(spacing: 12) {
                            ProgressView()
                                .scaleEffect(1.2)
                            Text("Loading feed...")
                                .font(.system(size: 14))
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if viewModel.videos.isEmpty && viewModel.errorMessage != nil {
                        VStack(spacing: 16) {
                            Image(systemName: "wifi.exclamationmark")
                                .font(.system(size: 44))
                                .foregroundColor(.secondary)
                            Text(viewModel.errorMessage ?? "Failed to load feed")
                                .font(.system(size: 15, weight: .medium))
                                .multilineTextAlignment(.center)
                                .foregroundColor(.secondary)
                                .padding(.horizontal, 32)
                            Button {
                                Task {
                                    await viewModel.loadFeed(refresh: true)
                                }
                            } label: {
                                Text("Retry")
                                    .font(.system(size: 14, weight: .semibold))
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 10)
                                    .background(Color.primary)
                                    .foregroundColor(Color(UIColor.systemBackground))
                                    .cornerRadius(20)
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(viewModel.videos) { video in
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
                                    .onAppear {
                                        viewModel.loadMoreIfNeeded(currentItem: video)
                                    }
                                }

                                if viewModel.isLoading {
                                    ProgressView()
                                        .padding(.vertical, 16)
                                }
                            }
                            .padding(.top, 4)
                            .padding(.bottom, 64)
                        }
                        .refreshable {
                            await viewModel.loadFeed(refresh: true)
                        }
                    }
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(isPresented: $isSearchPresented) {
                SearchView()
            }
            .navigationDestination(item: $selectedChannelId) { channelId in
                ChannelView(channelId: channelId)
            }
            .sheet(isPresented: $isNotificationsPresented) {
                NavigationStack {
                    SubscriptionsView()
                }
            }
            .task {
                if viewModel.videos.isEmpty {
                    await viewModel.loadFeed(refresh: true)
                }
            }
        }
    }
}
