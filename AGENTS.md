# KV-Tube Android App — Build Plan

## Overview

Native Android app for KV-Tube (privacy-focused YouTube frontend). Mirrors the webapp UI exactly, adds a Downloads tab for managing locally downloaded videos.

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | Kotlin |
| UI | Jetpack Compose + Material 3 |
| Architecture | MVVM (ViewModel + StateFlow + Flow) |
| Navigation | Jetpack Navigation Compose |
| Networking | Ktor Client (lightweight, Kotlin-native, built-in SSE) |
| Serialization | kotlinx.serialization |
| Video Player | Media3 ExoPlayer |
| Image Loading | Coil (Compose-native) |
| Local DB | Room (SQLite) |
| Preferences | DataStore |
| DI | Hilt |
| Background Work | WorkManager |
| On-device Extraction | NewPipeExtractor (for downloads) |
| Min SDK | 21 (Android 5.0) |
| Target SDK | 34 (Android 14) |
| Build | Gradle + Kotlin DSL |

## Architecture: Hybrid Server + On-Device

```
┌──────────────────────────────────────┐
│  UI Layer (Jetpack Compose + M3)     │
│  Home │ Sub │ Library │ Downloads    │
│  └── Drawer: Settings, Channel Search│
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│  Repository Layer                    │
│  ┌────────────────┬──────────────┐   │
│  │ Server API    │ On-Device    │   │
│  │ (Ktor Client) │ Extraction   │   │
│  │ search, subs, │ (NewPipeExt) │   │
│  │ history, etc. │ for DOWNLOADS│   │
│  └────────────────┴──────────────┘   │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│  Data Layer                          │
│  Room DB (downloads, local cache)    │
│  DataStore (prefs, server URL, etc.) │
│  MediaStore (file management)        │
└──────────────────────────────────────┘
```

- **Server API**: Browse, search, subscriptions, history, playback URLs → KV-Tube Go backend
- **On-device**: Downloads extracted via NewPipeExtractor, downloaded directly from YouTube CDN

## Project Structure

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   └── java/com/kvtube/android/
│   │       ├── KVTubeApp.kt
│   │       ├── MainActivity.kt
│   │       ├── di/
│   │       │   ├── NetworkModule.kt
│   │       │   ├── DatabaseModule.kt
│   │       │   └── RepositoryModule.kt
│   │       ├── data/
│   │       │   ├── api/
│   │       │   │   ├── KVApi.kt
│   │       │   │   └── AuthInterceptor.kt
│   │       │   ├── local/
│   │       │   │   ├── AppDatabase.kt
│   │       │   │   ├── DownloadedVideoDao.kt
│   │       │   │   ├── DownloadedVideoEntity.kt
│   │       │   │   └── SettingsDataStore.kt
│   │       │   ├── model/
│   │       │   │   ├── VideoData.kt
│   │       │   │   ├── ChannelInfo.kt
│   │       │   │   ├── PlaybackInfo.kt
│   │       │   │   ├── Comment.kt
│   │       │   │   └── DownloadModels.kt
│   │       │   └── repository/
│   │       │       ├── VideoRepository.kt
│   │       │       ├── ChannelRepository.kt
│   │       │       ├── SubscriptionRepository.kt
│   │       │       ├── HistoryRepository.kt
│   │       │       └── DownloadRepository.kt
│   │       ├── ui/
│   │       │   ├── theme/
│   │       │   │   ├── Color.kt
│   │       │   │   ├── Theme.kt
│   │       │   │   └── Type.kt
│   │       │   ├── navigation/
│   │       │   │   ├── NavGraph.kt
│   │       │   │   └── BottomNavBar.kt
│   │       │   ├── components/
│   │       │   │   ├── VideoCard.kt
│   │       │   │   ├── VideoGrid.kt
│   │       │   │   ├── CategoryPills.kt
│   │       │   │   ├── DurationBadge.kt
│   │       │   │   ├── ChannelAvatar.kt
│   │       │   │   ├── SubscribeButton.kt
│   │       │   │   ├── SearchBar.kt
│   │       │   │   ├── LoadingSpinner.kt
│   │       │   │   ├── DownloadBottomSheet.kt
│   │       │   │   └── Skeleton.kt
│   │       │   ├── screens/
│   │       │   │   ├── home/
│   │       │   │   │   ├── HomeScreen.kt
│   │       │   │   │   └── HomeViewModel.kt
│   │       │   │   ├── watch/
│   │       │   │   │   ├── WatchScreen.kt
│   │       │   │   │   ├── WatchViewModel.kt
│   │       │   │   │   ├── ExoPlayerView.kt
│   │       │   │   │   └── YouTubeFallbackView.kt
│   │       │   │   ├── search/
│   │       │   │   │   ├── SearchScreen.kt
│   │       │   │   │   └── SearchViewModel.kt
│   │       │   │   ├── shorts/
│   │       │   │   │   └── ShortsScreen.kt
│   │       │   │   ├── subscriptions/
│   │       │   │   │   ├── SubscriptionsScreen.kt
│   │       │   │   │   └── SubscriptionsViewModel.kt
│   │       │   │   ├── library/
│   │       │   │   │   ├── LibraryScreen.kt
│   │       │   │   │   └── LibraryViewModel.kt
│   │       │   │   ├── channel/
│   │       │   │   │   ├── ChannelScreen.kt
│   │       │   │   │   └── ChannelViewModel.kt
│   │       │   │   └── downloads/
│   │       │   │       ├── DownloadsScreen.kt
│   │       │   │       ├── DownloadsViewModel.kt
│   │       │   │       └── FileActionDialogs.kt
│   │       │   ├── MainScreen.kt
│   │       │   └── SettingsScreen.kt
│   │       └── service/
│   │           └── DownloadService.kt
│   └── build.gradle.kts
├── gradle/
│   ├── libs.versions.toml
│   └── wrapper/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

