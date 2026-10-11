import SwiftUI

public struct SearchFilterSheet: View {
    @ObservedObject var viewModel: SearchViewModel
    @Environment(\.dismiss) private var dismiss

    public init(viewModel: SearchViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        NavigationStack {
            Form {
                // Type Filter
                Section("Result Type") {
                    Picker("Type", selection: $viewModel.searchType) {
                        ForEach(SearchType.allCases) { type in
                            Text(type.title).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // Sort By
                Section("Sort By") {
                    Picker("Sort", selection: $viewModel.sortBy) {
                        ForEach(SearchSortBy.allCases) { sort in
                            Text(sort.title).tag(sort)
                        }
                    }
                }

                // Upload Date
                Section("Upload Date") {
                    Picker("Date", selection: $viewModel.uploadDate) {
                        ForEach(SearchUploadDate.allCases) { date in
                            Text(date.title).tag(date)
                        }
                    }
                }

                // Duration
                Section("Duration") {
                    Picker("Duration", selection: $viewModel.duration) {
                        ForEach(SearchDuration.allCases) { dur in
                            Text(dur.title).tag(dur)
                        }
                    }
                }

                Section {
                    Button(role: .destructive) {
                        viewModel.resetFilters()
                    } label: {
                        HStack {
                            Spacer()
                            Text("Reset Filters")
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Search Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        dismiss()
                        Task {
                            await viewModel.performSearch()
                        }
                    }
                    .fontWeight(.bold)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
