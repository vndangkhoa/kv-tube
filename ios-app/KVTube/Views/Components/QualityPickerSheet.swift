//
//  QualityPickerSheet.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import SwiftUI

/// Bottom sheet modal allowing users to adjust video stream resolution and playback speed.
public struct QualityPickerSheet: View {
    @Environment(\.dismiss) private var dismiss

    let availableQualities: [StreamFormat]
    let selectedQuality: String
    let currentSpeed: Float

    let onSelectQuality: (StreamFormat) -> Void
    let onSelectSpeed: (Float) -> Void

    private let speeds: [Float] = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]

    public init(
        availableQualities: [StreamFormat],
        selectedQuality: String,
        currentSpeed: Float,
        onSelectQuality: @escaping (StreamFormat) -> Void,
        onSelectSpeed: @escaping (Float) -> Void
    ) {
        self.availableQualities = availableQualities
        self.selectedQuality = selectedQuality
        self.currentSpeed = currentSpeed
        self.onSelectQuality = onSelectQuality
        self.onSelectSpeed = onSelectSpeed
    }

    public var body: some View {
        NavigationView {
            List {
                // MARK: - Quality Section
                Section {
                    ForEach(deduplicatedQualities) { format in
                        Button(action: {
                            onSelectQuality(format)
                            dismiss()
                        }) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(format.displayLabel)
                                        .font(.system(size: 15, weight: .medium))
                                        .foregroundColor(.primary)

                                    if let vcodec = format.vcodec, !vcodec.isEmpty {
                                        Text("\(vcodec.uppercased()) • \(format.hasAudio ? "Video + Audio" : "Video")")
                                            .font(.system(size: 12))
                                            .foregroundColor(.secondary)
                                    }
                                }

                                Spacer()

                                if isQualitySelected(format) {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.red)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                    }
                } header: {
                    Label("Video Quality", systemImage: "gearshape.fill")
                        .font(.system(size: 13, weight: .semibold))
                }

                // MARK: - Playback Speed Section
                Section {
                    ForEach(speeds, id: \.self) { speed in
                        Button(action: {
                            onSelectSpeed(speed)
                            dismiss()
                        }) {
                            HStack {
                                Text(formatSpeedLabel(speed))
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundColor(.primary)

                                Spacer()

                                if abs(currentSpeed - speed) < 0.01 {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.red)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                    }
                } header: {
                    Label("Playback Speed", systemImage: "gauge.with.needle.fill")
                        .font(.system(size: 13, weight: .semibold))
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Playback Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.system(size: 15, weight: .semibold))
                }
            }
        }
    }

    private var deduplicatedQualities: [StreamFormat] {
        var seenHeights = Set<Int>()
        var result: [StreamFormat] = []
        for format in availableQualities.sorted(by: { $0.height > $1.height }) {
            if format.height > 0 && !seenHeights.contains(format.height) {
                seenHeights.insert(format.height)
                result.append(format)
            }
        }
        return result.isEmpty ? availableQualities : result
    }

    private func isQualitySelected(_ format: StreamFormat) -> Bool {
        return selectedQuality == format.shortLabel || selectedQuality == format.qualityLabel
    }

    private func formatSpeedLabel(_ speed: Float) -> String {
        if abs(speed - 1.0) < 0.01 {
            return "1.0x (Normal)"
        }
        return String(format: "%.2gx", speed)
    }
}