## Navigation

```
MainScreen (Scaffold)
├── BottomNavBar [Home] [Subs] [Library] [Downloads]
├── DrawerHost
│   └── DrawerContent
│       ├── Header (logo + server status)
│       ├── Channel Search
│       ├── Settings
│       │   ├── Server Address
│       │   ├── Theme (dark/light/system)
│       │   ├── Region
│       │   └── Download Path
│       └── About
└── NavHost
    ├── Home              → "home"
    ├── Subscriptions     → "subscriptions"
    ├── Library           → "library"
    ├── Downloads         → "downloads"
    ├── Watch             → "watch/{videoId}"
    ├── Search            → "search?q={query}"
    ├── Shorts            → "shorts"
    ├── Channel           → "channel/{channelId}"
    └── Settings          → "settings"
```

## Download Engine Deep Dive

### Flow
```
User selects quality → DownloadRepository.enqueue()
  → WorkManager enqueues DownloadWorker
    → Phase 1: NewPipeExtractor extracts stream URLs
    → Phase 2: Select progressive (preferred) or DASH video+audio
    → Phase 3: OkHttp streaming download with Range header support
    → Phase 4: If DASH, merge via MediaMuxer
    → Phase 5: Save to storage, register in Room DB
```

### Quality Tiers
| Tier | Max Height | Stream Type |
|------|-----------|-------------|
| Low | 360p | Progressive (combined A+V) |
| Recommended | 1080p | Progressive (combined A+V) |
| Best | Highest | DASH (separate video+audio, merge) |

### Merge Strategy
- Prefer progressive streams (no merge needed, up to ~720p)
- For 1080p+: DASH video-only + audio-only, merge via Android MediaMuxer
- Fallback: mobile-ffmpeg if MediaMuxer cannot handle codec

### File Management
- Room DB tracks all metadata (path, size, quality, date, custom name)
- Sort by: name, date, size, channel (asc/desc)
- Rename: update filename on disk + Room DB
- Delete: remove file + Room entry
- Play: open file URI in ExoPlayer

## Theme System

Match webapp CSS variables exactly:

```kotlin
// Dark theme (default)
YTBackground  = #0F0F0F
YTSurface     = #0F0F0F
YTHover       = #272727
YTActive      = #3F3F3F
YTBorder      = #3F3F3F
YTTextPrimary = #F1F1F1
YTTextSecondary= #AAAAAA
YTBrandRed    = #FF0000
YTBlue        = #3EA6FF

// Light theme
YTBackground  = #FFFFFF
YTSurface     = #FFFFFF
...
```

## Implementation Order

1. **Foundation**: Project setup, Gradle config, Hilt, theme, navigation scaffold
2. **Data Layer**: API interface, models, Room DB, repositories
3. **Core UI**: HomeScreen, WatchScreen (ExoPlayer), VideoCard, infinite scroll
4. **Feature Screens**: Search, Shorts, Subscriptions, Library, Channel
5. **Downloads**: DownloadBottomSheet, DownloadWorker, DownloadsScreen
6. **Settings & Drawer**: Server address, theme toggle, region selector
7. **Polish**: Animations, PWA features, background audio, PiP
