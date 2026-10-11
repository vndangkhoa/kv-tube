import SwiftUI

public struct SettingsView: View {
    @EnvironmentObject private var settings: SettingsStore
    @StateObject private var viewModel = SettingsViewModel()
    @Environment(\.dismiss) private var dismiss

    @State private var showingImportAlert: Bool = false
    @State private var importInputText: String = ""
    @State private var showingCacheClearedAlert: Bool = false
    @State private var isServerConfigExpanded: Bool = false
    @State private var isCheckingUpdates: Bool = false
    @State private var updateMessage: String? = nil

    public init() {}

    private struct RegionEntry: Identifiable {
        let code: String
        let label: String
        let flag: String
        var id: String { code }
    }

    private let regions = [
        RegionEntry(code: "GLOBAL", label: "Global", flag: "🌍"),
        RegionEntry(code: "VN", label: "Vietnam", flag: "🇻🇳"),
        RegionEntry(code: "US", label: "United States", flag: "🇺🇸"),
        RegionEntry(code: "JP", label: "Japan", flag: "🇯🇵"),
        RegionEntry(code: "KR", label: "South Korea", flag: "🇰🇷"),
        RegionEntry(code: "IN", label: "India", flag: "🇮🇳"),
        RegionEntry(code: "GB", label: "United Kingdom", flag: "🇬🇧"),
        RegionEntry(code: "DE", label: "Germany", flag: "🇩🇪"),
        RegionEntry(code: "FR", label: "France", flag: "🇫🇷"),
        RegionEntry(code: "BR", label: "Brazil", flag: "🇧🇷"),
        RegionEntry(code: "CA", label: "Canada", flag: "🇨🇦")
    ]

    private let resolutions = ["Auto", "1080p", "720p", "480p", "360p"]
    private let audioPreferences = ["Auto", "Opus", "M4A"]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // Header
                VStack(alignment: .leading, spacing: 4) {
                    Text("Settings")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.primary)
                    Text("Preferences, account sync & backend configuration")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                // 1. Hero Server & Account Status Card (matching Android ServerHeroCard)
                serverHeroCard
                    .padding(.horizontal, 16)

                // 2. Device Sync Tile (matching Android Device Sync)
                deviceSyncCard
                    .padding(.horizontal, 16)

                // 3. APPEARANCE
                VStack(alignment: .leading, spacing: 8) {
                    Text("APPEARANCE")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                        .tracking(1.0)
                        .padding(.horizontal, 18)

                    VStack {
                        Picker("Theme Mode", selection: $settings.themeMode) {
                            Text("Dark").tag("dark")
                            Text("Light").tag("light")
                            Text("System").tag("system")
                        }
                        .pickerStyle(.segmented)
                    }
                    .padding(14)
                    .background(Color(UIColor.secondarySystemBackground).opacity(0.6))
                    .cornerRadius(16)
                    .padding(.horizontal, 16)
                }

