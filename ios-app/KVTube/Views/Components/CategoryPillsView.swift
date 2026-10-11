import SwiftUI

public struct CategoryPillsView: View {
    public let categories: [String]
    @Binding public var selectedCategory: String
    public var onSelect: ((String) -> Void)? = nil

    public init(
        categories: [String] = [
            "All", "Trending", "Music", "Gaming", "News", "Sports",
            "Live", "Education", "Comedy", "Tech", "Food", "Travel",
            "Fashion", "Science"
        ],
        selectedCategory: Binding<String>,
        onSelect: ((String) -> Void)? = nil
    ) {
        self.categories = categories
        self._selectedCategory = selectedCategory
        self.onSelect = onSelect
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categories, id: \.self) { category in
                    let isSelected = (selectedCategory == category)
                    Button {
                        selectedCategory = category
                        onSelect?(category)
                    } label: {
                        Text(category)
                            .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(
                                isSelected
                                    ? Color.primary
                                    : Color(UIColor.secondarySystemFill)
                            )
                            .foregroundColor(
                                isSelected
                                    ? Color(UIColor.systemBackground)
                                    : Color.primary
                            )
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }
}

#Preview {
    CategoryPillsView(selectedCategory: .constant("All"))
}
