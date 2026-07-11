# TypeType Performance Analysis & KV-Tube Integration Plan

## Overview

Analysis of TypeType (https://github.com/akiver/typetype) performance techniques
for fast video loading and playback, and how to apply them to KV-Tube.

## TypeType's 13 Core Speed Techniques

### 1. Client-Side Manifest Generation (Biggest Win)
- **Files**: `lib/dash-manifest.ts`, `lib/nico-hls-manifest.ts`, `lib/bilibili-manifest.ts`
- Builds DASH/HLS manifests in-memory as data URIs (`data:application/dash+xml;base64,...`)
- `buildDashManifest()` is synchronous XML generation + `btoa()` — sub-millisecond
- Eliminates a network round-trip for manifest fetching (50-300ms saved)
- **Manifest priority ladder** in `stream-src.ts:69-159` (fastest first):
  1. HLS URL directly (if stream has it) — zero network
  2. Client-built HLS (NicoNico) — zero network
  3. Client-built DASH (Bilibili) — zero network
  4. Progressive MP4 (compatibility mode) — zero network
  5-8. Server-side manifests as fallback

### 2. TanStack Query Aggressive Caching
- **Files**: `hooks/use-stream.ts`, `hooks/use-progress.ts`, `hooks/use-settings.ts`
- Stream data: `staleTime: 3min`, `gcTime: 30min`, `keepPreviousData`
  - Shows stale data instantly while background-refetching
  - 3 minutes before re-fetch on revisit
- Progress: `staleTime: Infinity` — never refetched within session
- Settings: `staleTime: 5min`, `placeholderData: DEFAULTS`
  - Shows sensible defaults before settings load

### 3. Anonymous-First Stream Fetching
- **File**: `lib/api-stream.ts:29-33`
- Tries without auth first: `fetch(endpoint, { cache: "no-store" })` — no Bearer token
- Falls back to authenticated only on 401/403 errors
- Saves 50-100ms token-loading overhead for most (public video) requests

### 4. Parallel Data Fetching
- **File**: `routes/watch.tsx:44-57`
- Stream + progress + auth + settings all fire in parallel
- React Query fires all enabled queries simultaneously — no waterfall

### 5. Progressive Loading States
- **File**: `routes/watch.tsx:88-90`
- Three-tier without blocking:
  1. `isLoading && !stream` → show PlayerOnlyLoader (black player shell)
  2. `!authReady` → show PlayerOnlyLoader
  3. `isAuthed && progressFetch.isPending` → wait for resume position
- **Key**: Unauthenticated users skip progress fetch entirely (returns `{ position: 0 }`)

### 6. Error Recovery Chain (6 Levels)
- **File**: `hooks/use-player-error.ts:96-121`
- Progressive fallback on player error:
  1. Bilibili variant switch (different video+audio combo)
  2. Disable high-quality (VP9/AV1 → H.264)
  3. Native → regular server manifest
  4. Cap resolution at 720p
  5. Compatibility mode (progressive MP4)
  6. Permanent failure
- Each step increments `retryKey` → clean player remount

### 7. Player `key` Remount Strategy
- **File**: `components/watch-stage.tsx:99`
- Composite `playerKey = stream.id : retryKey : qualityMode : hasThumbnails : hasChapters`
- React unmounts/remounts player entirely when key changes
- Avoids complex/buggy hot-swapping of dash.js sources

### 8. nginx Immutable Caching
- **File**: `nginx.conf:33-36`
- `expires 1y; Cache-Control: public, immutable` for JS/CSS/png/jpg/etc.
- Vite content-hashes filenames → assets never re-validate after first load
- Also: gzip compression, proxy_buffering off for streaming API responses

### 9. Code Splitting
- **File**: `vite.config.ts:12` — TanStack Router `autoCodeSplitting: true`
- Each route is a separate chunk
- Watch page heavy deps (Vidstack, dash.js) download only on `/watch`
- Combined with `lazy(() => import(...))` + `<Suspense>`

### 10. dash.js Optimization
- **File**: `components/video-player-core.tsx:35-49`
- `cmcd: { enabled: false }` — no CMCD headers on every segment request
- Retry: 3 attempts, 500ms intervals for all segment types
- `minBufferTime="PT1.5S"` in DASH manifest — only 1.5s buffer before playback

### 11. Vidstack Provider Loader Patch
- **File**: `lib/vidstack-provider-loader-patch.ts:11-19`
- Monkey-patches Vidstack loaders to create fresh instance per `load()` call
- Without this: reused loader instances retain stale state and skip loading

### 12. Ref-Based Event Handlers
- **File**: `routes/watch.tsx:59-61`
- Store latest callback in a ref; event listeners capture the ref, not the closure
- Listeners never need re-attaching when callback reference changes
- Same pattern in `media-progress-events.tsx` for all media events

### 13. Image Proxying
- **File**: `lib/proxy.ts:49-55`
- Only proxies images from specific hosts (ggpht, googleusercontent, ytimg)
- Direct images from other origins bypass proxy overhead
- Uses `hqdefault.jpg` (reliable/fast) over `maxresdefault.jpg` (may 404)

## KV-Tube Current State

### Already Working:
- ✅ Backend already extracts all stream data via yt-dlp (`/api/video/:id/qualities`)
- ✅ hls.js already installed as frontend dependency
- ✅ Next.js already code-splits per route (no Vite needed)
- ✅ nginx with gzip in Docker deployment

### Needs Fixing:
- ❌ Watch page uses YouTube IFrame API (ads, tracking, not private)
- ❌ Shorts page calls broken endpoint `/api/get_stream_info` (404)
- ❌ No media proxy (CORS/rate limiting issues on direct YouTube URLs)
- ❌ Manual Map-based cache instead of React Query
- ❌ Sequential data fetching (waterfall)
- ❌ No progressive loading
- ❌ No error recovery chain

## Implementation Plan

### Phase 1 — Core Player Replacement (Backend + Frontend)
1. Add `/api/proxy` endpoint — proxy YouTube stream URLs through backend
2. Add `/api/video/:id/manifest` — return playable HLS manifest
3. Add `/api/get_stream_info` — fix shorts broken endpoint
4. Create `SelfHostedPlayer.tsx` — hls.js + HTML5 video, replace YouTube IFrame
5. Update `ClientWatchPage.tsx` — use new player
6. Fix shorts page — use proper endpoint

### Phase 2 — Performance Optimization
7. Add React Query (`@tanstack/react-query`) for caching
8. Parallel data fetching with `Promise.all`
9. Progressive loading with loading skeletons
10. Add immutable caching to nginx.conf
11. Error recovery chain (fallback quality → progressive MP4 → YouTube fallback)

### Phase 3 — Advanced Features (Optional)
12. Client-side HLS manifest builder (data URI generation like TypeType)
13. Vidstack + dash.js integration for DASH adaptive streaming
14. SponsorBlock integration
15. Playback progress persistence
