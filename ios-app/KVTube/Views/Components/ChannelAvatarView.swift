import SwiftUI

public struct ChannelAvatarView: View {
    public let avatarUrl: String?
    public let name: String
    public var size: CGFloat = 38

    public init(avatarUrl: String?, name: String, size: CGFloat = 38) {
        self.avatarUrl = avatarUrl
        self.name = name
        self.size = size
    }

    private var initials: String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if let first = trimmed.first {
            return String(first).uppercased()
        }
        return "K"
    }

    public var body: some View {
        Group {
            if let urlStr = avatarUrl, !urlStr.isEmpty, let url = URL(string: urlStr) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        fallbackAvatar
                    case .empty:
                        ZStack {
                            Circle().fill(Color.gray.opacity(0.3))
                            ProgressView()
                                .scaleEffect(0.6)
                        }
                    @unknown default:
                        fallbackAvatar
                    }
                }
            } else {
                fallbackAvatar
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(
            Circle()
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )
    }

    private var fallbackAvatar: some View {
        ZStack {
            LinearGradient(
                colors: [Color.red.opacity(0.85), Color.purple.opacity(0.85)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Text(initials)
                .font(.system(size: size * 0.42, weight: .bold))
                .foregroundColor(.white)
        }
    }
}

#Preview {
    HStack(spacing: 16) {
        ChannelAvatarView(avatarUrl: nil, name: "KV Tube", size: 40)
        ChannelAvatarView(avatarUrl: "https://yt3.ggpht.com/default", name: "Apple", size: 48)
    }
    .padding()
}
