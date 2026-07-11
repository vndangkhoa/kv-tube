# Changelog

All notable changes to KV-Tube are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[4.1.0]: https://github.com/vndangkhoa/kv-tube/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/vndangkhoa/kv-tube/releases/tag/v4.0.0
[2.0.0]: https://github.com/vndangkhoa/kv-tube/releases/tag/v2.0
