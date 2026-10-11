import SwiftUI

public struct SubscriptionsView: View {
    @StateObject private var viewModel = SubscriptionsViewModel()
    @EnvironmentObject private var playbackManager: PlaybackManager
    @State private var navigateToChannelId: String? = nil
    @State private var showingSettings: Bool = false

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Top Header Bar
                HStack {
                    Text("Subscriptions")
                        .font(.system(size: 22, weight: .bold))
                    Spacer()
                    Button {
                        Task { await viewModel.loadSubscriptionsAndFeed() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.primary)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color(UIColor.systemBackground))

                Divider()

                if viewModel.subscriptions.isEmpty && !viewModel.isLoading {
                    // Empty State
                    VStack(spacing: 20) {
                        Image(systemName: "bell.slash")
                            .font(.system(size: 52))
                            .foregroundColor(.secondary)

                        Text("Don't miss new videos")
                            .font(.system(size: 18, weight: .bold))

                        Text("Subscribe to your favorite channels to see their latest uploads here. You can also import your existing Invidious or YouTube subscriptions in Settings.")
                            .font(.system(size: 14))
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)

                        Button {
                            showingSettings = true
                        } label: {
                            Text("Configure Account / Token")
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
                    // Horizontal Avatars Row
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 16) {
                            // "All" pill button
                            Button {
                                viewModel.selectedChannelId = nil
                            } label: {
                                VStack(spacing: 6) {
                                    ZStack {
                                        Circle()
                                            .fill(viewModel.selectedChannelId == nil ? Color.primary : Color(UIColor.secondarySystemFill))
                                            .frame(width: 52, height: 52)
                                        Image(systemName: "square.grid.2x2.fill")
                                            .font(.system(size: 20))
                                            .foregroundColor(viewModel.selectedChannelId == nil ? Color(UIColor.systemBackground) : .primary)
                                    }
                                    Text("All")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(viewModel.selectedChannelId == nil ? .primary : .secondary)
                                }
                            }
                            .buttonStyle(.plain)

                            ForEach(viewModel.subscriptions) { sub in
                                Button {
                                    if viewModel.selectedChannelId == sub.channelId {
                                        navigateToChannelId = sub.channelId
                                    } else {
                                        viewModel.selectedChannelId = sub.channelId
                                    }
                                } label: {
                                    VStack(spacing: 6) {
                                        ZStack(alignment: .bottomTrailing) {
                                            ChannelAvatarView(avatarUrl: sub.channelAvatar, name: sub.channelTitle, size: 52)
                                                .overlay(
                                                    Circle()
                                                        .stroke(viewModel.selectedChannelId == sub.channelId ? Color.blue : Color.clear, lineWidth: 2.5)
                                                )

                                            // Notification dot
                                            if sub.hasNewVideos {
                                                Circle()
                                                    .fill(Color.blue)
                                                    .frame(width: 12, height: 12)
                                                    .overlay(Circle().stroke(Color(UIColor.systemBackground), lineWidth: 2))
                                            }
                                        }

                                        Text(sub.channelTitle)
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundColor(.primary)
                                            .frame(width: 62)
                                            .lineLimit(1)
                                    }
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    Button("View Channel") {
                                        navigateToChannelId = sub.channelId
                                    }
                                    Button(role: .destructive) {
                                        DatabaseManager.shared.unsubscribe(channelId: sub.channelId)
                                        Task { await viewModel.loadSubscriptionsAndFeed() }
                                    } label: {
                                        Label("Unsubscribe", systemImage: "bell.slash")
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                    .background(Color(UIColor.secondarySystemBackground).opacity(0.4))

                    Divider()

                    // Chronological Feed
                    if viewModel.isLoading && viewModel.feedVideos.isEmpty {
                        ProgressView("Loading subscriptions feed...")
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if viewModel.displayedVideos.isEmpty {
                        Text("No recent videos from these channels")
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(viewModel.displayedVideos) { video in
                                    VideoCardView(
                                        video: video,
                                        onSelect: {
                                            playbackManager.play(video: video)
                                        },
                                        onSelectChannel: {
                                            navigateToChannelId = video.channelId
                                        }
                                    )
                                }
                            }
                            .padding(.top, 8)
                            .padding(.bottom, 64)
                        }
                        .refreshable {
                            await viewModel.loadSubscriptionsAndFeed()
                        }
                    }
                }
            }
            .navigationBarHidden(true)
            .navigationDestination(item: $navigateToChannelId) { cid in
                ChannelView(channelId: cid)
            }
            .sheet(isPresented: $showingSettings) {
                NavigationStack {
                    SettingsView()
                }
            }
            .task {
                await viewModel.loadSubscriptionsAndFeed()
            }
        }
    }
}
