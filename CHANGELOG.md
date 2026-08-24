# Changelog

All notable changes to KV-Tube are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [TV 1.1.0] - 2026-08-24

### Added
- **Android TV: device pairing — no more token typing** — Settings → Connection →
  "Pair device" shows a 6-character code; enter it once in Web → Settings →
  "Pair Android TV" and the TV receives your instance URL + Invidious token
  automatically. New `frontend/app/api/tv-pair` route (create / link / status,
  one-time credential hand-over, 15-min TTL) and `TvPairApi` client on the TV.

### Changed
- **Android TV: settings redesigned as a two-pane layout** — section menu on
  the left (Connection / Updates) switches panel on focus, details pane on the
  right uses large focusable rows. Editing happens in modal dialogs so the
  main list can never trap focus.
- **Android TV: D-pad can always leave text fields** — new `TvTextField`
  guarantees escape routes (Up/Down always move focus out, Left/Right exit at
  text boundaries). Applied to settings dialogs and the search bar.
- TV version bumped to `1.1.0-tv` (versionCode 3).

## [1.6.3] - 2026-08-23

### Fixed
- **Android app: Related videos missing on the watch page** — the related /
  comments / history loaders lived inside the stream-resolution flow and were
  skipped entirely whenever playback took the iframe-fallback path (common on
  networks where Google endpoints are blocked). Enrichment now runs as an
  independent coroutine launched at the start of `loadVideo()`: related
  videos appear below every video regardless of which playback path wins,
  with the trending fallback kept, and concurrent results are preserved
  across state resets.
- Android app version bumped to `1.6.3` (versionCode 21).

## [1.6.7] - 2026-08-23

### Changed
- **Android app: strict Invidious-only playback** — by design, with zero
  fallbacks:
  * Watch flow resolves streams **only** from the user-configured Invidious
    server (proxied via `local=true`). The NewPipe direct-YouTube path and the
    YouTube-embed iframe fallback are gone from the loading flow; failures now
    show a clear message with a Retry button instead of silently switching
    sources.
  * `VideoRepository` no longer falls back to on-device extraction for search,
    home feed, trending, video info, related videos or comments — server
    results only.
  * Server URL is exactly what the user saved in Settings (no built-in
    default host anywhere in the app).
  * Faster taps: no more guaranteed NewPipe timeout burning ~10s before the
    server is consulted.

## [1.6.1] - 2026-08-23

### Changed
- **Android app: strict Invidious-only images** — every thumbnail in the app
  (cards, mini player, downloads, search, subscriptions, notifications) is now
  routed through the configured Invidious server (`/vi/{id}/...` proxy) via a
  central `ThumbnailRouter`. Direct i.ytimg.com links returned by on-device
  extraction are rewritten to the proxy; the app makes **zero** connections to
  Google image hosts. The server URL is picked up at startup and whenever it
  is changed in Settings.
- Android app version bumped to `1.6.1` (versionCode 19).

## [1.5.9] - 2026-08-23

### Fixed
- **Android app: missing thumbnails when the Invidious server is down** —
  thumbnails now come from YouTube's own CDN (`i.ytimg.com`, derived from the
  video id) with the server proxy demoted to fallback. Works on every screen
  and keeps rendering through server outages.
- **Android app: notification bell no longer hammers a failing server** —
  background polling backs off (5 → 10 → 20 → 30 min) after consecutive empty
  results instead of retrying at full rate during an outage.

### Changed
- **Compact Subscriptions page** — title row tightened, "Channels"/"Latest"
  section labels removed, avatars shrunk to 34 dp with fixed-width name
  labels: noticeably more feed above the fold.
- Android app version bumped to `1.5.9` (versionCode 17).

## [1.5.8] - 2026-08-23

