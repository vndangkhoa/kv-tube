//
//  ToastView.swift
//  KVTube
//
//  Created for KV-Tube iOS Native Client.
//

import SwiftUI

/// Elegant floating banner / pill notification for sponsor skip notices,
/// download statuses, and interaction feedback.
public struct ToastView: View {
    let message: String
    var iconName: String? = nil
    var iconColor: Color? = nil
    var actionTitle: String? = nil
    var onAction: (() -> Void)? = nil

    public init(
        message: String,
        iconName: String? = nil,
        iconColor: Color? = nil,
        actionTitle: String? = nil,
        onAction: (() -> Void)? = nil
    ) {
        self.message = message
        self.iconName = iconName
        self.iconColor = iconColor
        self.actionTitle = actionTitle
        self.onAction = onAction
    }

    public var body: some View {
        HStack(spacing: 10) {
            if let iconName = iconName {
                Image(systemName: iconName)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(iconColor ?? .white)
            }

            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(1)

            if let actionTitle = actionTitle, let onAction = onAction {
                Button(action: onAction) {
                    Text(actionTitle)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.yellow)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.white.opacity(0.15))
                        .clipShape(Capsule())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            Capsule()
                .fill(Color(white: 0.12, opacity: 0.92))
                .overlay(
                    Capsule()
                        .stroke(Color.white.opacity(0.18), lineWidth: 0.8)
                )
        )
        .shadow(color: Color.black.opacity(0.4), radius: 10, x: 0, y: 4)
    }
}

#Preview {
    VStack(spacing: 20) {
        ToastView(
            message: "Skipped Sponsor",
            iconName: "forward.fill",
            iconColor: Color(red: 0.0, green: 0.84, blue: 0.42),
            actionTitle: "Unskip",
            onAction: {}
        )
        ToastView(
            message: "Download started: 1080p",
            iconName: "arrow.down.circle.fill",
            iconColor: .blue
        )
    }
    .padding()
    .background(Color.black)
}
