# KV-Tube iOS Application

Modern, private, ad-free YouTube streaming client for iOS and iPadOS (iOS 17.0+), built with Swift and SwiftUI. Connects directly to self-hosted Invidious instances (such as on a Synology NAS or VPS) and public Invidious instances with built-in SponsorBlock skipping and background audio playback.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Project Configuration](#project-configuration)
3. [Building on macOS](#building-on-macos)
4. [Linux Development & Virtualization Harness (Docker-OSX)](#linux-development--virtualization-harness-docker-osx)
5. [Headless Unit Testing on Linux (Swift Docker)](#headless-unit-testing-on-linux-swift-docker)
6. [CI/CD Pipeline (GitHub Actions)](#cicd-pipeline-github-actions)
7. [Cloud Device Testing with Appetize.io](#cloud-device-testing-with-appetizeio)
8. [Directory Structure](#directory-structure)

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │              SwiftUI Views              │
                      │  (Home, Watch, Channel, Settings, etc.) │
                      └────────────────────┬────────────────────┘
                                           │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │               ViewModels                │
                      │       (@Observable / Combine)           │
                      └────────────────────┬────────────────────┘
                                           │
                      ┌────────────────────┴────────────────────┐
                      ▼                                         ▼
        ┌───────────────────────────┐             ┌───────────────────────────┐
        │      Playback Service     │             │        KVApi Client       │
        │  - AVPlayer & AudioSession│             │  - Invidious /api/v1      │
        │  - Background Lock Screen │             │  - URL Normalization      │
        │  - SponsorBlock Auto-Skip │             │  - Token Authentication   │
        └───────────────────────────┘             └───────────────────────────┘
```

- **Invidious-Direct Connectivity:** Operates directly against Invidious instances without requiring the legacy Go backend.
- **Smart URL Normalization:** Automatically upgrades public HTTP addresses to HTTPS while preserving raw HTTP for local LAN / private IP subnets (e.g., Synology NAS on `http://192.168.x.x`, `http://localhost`, or custom port bindings like `:7601`).
- **Flexible Authentication:** Supports both base64 JSON tokens (`Authorization: Bearer <json>`) generated from Invidious Preferences and raw SID cookie tokens (`Cookie: SID=<token>`).
- **SponsorBlock Integration:** Automatically skips sponsor, self-promotion, and interaction segments via crowdsourced SponsorBlock timestamps, with configurable category filtering.
- **Background Audio & Lock Screen:** Configured with `AVAudioSessionCategoryPlayback` and `UIBackgroundModes: ["audio"]` for continuous background listening and Control Center / Lock Screen playback controls.

---

## Project Configuration

### Requirements
- **iOS Deployment Target:** iOS 17.0+ (iPhone & iPad)
- **Swift Version:** Swift 5.10 / Swift 6.0
- **Xcode Version:** Xcode 15.4 or Xcode 16.0+

### Key Configuration Files
| File | Description |
| :--- | :--- |
| `KVTube.xcodeproj/project.pbxproj` | Xcode project defining `KVTube` (app) and `KVTubeTests` (test bundle). |
| `KVTube/Config/Info.plist` | Configures `UIBackgroundModes: [audio]`, ATS local network allowances, and orientations. |
| `KVTube/Config/KVTube.entitlements` | Entitlements for local multicast network discovery and outbound sockets. |
| `KVTube/Assets.xcassets` | Asset catalog with universal app icon and YouTube red brand accent color. |
| `Package.swift` | Swift Package Manager manifest enabling headless test execution on Linux. |

---

## Building on macOS

### 1. Open in Xcode GUI
```bash
cd ios-app
open KVTube.xcodeproj
```
Select the **KVTube** scheme and choose any simulator (e.g., **iPhone 15 Pro**), then press **Cmd + R** to run or **Cmd + U** to execute unit tests.

### 2. Command-Line Simulator Build
Run the provided simulator build script:
```bash
./scripts/build-simulator.sh
```
This builds the release simulator `.app` bundle and generates `build/KVTube-Simulator.zip`.

To install and run directly on a booted iOS Simulator:
```bash
# Boot an iPhone 15 simulator
xcrun simctl boot "iPhone 15" || true

# Install the app bundle
xcrun simctl install booted build/DerivedData/Build/Products/Release-iphonesimulator/KVTube.app

# Launch the app
xcrun simctl launch booted com.kvtube.ios
```

---

## Linux Development & Virtualization Harness (Docker-OSX)

On Ubuntu Linux (specifically tuned for this 6-core/12-thread Intel i5-12400F machine with 64GB RAM), you can run a full macOS Sonoma virtual machine with hardware acceleration via KVM.

### 1. Verification & Launch
Run the automated Docker-OSX harness:
```bash
cd ios-app
chmod +x scripts/*.sh

# Run with VNC display (default, allocates 16GB RAM and 6 CPU cores)
./scripts/setup-docker-osx.sh --display vnc

# Or run with direct X11 window forwarding:
./scripts/setup-docker-osx.sh --display x11

# Dry-run to verify hardware acceleration and parameters:
./scripts/setup-docker-osx.sh --dry-run
```

### 2. Connecting to the macOS VM
- **VNC Client:** Connect to `localhost:5999` using TigerVNC, Remmina, or any VNC client:
  ```bash
  vncviewer localhost:5999
  ```
- **SSH Terminal:** Connect via SSH on port 50922:
  ```bash
  ssh -p 50922 user@localhost
  # Default password: alpine
  ```

### 3. Accessing the Shared Codebase
The host directory `/mnt/data/Package Center/kv-tube/ios-app` is automatically shared into the VM at `/shared`.

Inside the macOS terminal or desktop:
```bash
open /shared/KVTube.xcodeproj
open -a Simulator
```

---

## Headless Unit Testing on Linux (Swift Docker)

You do **not** need a Mac or Docker-OSX to compile and run the Swift unit tests (API client, URL normalization, token detection, SponsorBlock algorithms, and JSON decoders). The repository includes a Linux test runner using the official Swift Docker toolchain:

```bash
cd ios-app
./scripts/run-linux-tests.sh
```

### Options:
```bash
# Run specific test suites
./scripts/run-linux-tests.sh --filter KVApiTests
./scripts/run-linux-tests.sh --filter SponsorBlockTests

# Clean build cache before running
./scripts/run-linux-tests.sh --clean

# Use a specific Swift toolchain image
./scripts/run-linux-tests.sh --image swift:5.10
```

---

## CI/CD Pipeline (GitHub Actions)

The repository includes an automated workflow in `.github/workflows/ios-build.yml` running on GitHub's Apple Silicon M2 runner (`macos-14`):

1. **Trigger:** Automatically runs on every push and pull request to `main` affecting `ios-app/**`.
2. **Test Execution:** Executes all unit tests in `KVTubeTests` via `xcodebuild test`.
3. **Build:** Compiles the simulator bundle `KVTube.app` in `Release` mode.
4. **Artifact Creation:** Compresses `KVTube.app` into `KVTube-Simulator.zip` and uploads it as a workflow artifact.
5. **Appetize.io Readiness:** Provides instant links in the workflow summary to run the app directly in a web browser.

---

## Cloud Device Testing with Appetize.io

You can test the KV-Tube iOS app in an interactive browser-streamed simulator without any local Mac or iOS hardware:

1. Download `KVTube-Simulator.zip` from the latest GitHub Actions workflow run (or run `./scripts/build-simulator.sh`).
2. Go to [Appetize.io Upload](https://appetize.io/upload).
3. Upload `KVTube-Simulator.zip`.
4. Appetize will stream an interactive iPhone or iPad simulator directly into your web browser.

---

## Directory Structure

```
ios-app/
├── KVTube/
│   ├── App/
│   │   └── KVTubeApp.swift              # SwiftUI application entry point
│   ├── Assets.xcassets/
│   │   ├── AccentColor.colorset/        # Brand red accent color
│   │   └── AppIcon.appiconset/          # Application icon assets
│   ├── Config/
│   │   ├── Info.plist                   # Audio background mode & ATS config
│   │   └── KVTube.entitlements          # Local network & multicast entitlements
│   ├── Models/
│   │   └── VideoModels.swift            # Invidious video and stream formats
│   ├── Services/
│   │   ├── Network/
│   │   │   └── KVApi.swift              # URL normalization & Invidious client
│   │   └── Playback/
│   │       └── SponsorBlockService.swift# Segment skipping & boundary logic
│   ├── ViewModels/                      # MVVM view models
│   └── Views/                           # SwiftUI view components
├── KVTubeTests/
│   ├── KVApiTests.swift                 # URL, token, and JSON parser unit tests
│   └── SponsorBlockTests.swift          # Segment boundary & category tests
├── KVTube.xcodeproj/
│   ├── project.pbxproj                  # Xcode project configuration
│   └── xcshareddata/xcschemes/
│       └── KVTube.xcscheme              # Shared build & test scheme
├── Package.swift                        # Swift PM manifest for Linux builds
├── scripts/
│   ├── build-simulator.sh               # Builds .app and zip for simulator/Appetize
│   ├── run-linux-tests.sh               # Headless Swift test runner via Docker
│   └── setup-docker-osx.sh              # KVM macOS virtualization harness
└── README.md                            # Complete technical documentation
```