### Added
- **Android app: subscription-updates bell next to the search bar** — a
  notification icon with an unread badge showing how many new videos arrived
  in your subscription feed since you last checked. Polls every 5 minutes
  while the app is open; tapping it opens a panel with the newest uploads,
  red **NEW** chips on unseen items, and direct playback / channel navigation.
  The badge clears on open (last-seen timestamp persisted via DataStore).

### Changed
- Android app version bumped to `1.5.8` (versionCode 16).

## [1.5.7] - 2026-08-23

### Fixed
- **Android app: spurious red error while searching** — fast typing / repeated
  searches cancel the previous request; the `CancellationException`
  ("…was cancelled") leaked into the UI as a red error banner instead of
  being treated as normal flow control. It is now rethrown, and starting a
  new search clears any stale error.
- **Android app: loading GIF pinned to top-left** — `LoadingSpinner` ignored
  its layout modifier in inline mode, so the search loading GIF rendered in
  the corner. It now centers itself in whatever space it is given.
- **Related videos now always present on every video** — recommendation
  sources (server → on-device extractor) fall back to trending content when
  they come up empty, the currently playing video is filtered out of the
  list, and a transient failure no longer leaves the section blank.

### Changed
- Android app version bumped to `1.5.7` (versionCode 15).

## [1.5.6] - 2026-08-23

### Changed
- **Android app: media card redesign** — the notification / lock-screen card
  is now linked to the `MediaSession` compat token, unlocking the native media
  treatment: seek bar, SystemUI-rendered rich template with artwork on
  Android 13+, and themed controls on the lock screen. Custom white vector
  action icons (rewind / play-pause / forward), accent-tinted gradient card on
  older devices (`setColorized`), small icon reflects play state, and tapping
  the card re-opens KV-Tube.
- Android app version bumped to `1.5.6` (versionCode 14).

## [1.5.5] - 2026-08-23

### Fixed
- **Android app: media card never appeared** (stuck on "Preparing playback…") —
  media3's `DefaultMediaNotificationProvider` only starts painting after the
  first `MediaController` connects to the service. On some devices (verified:
  nubia NX769J / Android 16) no controller ever connects, so media3 never
  posted its card even while playback was running. KV-Tube now renders the
  media card itself — title, channel, artwork, play/pause and ±10s actions,
  attached to the `MediaSession` so Android's lock-screen / quick-settings
  media controls work — driven by its own player listeners which are
  guaranteed registered before any playback event fires. Artwork loads
  asynchronously and repaints the card when ready.

### Changed
- Android app version bumped to `1.5.5` (versionCode 13).

## [1.5.4] - 2026-08-23

### Fixed
- **Android app: app killed ~10s after opening a video** (`ForegroundServiceDidNotStartInTimeException`) —
  a `MediaSessionService` only promotes itself to the foreground when one of
  its internally-registered listeners observes a playback transition. Two
  timing holes both hit that deadline and killed the whole process (verified
  via device crash logs on Android 16):
  * v1.5.3 started `PlaybackService` at page open, but stream resolution +
    buffering regularly took longer than Android's ~10s start-foreground
    deadline — worst on slow networks or a slow Invidious server.
  * Starting the service exactly when playback began raced worse: the service
    was created *after* ExoPlayer's buffering→ready events had already fired,
    media3's notification manager never saw a transition, and never promoted.
- **The fix**: `PlaybackService.onCreate()` now discharges the foreground
  obligation itself, synchronously, with a minimal silent notification that is
  retired once real playback flows. The start→foreground gap is now zero no
  matter what the player or network does; media3's rich media card still takes
  over during playback as before.

### Changed
- Android app version bumped to `1.5.4` (versionCode 12).

## [1.5.3] - 2026-08-23

### Fixed
- **Android app: quality switching could still kill the app** — the default
  opening tier is now Mid (~720p) instead of High (~1080p). At/below 720p
  YouTube serves a combined H264/AAC MP4 that every device decodes in
  hardware, while 1080p+ is a video-only VP9/AV1 adaptive stream that older
  (< Android 8) and low-end devices must decode in software — a known source
  of freezes and native crashes. Higher tiers remain fully selectable.