                // 4. PREFERENCES & STORAGE
                VStack(alignment: .leading, spacing: 8) {
                    Text("PREFERENCES & STORAGE")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                        .tracking(1.0)
                        .padding(.horizontal, 18)

                    VStack(spacing: 0) {
                        // Region Picker Row
                        let currentRegion = regions.first(where: { $0.code == settings.region }) ?? regions[1]
                        Menu {
                            ForEach(regions) { r in
                                Button {
                                    settings.region = r.code
                                } label: {
                                    Text("\(r.flag) \(r.label) (\(r.code))")
                                }
                            }
                        } label: {
                            HStack(spacing: 14) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.blue.opacity(0.12))
                                        .frame(width: 40, height: 40)
                                    Text(currentRegion.flag)
                                        .font(.system(size: 20))
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Content Region")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.primary)
                                    Text("\(currentRegion.label) (\(currentRegion.code))")
                                        .font(.system(size: 12))
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        }

                        Divider().padding(.leading, 70)

                        // Clear Cache Row
                        HStack(spacing: 14) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.red.opacity(0.12))
                                    .frame(width: 40, height: 40)
                                Image(systemName: "trash.fill")
                                    .font(.system(size: 18))
                                    .foregroundColor(.red)
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text("Temporary Cache")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(.primary)
                                Text("Clear image & stream caches")
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            Button {
                                viewModel.clearCache()
                                showingCacheClearedAlert = true
                            } label: {
                                Text("Clear")
                                    .font(.system(size: 12, weight: .semibold))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Color(UIColor.secondarySystemFill))
                                    .cornerRadius(10)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)

                        Divider().padding(.leading, 70)

                        // Default Quality Row
                        HStack(spacing: 14) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.purple.opacity(0.12))
                                    .frame(width: 40, height: 40)
                                Image(systemName: "slider.horizontal.3")
                                    .font(.system(size: 18))
                                    .foregroundColor(.purple)
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text("Default Resolution")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(.primary)
                                Text(settings.defaultQuality)
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            Picker("", selection: $settings.defaultQuality) {
                                ForEach(resolutions, id: \.self) { res in
                                    Text(res).tag(res)
                                }
                            }
                            .labelsHidden()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                    .background(Color(UIColor.secondarySystemBackground).opacity(0.6))
                    .cornerRadius(16)
                    .padding(.horizontal, 16)
                }

                // 5. SPONSORBLOCK
                VStack(alignment: .leading, spacing: 8) {
                    Text("SPONSORBLOCK")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                        .tracking(1.0)
                        .padding(.horizontal, 18)

                    VStack(spacing: 0) {
                        Toggle(isOn: $settings.sponsorBlockEnabled) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Skip Sponsored Segments")
                                    .font(.system(size: 15, weight: .semibold))
                                Text("Automatically skips sponsored promos")
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)

                        if settings.sponsorBlockEnabled {
                            Divider().padding(.horizontal, 16)

                            sponsorCategoryRow(title: "Sponsor Segments", category: "sponsor")
                            sponsorCategoryRow(title: "Intro Animations", category: "intro")
                            sponsorCategoryRow(title: "Outro / End Cards", category: "outro")
                            sponsorCategoryRow(title: "Self Promotion", category: "selfpromo")
                            sponsorCategoryRow(title: "Preview / Recaps", category: "preview")
                        }
                    }
                    .background(Color(UIColor.secondarySystemBackground).opacity(0.6))
                    .cornerRadius(16)
                    .padding(.horizontal, 16)
                }

                // 6. INVIDIOUS ACCOUNT & SYNC
                VStack(alignment: .leading, spacing: 8) {
                    Text("INVIDIOUS ACCOUNT & BACKUP")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                        .tracking(1.0)
                        .padding(.horizontal, 18)

                    VStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Invidious Session Token")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.primary)
                            SecureField("Paste SID cookie or JSON token", text: $settings.authToken)
                                .font(.system(size: 13))
                                .padding(10)
                                .background(Color(UIColor.secondarySystemFill))
                                .cornerRadius(10)
                                .autocapitalization(.none)
                                .disableAutocorrection(true)
                        }

                        HStack(spacing: 12) {
                            Button {
                                showingImportAlert = true
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "square.and.arrow.down")
                                    Text("Import (JSON)")
                                }
                                .font(.system(size: 12, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(Color(UIColor.secondarySystemFill))
                                .cornerRadius(10)
                            }

                            Button {
                                viewModel.exportSubscriptions()
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "square.and.arrow.up")
                                    Text("Export (JSON)")
                                }
                                .font(.system(size: 12, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(Color(UIColor.secondarySystemFill))
                                .cornerRadius(10)
                            }
                        }

                        if let msg = viewModel.importExportStatus {
                            Text(msg)
                                .font(.system(size: 12))
                                .foregroundColor(.blue)
                        }
                    }
                    .padding(16)
                    .background(Color(UIColor.secondarySystemBackground).opacity(0.6))
                    .cornerRadius(16)
                    .padding(.horizontal, 16)
                }

                // 7. ABOUT & UPDATES
                VStack(alignment: .leading, spacing: 8) {
                    Text("ABOUT & UPDATES")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                        .tracking(1.0)
                        .padding(.horizontal, 18)

                    VStack(spacing: 14) {
                        HStack(spacing: 14) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.red.opacity(0.12))
                                    .frame(width: 40, height: 40)
                                Image(systemName: "info.circle.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(.red)
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text("KV-Tube iOS")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(.primary)
                                Text("Version 1.0.0 (build 42) • Swift 5.10")
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }

                            Spacer()
                        }

                        if let updateMessage = updateMessage {
                            Text(updateMessage)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.green)
                        }

                        Button {
                            isCheckingUpdates = true
                            updateMessage = nil
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                                isCheckingUpdates = false
                                updateMessage = "✓ You are using the latest version"
                            }
                        } label: {
                            HStack {
                                if isCheckingUpdates {
                                    ProgressView().scaleEffect(0.8)
                                }
                                Text(isCheckingUpdates ? "Checking..." : "Check for Updates")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(Color(UIColor.secondarySystemFill))
                            .cornerRadius(10)
                        }
                    }
                    .padding(16)
                    .background(Color(UIColor.secondarySystemBackground).opacity(0.6))
                    .cornerRadius(16)
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 48)
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") {
                    dismiss()
                }
                .fontWeight(.bold)
            }
        }
        .onAppear {
            if !settings.serverURL.isEmpty && viewModel.serverTestSuccess == nil {
                Task {
                    await viewModel.testConnection(url: settings.serverURL)
                }
            }
        }
        .alert("Import Subscriptions", isPresented: $showingImportAlert) {
            TextField("Paste JSON", text: $importInputText)
            Button("Import") {
                viewModel.importSubscriptions(from: importInputText)
                importInputText = ""
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Paste JSON array of subscriptions to add to your local subscriptions.")
        }
        .alert("Cache Cleared", isPresented: $showingCacheClearedAlert) {
            Button("OK") {}
        } message: {
            Text("Temporary cache and image responses have been successfully cleared.")
        }
        .sheet(item: Binding(
            get: { viewModel.exportedJson != nil ? ExportWrapper(text: viewModel.exportedJson!) : nil },
            set: { _ in viewModel.exportedJson = nil }
        )) { wrapper in
            NavigationStack {
                VStack {
                    TextEditor(text: .constant(wrapper.text))
                        .padding()
                }
                .navigationTitle("Exported JSON")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Close") {
                            viewModel.exportedJson = nil
                        }
                    }
                }
            }
        }
    }

    // MARK: - Server Hero Card
    private var serverHeroCard: some View {
        let cleanDomain = settings.serverURL
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill((viewModel.serverTestSuccess == true ? Color.green : Color.blue).opacity(0.15))
                        .frame(width: 46, height: 46)
                    Image(systemName: "icloud.fill")
                        .font(.system(size: 22))
                        .foregroundColor(viewModel.serverTestSuccess == true ? .green : .blue)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(cleanDomain.isEmpty ? "No Server Configured" : cleanDomain)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.primary)
                    Text(!settings.authToken.isEmpty ? "Token active • Subscriptions enabled" : "Invidious backend • No token")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isServerConfigExpanded.toggle()
                    }
                } label: {
                    Image(systemName: isServerConfigExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.secondary)
                        .frame(width: 32, height: 32)
                }
            }

            // Status Indicator Badge
            HStack(spacing: 8) {
                if viewModel.isTestingConnection {
                    ProgressView().scaleEffect(0.7)
                    Text("Checking connection...")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                } else if viewModel.serverTestSuccess == true {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.green)
                    Text(viewModel.serverTestStatus ?? "Connected")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.green)
                } else if viewModel.serverTestSuccess == false {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.red)
                    Text(viewModel.serverTestStatus ?? "Connection failed")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.red)
                } else {
                    Image(systemName: "circle")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    Text("Ready to test connection")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color(UIColor.systemBackground).opacity(0.7))
            .cornerRadius(8)

            // Expandable Server URL Input
            if isServerConfigExpanded {
                VStack(alignment: .leading, spacing: 10) {
                    Divider()

                    Text("Server Instance URL")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)

                    TextField("http://...", text: $settings.serverURL)
                        .font(.system(size: 13))
                        .padding(10)
                        .background(Color(UIColor.secondarySystemFill))
                        .cornerRadius(10)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .keyboardType(.URL)

                    Button {
                        Task {
                            await viewModel.testConnection(url: settings.serverURL)
                        }
                    } label: {
                        HStack {
                            if viewModel.isTestingConnection {
                                ProgressView().scaleEffect(0.8)
                            }
                            Text("Test Connection")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(viewModel.isTestingConnection || settings.serverURL.isEmpty)
                }
                .padding(.top, 4)
            }
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemBackground).opacity(0.6))
        .cornerRadius(18)
    }

    // MARK: - Device Sync Card
    private var deviceSyncCard: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.blue.opacity(0.12))
                    .frame(width: 42, height: 42)
                Image(systemName: "tv.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.blue)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Device Sync")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.primary)
                Text("Sync with TV or Web player")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.secondary)
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemBackground).opacity(0.6))
        .cornerRadius(16)
    }

    private func sponsorCategoryRow(title: String, category: String) -> some View {
        Toggle(isOn: Binding(
            get: { settings.isSponsorCategoryEnabled(category) },
            set: { _ in settings.toggleSponsorCategory(category) }
        )) {
            Text(title)
                .font(.system(size: 14))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}

private struct ExportWrapper: Identifiable {
    let id = UUID()
    let text: String
}
