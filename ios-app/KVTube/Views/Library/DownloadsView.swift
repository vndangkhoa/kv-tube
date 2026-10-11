import SwiftUI

public struct DownloadsView: View {
    @StateObject private var viewModel = LibraryViewModel()
    @EnvironmentObject private var downloadManager: DownloadManager
    @EnvironmentObject private var playbackManager: PlaybackManager
    @Environment(\.dismiss) private var dismiss

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // Storage Usage Header Meter
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "internaldrive")
                        .foregroundColor(.secondary)
                    Text("Storage Usage")
                        .font(.system(size: 14, weight: .semibold))
                    Spacer()
                    Text(downloadManager.totalDiskUsageFormatted)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.blue)
                }

                // Storage Meter Bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color(UIColor.secondarySystemFill))
                            .frame(height: 6)

                        // Sample fraction representing offline videos footprint
                        Capsule()
                            .fill(Color.blue)
                            .frame(width: max(geo.size.width * 0.15, 12), height: 6)
                    }
                }
                .frame(height: 6)

                Text("\(viewModel.downloads.count) offline video\(viewModel.downloads.count == 1 ? "" : "s") saved")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
            .padding(14)
            .background(Color(UIColor.secondarySystemBackground).opacity(0.6))
            .cornerRadius(12)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            Divider()

            if viewModel.downloads.isEmpty && downloadManager.activeDownloads.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    Text("No downloaded videos")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Videos you save will appear here for offline playback.")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    // Active Downloads in Progress
                    if !downloadManager.activeDownloads.isEmpty {
                        Section("Downloading") {
                            ForEach(Array(downloadManager.activeDownloads.keys), id: \.self) { vidId in
                                if let progress = downloadManager.activeDownloads[vidId] {
                                    HStack {
                                        Image(systemName: "arrow.down.circle.fill")
                                            .foregroundColor(.blue)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text("Video \(vidId)")
                                                .font(.system(size: 13, weight: .medium))
                                            ProgressView(value: progress)
                                                .progressViewStyle(.linear)
                                        }
                                        Text("\(Int(progress * 100))%")
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    // Completed Downloads Section
                    Section("Saved Videos") {
                        ForEach(viewModel.downloads) { item in
                            Button {
                                playbackManager.playLocalFile(item: item)
                            } label: {
                                HStack(spacing: 12) {
                                    // Thumbnail
                                    AsyncImage(url: URL(string: item.thumbnail)) { phase in
                                        if let img = phase.image {
                                            img.resizable().aspectRatio(16/9, contentMode: .fill)
                                        } else {
                                            Rectangle().fill(Color.gray.opacity(0.3)).aspectRatio(16/9, contentMode: .fit)
                                        }
                                    }
                                    .frame(width: 110, height: 62)
                                    .cornerRadius(6)
                                    .clipped()

                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.title)
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundColor(.primary)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)

                                        Text(item.channelTitle)
                                            .font(.system(size: 12))
                                            .foregroundColor(.secondary)

                                        HStack(spacing: 6) {
                                            Text(item.quality)
                                                .font(.system(size: 10, weight: .bold))
                                                .padding(.horizontal, 4)
                                                .padding(.vertical, 1)
                                                .background(Color.blue.opacity(0.15))
                                                .foregroundColor(.blue)
                                                .cornerRadius(3)

                                            Text("•")
                                            Text(item.formattedFileSize)
                                                .font(.system(size: 11))
                                                .foregroundColor(.secondary)

                                            if !item.duration.isEmpty {
                                                Text("•")
                                                Text(item.duration)
                                                    .font(.system(size: 11))
                                                    .foregroundColor(.secondary)
                                            }
                                        }
                                    }

                                    Spacer()

                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.green)
                                        .font(.system(size: 16))
                                }
                            }
                            .buttonStyle(.plain)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    viewModel.removeDownload(videoId: item.videoId)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Downloads")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") {
                    dismiss()
                }
            }
        }
    }
}