- **Hardened every quality switch** — `PlaybackManager.play()` now swallows
  player exceptions (a bad stream can never take the process down), clamps
  the resume position to before the last 5 seconds (no more landing in
  STATE_ENDED when switching near the end), and debounces tier re-taps within
  350 ms to bound MediaCodec teardown/rebuild churn.
- **Media card reliability** — the media-session service now starts as soon
  as a video page opens instead of at first video frame, tapping the card
  re-opens KV-Tube (`setSessionActivity`), and start failures are logged
  instead of being silently swallowed. Note: on Android 13+ the card also
  requires the notification permission granted for KV-Tube (Settings → Apps
  → KV-Tube → Notifications).
- **Quality switch after Picture-in-Picture restarted the video from 0** —
  PiP playback used a placeholder id, so the next tier change no longer
  recognised the item as "same video" and dropped the resume position.

### Changed
- Android app version bumped to `1.5.3` (versionCode 10).

## [1.5.2] - 2026-08-23

### Fixed
- **Android app: crash while watching videos** — the app advertised Android
  5.0+ support but never enabled core-library desugaring. Media3 (ExoPlayer)
  uses `java.time` & other API 26+ classes, so on any device below Android 8
  the process died instantly (`NoClassDefFoundError`) the moment the watch
  screen loaded player classes — typically right as playback or a quality
  switch started. Core-library desugaring is now enabled
  (`desugar_jdk_libs_nio`), making the player safe down to minSdk 21.
- **Android app: Picture-in-Picture crashed devices below Android 8** — the
  PiP button was shown unconditionally, but `PictureInPictureParams` is an
  API 26+ class; tapping it killed the process. The button is now only
  offered on API 26+.
- **Android app: media card missing from notification shade / lock screen** —
  `POST_NOTIFICATIONS` existed in the manifest but was never requested at
  runtime, so Android 13+ silently suppressed the MediaSession notification.
  The permission is now requested when the app starts; granting it restores
  the media card with play/pause and seek controls.
- **Quality switch hardening** — resuming position across a quality change
  now uses ExoPlayer's positional `setMediaSource(source, positionMs)`
  overload, so the resume seek is applied atomically with the new stream
  instead of racing the re-prepare.

### Changed
- Android app version bumped to `1.5.2` (versionCode 9).

## [1.0.1] - 2026-08-23

### Fixed
- **Android app: Invidious subscriptions never showed** — three root causes,
  all verified against a live instance:
  - *Wrong auth credential type.* Tokens from Preferences → Tokens are
    base64-encoded JSON and must be sent as `Authorization: Bearer`, while SID
    cookie values must be sent as `Cookie: SID=…`. The old `startsWith("{")`
    heuristic mis-classified standard tokens, and Invidious fails hard (403)
    when an undecodable Bearer header is present even alongside a valid SID
    cookie. The client now decodes the token to decide the correct single
    credential (`KVApi.usesBearerToken`).
  - *Remote subscribe was rejected.* The app POSTed a JSON body to
    `/auth/subscriptions`; Invidious only accepts
    `POST /auth/subscriptions/{channel_id}` (path parameter). Subscribes now
    sync to the Invidious account correctly.
  - *Silent empty state.* An expired token or unreachable server looked
    identical to "no subscriptions". The feed fetch now distinguishes request
    failure from a genuinely empty account, and the Subscriptions screen shows
    a precise explanation (token rejected / server unreachable / account has
    no subscriptions yet).
- **Web frontend: same auth bugs** — the `/api/invidious` proxy route and
  `pushSubscriptionToInvidious` (which sent Bearer **and** SID together)
  shared the broken `{`-prefix heuristic; both now use the shared classifier
  (`frontend/app/services/invidiousToken.ts`).
