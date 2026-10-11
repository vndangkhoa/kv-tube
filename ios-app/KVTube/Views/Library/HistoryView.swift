import SwiftUI

public struct HistoryView: View {
    @StateObject private var viewModel = LibraryViewModel()
    @EnvironmentObject private var playbackManager: PlaybackManager
    @Environment(\.dismiss) private var dismiss
    @State private var showingClearAlert: Bool = false

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // Search within history bar
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                    .font(.system(size: 14))

                TextField("Search watch history", text: $viewModel.searchQuery)
                    .font(.system(size: 14))

                if !viewModel.searchQuery.isEmpty {
                    Button {
                        viewModel.searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                            .font(.system(size: 14))
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(UIColor.secondarySystemFill))
            .cornerRadius(10)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            Divider()

            if viewModel.allHistory.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 44))
                        .foregroundColor(.secondary)
                    Text("No watch history")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(viewModel.allHistory) { item in
                        Button {
                            playbackManager.play(video: item.asVideoData())
                        } label: {
                            HStack(spacing: 12) {
                                // Thumbnail with resume progress bar
                                ZStack(alignment: .bottom) {
                                    AsyncImage(url: URL(string: item.thumbnail)) { phase in
                                        if let img = phase.image {
                                            img.resizable().aspectRatio(16/9, contentMode: .fill)
                                        } else {
                                            Rectangle().fill(Color.gray.opacity(0.3)).aspectRatio(16/9, contentMode: .fit)
                                        }
                                    }
                                    .frame(width: 120, height: 68)
                                    .cornerRadius(6)
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
                                        .frame(width: 120, height: 68)
                                        .cornerRadius(6)
                                    }
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.title)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(.primary)
                                        .lineLimit(2)
                                        .multilineTextAlignment(.leading)

                                    Text(item.channelTitle)
                                        .font(.system(size: 12))
                                        .foregroundColor(.secondary)

                                    Text(item.duration)
                                        .font(.system(size: 11))
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                viewModel.removeHistoryItem(videoId: item.videoId)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Done") {
                    dismiss()
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(role: .destructive) {
                    showingClearAlert = true
                } label: {
                    Text("Clear")
                        .foregroundColor(.red)
                }
                .disabled(viewModel.allHistory.isEmpty)
            }
        }
        .alert("Clear Watch History?", isPresented: $showingClearAlert) {
            Button("Clear All", role: .destructive) {
                viewModel.clearAllHistory()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will remove all videos from your local watch history.")
        }
    }
}
