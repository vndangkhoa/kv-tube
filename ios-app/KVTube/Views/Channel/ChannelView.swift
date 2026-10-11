import SwiftUI

public struct ChannelView: View {
    public let channelId: String
    @StateObject private var viewModel = ChannelViewModel()
    @EnvironmentObject private var playbackManager: PlaybackManager
    @Environment(\.dismiss) private var dismiss

    public init(channelId: String) {
        self.channelId = channelId
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if viewModel.isLoading && viewModel.channel == nil {
                    ProgressView("Loading channel...")
                        .frame(maxWidth: .infinity, minHeight: 300)
                } else if let channel = viewModel.channel {
                    // Channel Banner Header
                    if !channel.bannerURL.isEmpty {
                        AsyncImage(url: URL(string: channel.bannerURL)) { phase in
                            if let img = phase.image {
                                img.resizable().aspectRatio(16/5, contentMode: .fill)
                            } else {
                                Rectangle().fill(Color.gray.opacity(0.2)).aspectRatio(16/5, contentMode: .fit)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .clipped()
                    }

                    // Avatar & Channel Header Details
                    VStack(alignment: .center, spacing: 10) {
                        ChannelAvatarView(avatarUrl: channel.avatarURL, name: channel.title, size: 76)
                            .offset(y: channel.bannerURL.isEmpty ? 0 : -20)
                            .padding(.bottom, channel.bannerURL.isEmpty ? 0 : -20)

                        Text(channel.title)
                            .font(.system(size: 20, weight: .bold))
                            .multilineTextAlignment(.center)

                        HStack(spacing: 6) {
                            Text(channel.formattedSubscribers)
                            Text("•")
                            Text("\(channel.videoCount > 0 ? "\(channel.videoCount)" : "\(viewModel.videos.count)") videos")
                        }
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)

                        if let desc = channel.description, !desc.isEmpty {
                            Text(desc)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)
                        }

                        // Subscribe / Unsubscribe Button
                        Button {
                            viewModel.toggleSubscription()
                        } label: {
                            Text(channel.isSubscribed ? "Subscribed" : "Subscribe")
                                .font(.system(size: 14, weight: .bold))
                                .frame(maxWidth: 220)
                                .padding(.vertical, 9)
                                .background(channel.isSubscribed ? Color(UIColor.secondarySystemFill) : Color.primary)
                                .foregroundColor(channel.isSubscribed ? .primary : Color(UIColor.systemBackground))
                                .cornerRadius(20)
                        }
                        .padding(.top, 4)
                    }
                    .padding(.top, 14)
                    .padding(.horizontal, 16)

                    // Segmented Picker Tabs
                    Picker("Tabs", selection: $viewModel.selectedTab) {
                        ForEach(ChannelTab.allCases) { tab in
                            Text(tab.rawValue).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 8)

                    // Tab Content
                    switch viewModel.selectedTab {
                    case .videos:
                        if viewModel.videos.isEmpty {
                            Text("No videos uploaded")
                                .foregroundColor(.secondary)
                                .padding(32)
                        } else {
                            LazyVStack(spacing: 12) {
                                ForEach(viewModel.videos) { video in
                                    VideoCardView(video: video) {
                                        playbackManager.play(video: video)
                                    }
                                }
                            }
                            .padding(.top, 6)
                        }

                    case .shorts:
                        if viewModel.shorts.isEmpty {
                            Text("No shorts uploaded")
                                .foregroundColor(.secondary)
                                .padding(32)
                        } else {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                ForEach(viewModel.shorts) { short in
                                    Button {
                                        playbackManager.play(video: short)
                                    } label: {
                                        ZStack(alignment: .bottomLeading) {
                                            AsyncImage(url: short.displayThumbnailUrl) { phase in
                                                if let img = phase.image {
                                                    img.resizable().aspectRatio(9/16, contentMode: .fill)
                                                } else {
                                                    Rectangle().fill(Color.gray.opacity(0.3)).aspectRatio(9/16, contentMode: .fit)
                                                }
                                            }
                                            .cornerRadius(8)
                                            .clipped()

                                            Text(short.formattedViews)
                                                .font(.system(size: 10, weight: .bold))
                                                .foregroundColor(.white)
                                                .padding(4)
                                                .background(Color.black.opacity(0.7))
                                                .cornerRadius(4)
                                                .padding(6)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.top, 6)
                        }

                    case .playlists:
                        if viewModel.playlists.isEmpty {
                            Text("No playlists available")
                                .foregroundColor(.secondary)
                                .padding(32)
                        } else {
                            LazyVStack(spacing: 12) {
                                ForEach(viewModel.playlists) { pl in
                                    HStack(spacing: 12) {
                                        AsyncImage(url: URL(string: pl.thumbnail)) { phase in
                                            if let img = phase.image {
                                                img.resizable().aspectRatio(16/9, contentMode: .fill)
                                            } else {
                                                Rectangle().fill(Color.gray.opacity(0.3))
                                            }
                                        }
                                        .frame(width: 120, height: 68)
                                        .cornerRadius(8)
                                        .clipped()

                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(pl.title)
                                                .font(.system(size: 14, weight: .semibold))
                                                .lineLimit(2)
                                            Text("\(pl.videoCount) videos")
                                                .font(.system(size: 12))
                                                .foregroundColor(.secondary)
                                        }
                                        Spacer()
                                    }
                                    .padding(.horizontal, 16)
                                }
                            }
                            .padding(.top, 6)
                        }

                    case .about:
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Description")
                                .font(.system(size: 16, weight: .bold))
                            let desc = channel.description ?? ""
                            Text(desc.isEmpty ? "No description provided." : desc)
                                .font(.system(size: 14))
                                .foregroundColor(.secondary)

                            Divider().padding(.vertical, 6)

                            Text("Channel Details")
                                .font(.system(size: 16, weight: .bold))

                            if !channel.joinedDate.isEmpty {
                                HStack {
                                    Image(systemName: "calendar")
                                        .foregroundColor(.secondary)
                                    Text("Joined \(channel.joinedDate)")
                                        .font(.system(size: 14))
                                }
                            }

                            if (channel.totalViews ?? 0) > 0 {
                                HStack {
                                    Image(systemName: "eye")
                                        .foregroundColor(.secondary)
                                    Text(channel.formattedTotalViews)
                                        .font(.system(size: 14))
                                }
                            }

                            HStack {
                                Image(systemName: "link")
                                    .foregroundColor(.secondary)
                                Text("https://youtube.com/channel/\(channel.id)")
                                    .font(.system(size: 13))
                                    .foregroundColor(.blue)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                    }
                }
            }
            .padding(.bottom, 64)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") {
                    dismiss()
                }
            }
        }
        .task {
            await viewModel.loadChannel(channelId: channelId)
        }
    }
}