- **Android app: session credentials leaked to logcat** — the Ktor logging
  plugin at `BODY` level wrote `Cookie`/`Authorization` headers to logcat;
  sensitive headers are now masked.

### Added
- Android app: live subscription test suite extended with an authenticated
  subscribe/unsubscribe round-trip (`InvidiousSubscriptionLiveTest`), plus a
  pure unit test for token classification (`TokenAuthTest`).

### Changed
- Android TV keep-screen-on — the TV app now holds `FLAG_KEEP_SCREEN_ON`
  for its whole foreground lifetime, so the display stays on and the TV's
  sleep screen/screensaver never covers kv-tube while it is open. Normal
  sleep resumes as soon as the app is left.
- Android TV version bumped to `1.0.1-tv` (versionCode 2).

## [4.4.0] - 2026-07-21

### Fixed
- **Android download crash** — added the missing `androidx.hilt:hilt-compiler`
  KSP dependency (`hilt-ext-compiler`), which caused `NoSuchMethodException`
  when WorkManager tried to instantiate `DownloadWorker` via Hilt injection.
- **Download progress not visible** — downloads now appear immediately in the
  Downloads tab with real-time progress (percent, speed, ETA) via chained
  `StateFlow` combination of active downloads and completed Room DB entries.

### Added
- **Share button** — the Share pill on the Watch screen now opens the native
  Android share sheet with the YouTube URL of the current video.
- **Download badge on nav bar** — the Downloads tab icon shows a numeric badge
  indicating the number of active/queued downloads.
- **Channel page redesign** — compact banner, real channel avatar loaded from
  the server API, subscriber and video counts, and clickable channel avatars
  on the Subscriptions screen that navigate to the channel page.
- **Download quality selection** — bottom sheet with three quality tiers
  (Low ≤360p, Recommended ≤1080p, Best) before starting a download.
- **Download management** — completed downloads saved to Room DB; users can
  search, rename, sort (by name/date/size/channel), and permanently delete
  downloaded files from the Downloads tab.
- **Cancel active downloads** — active downloads can be cancelled from both
  the download bottom sheet and the Downloads tab list/grid views.

### Changed
- Android app version bumped to `1.1.0` (versionCode 2).
- `DownloadsViewModel` refactored to use chained `Flow.combine` to merge
  active download progress with completed downloads from Room.
- `DownloadsScreen` grid and list items now accept and display `DownloadProgress`
  with `LinearProgressIndicator`, status text, and a cancel action.

## [4.3.0] - 2026-07-20

### Added
- **Android native app** — first release of the native Android client built with
  Kotlin and Jetpack Compose.
- **Material 3 design system** — YouTube-inspired dark/light themes with custom
  color palettes matching the webapp.
- **ExoPlayer video playback** — native video player with quality selection,
  fullscreen, and system media controls.
- **On-device downloads via NewPipeExtractor** — extract real YouTube stream URLs
  directly on the device; three quality tiers (Low ≤360p, Recommended ≤1080p,
  Best) with background download via WorkManager.
- **Bottom navigation** — Home, Subscriptions, Library, and Downloads tabs.
- **Search** — full-text video search with category pills.
- **Channel pages** — channel info, subscriber count, and video grid.
- **Subscriptions feed** — aggregated video list from subscribed channels.
- **Watch history & liked videos** — local Room database tracking.
- **Auto-update checker** — monitors GitHub/Forgejo releases for new versions.
- **App icon & splash screen** — adaptive icon with splash animation.
- New project structure under `android/` with MVVM architecture, Hilt DI, Ktor
  client, Coil image loading, and DataStore preferences.

## [4.2.1] - 2026-07-20

### Added
- **Server-side video downloads** — replaced the old proxy/DASH approach with a
  true download flow: the backend runs `yt-dlp` in a pseudo-terminal and lets the
  client download the resulting MP4 file.
- **Three quality tiers** — `Low` (≤360p), `Recommended` (≤1080p), and `Best`
  (bestvideo+bestaudio), selectable from the download sheet.
- **Live SSE progress** — the download sheet subscribes to a Server-Sent Events
  stream showing percentage, speed, ETA, and a merging phase, then offers a
  "Download to device" button when ready.
- **Temp download cache** — completed files are stored under
  `/tmp/kv-tube-downloads` with a 30-minute TTL and a background cleanup loop
  (every 5 min) that auto-deletes expired entries.
- New backend routes:
  - `GET /api/video/:id/download/status` — SSE stream of download progress.
  - `GET /api/video/:id/download` — serves the cached file as an attachment.

### Removed
- Old `handleDownloadInfo` / `handleVideoProxy` routes and the `DownloadInfo`,
  `DownloadFormat`, `GetDownloadInfo`, `FormatInfo` types.
- Server-side stream/HLS manager (`services/stream.go`, `services/dash.go`) and
  the Vidstack player in favor of a lighter MSE-based player.

### Changed
- `yt-dlp` now runs inside a PTY (`github.com/creack/pty`) with `--no-colors`
  `--newline`; progress output is fully suppressed unless attached to a TTY, so
  parsing requires the PTY. Progress lines are ANSI-stripped before parsing.

## [4.1.0] - 2026-07-11

### Added
- **Rich channel pages** — redesigned with banner, real avatar image, description
  (expandable), subscriber count, and video count, plus an SSR grid and
  infinite-scroll loading up to 200 videos.
- **View counts on channel videos** — flat-playlist listings lack view counts, so
  they are now hydrated lazily via a batched `/api/videos/stats` endpoint
  (`GetVideoStats`) and cached.
- **Lazy subscription avatars** — real channel avatars load as chips scroll into
  view, backed by a lightweight `/api/channel/avatars` batch endpoint and cached
  in memory + `localStorage`.
- **Channel avatar strip** — subscriptions page gains a scrollable channel strip
  with left/right arrows and an expand/collapse view of all subscriptions.
- **Themed loading animation** — replaced the CSS spinner with a branded
  `loading.gif` that adapts to light/dark themes.
- New `/api/channel/page` endpoint returning combined channel info + videos in a
  single yt-dlp call.

### Changed
- **Consistent branding** — all favicons and app icons (tab, PWA, maskable,
  apple-touch) now match the in-app logo: a red circle with a white play triangle.
- Subscription video cards no longer show a channel avatar; the channel name is a
  direct link to the channel page.
- Home feed infinite scroll deepened with a consecutive-empty-page streak guard so
  results keep loading further before stopping.
- `RunYtDlp` now retries across multiple player clients on empty/bot-check output;
  empty results are no longer cached.

### Fixed
- Empty main page caused by double-encoded cache entries (`SetCachedVideo` now
  stores raw JSON verbatim).
- Watch page sidebar now always populates Up Next + Mix and scrolls independently.
- Mobile layout: sidebar hidden correctly and watch page fits the viewport.

## [4.0.0] - 2026-02-22

- Major release. See git history for details.

## [3.1.x] - 2026

- Iterative fixes and improvements across watch, search, and subscriptions.

## [2.0.0] - 2025-12-17

- Initial public release of KV-Tube.

[4.4.0]: https://github.com/vndangkhoa/kv-tube/compare/v4.3.0...v4.4.0
[4.3.0]: https://github.com/vndangkhoa/kv-tube/compare/v4.2.1...v4.3.0
[4.2.1]: https://github.com/vndangkhoa/kv-tube/compare/v4.2.0...v4.2.1
[4.2.0]: https://github.com/vndangkhoa/kv-tube/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/vndangkhoa/kv-tube/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/vndangkhoa/kv-tube/releases/tag/v4.0.0
[2.0.0]: https://github.com/vndangkhoa/kv-tube/releases/tag/v2.0
