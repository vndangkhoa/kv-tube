# YouTube Integration Knowledge Base

Lessons learned while building and debugging **KV Music** (Rust/Axum + yt-dlp + React), tested against YouTube/YouTube Music in Aug 2026. Use this when working on any project that extracts or streams from YouTube server-side.

---

## 1. YouTube Bot Detection — the core problem

YouTube rate-limits and bot-blocks **server-side** requests (datacenter + residential IPs).

### Error signatures
- `HTTP Error 403: Forbidden`
- `HTTP Error 429: Too Many Requests`
- `Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies ...`
- `The provided YouTube account cookies are no longer valid` (cookies expired/rotated)
- `No title found in player responses; falling back to title from initial data` (often accompanies blocks)

### Important distinction
- **Lightweight endpoints** (search with `--flat-playlist`, charts, browse) often pass while flagged
- **Full player downloads** (`-f bestaudio ...`) get blocked — the *stream* is what breaks while the app "looks" fine

### Detection/repair loop (what works)
1. Detect the signature in yt-dlp stderr (strings above, lowercase match)
2. Discard the rejected cookie file (do NOT keep reusing it silently)
3. Auto-refresh an anonymous session, write to a writable path, retry the download
4. If it still fails → the **IP itself** is flagged; anonymous cookies cannot fix that (see §3)

---

## 2. IPv6 is your best weapon

YouTube blocks many residential **IPv4** routes but allows the same traffic over **IPv6**.

- Auto-probe IPv6 connectivity at startup (TCP connect to `[2001:4860:4860::8888]:443`, ~3s timeout, cache result)
- If routable → add `--force-ipv6` to yt-dlp
- On network errors (`network is unreachable`, `connect() timed out`, `no route to host`, etc.) → fall back to IPv4 and retry
- Allow override: `FORCE_IPV6=1` (always) / `FORCE_IPV6=0` (never)

### Docker specifics
- Docker's embedded DNS strips AAAA records → point containers at `8.8.8.8` / `1.1.1.1` explicitly
- A dual-stack bridge network (`enable_ipv6: true` + a `fd00::/64` subnet) is required
- **Synology trap**: IPv6 is often "assigned but not routed" → the probe correctly fails and falls back to IPv4, which may be bot-blocked. Diagnose inside the container:
  ```bash
  docker exec <c> sh -c "curl -6 -m 8 -s -o /dev/null -w IPv6:%{http_code} https://www.youtube.com/ || echo IPv6-FAILED"
  docker exec <c> sh -c "curl -4 -m 8 -s -o /dev/null -w IPv4:%{http_code} https://www.youtube.com/ || echo IPv4-FAILED"
  ```

---

## 3. Cookies — the hierarchy of trust

| Session type | Power | Notes |
|--------------|-------|-------|
| **Logged-in cookies** (`SAPISID`, `__Secure-3PAPISID`, etc.) | Strongest — defeats IP-level blocks | Export fresh from a logged-in browser (get-cookies-txt extension); **they expire/rotate**, re-export on "no longer valid" |
| Anonymous session cookies (`VISITOR_INFO1_LIVE`, `YSC`, `PREF`) | Basic | Auto-fetchable by visiting youtube.com/music.youtube.com; sufficient for most cases, **not** for flagged IPs |
| No cookies | Weakest | Most likely blocked |

### Cookie file engineering (all real bugs we hit)
- **Docker missing-file trap**: mounting `./cookies.txt:/app/cookies.txt:ro` with no host file makes Docker create a **directory**. Always check `is_file()`, never `exists()`.
- **Read-only mounts**: yt-dlp *writes back* to the cookie file on exit → crashes on `:ro`. Copy the mounted file to a writable location (e.g. `/app/data/cookies.txt`) first.
- **Relative path trap**: if yt-dlp runs with a different `current_dir` (e.g. download temp dir), a relative cookie path breaks with `FileNotFoundError: ... 'data/cookies.txt'`. Always `fs::canonicalize()` the path before passing `--cookies`.
- **Priority**: user-provided (mounted) cookies first; auto-refreshed file as fallback; but once YouTube rejects the user file, blacklist it for the process lifetime and switch to the auto-refreshed session.
- **Startup refresh**: if no cookie file exists at all, auto-fetch one in the background at boot.

---

## 4. yt-dlp operational knowledge

- **JS runtime is mandatory now**: pass `--js-runtimes node` (the runtime name is `node`, NOT `nodejs` — `nodejs` is ignored with "Ignoring unsupported JavaScript runtime(s)" and you get 403s). The image must contain Node 20+/22.
- **Nightly builds > stable**: `yt-dlp-nightly-builds` carries the newest anti-bot workarounds (PO tokens, client changes). Auto-update at container start:
  ```bash
  curl -fsSL https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp
  ```
- **Format selection**:
  - `-f bestaudio/best` → YouTube gives **WebM/Opus** (itag 251) — open codec
  - `-f bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best` → **MP4/AAC** (itag 140)
- **Player-client tricks are unreliable**: `--extractor-args "youtube:player_client=android|tv|ios|web_embedded|web_safari"` occasionally bypasses a block once, then fails on retry. Do NOT depend on them.
- **Extras that help**: `curl_cffi` (Chrome TLS fingerprint impersonation) and `yt-dlp-ejs` in the runtime environment.
- **Retry policy**: 3 attempts with backoff for 429s; distinguish rate-limit (retry) vs network-failure (switch IP family) vs cookie-rejection (refresh cookies) vs hard block (give up with the stderr in the error message — the error body must be returned to the user for debugging).

---

## 5. Audio formats & codec negotiation (frontend)

- **WebM/Opus (default)** plays in Chrome, Firefox, Edge, and **codec-restricted clients** like VS Code's embedded webview (its Electron ships `libffmpeg.so` with only `opus/h264/hevc` — **no AAC, no MP3**).
- **Safari cannot play WebM/Opus** → needs **m4a/AAC**.
- Correct approach: serve WebM/Opus by default; let the frontend detect support and request m4a only when needed:
  ```js
  audio.canPlayType('audio/webm; codecs="opus"') !== ''  // true → webm, false → ?fmt=m4a
  ```
- Serve files with `Accept-Ranges` + correct Content-Type (browsers seek with Range requests; `206 Partial Content` proves it works).
- **Frontend staleness**: browsers/embedded webviews cache old JS. A user stuck with an erroring audio element may need a hard refresh (Ctrl+Shift+R); also auto-reload an audio source when the element is in `error` state even if the URL is unchanged (React effect with `isSameUrl && !hasError` guard).

---

## 6. Debugging flow (in order)

1. `curl -s <server>/api/stream/<video_id>` — the 500 body usually contains yt-dlp's stderr verbatim (return it from the API!)
2. `docker logs <c>` — look for `[Cookies]`, `[Stream]`, IPv6 lines
3. Inside the container, reproduce directly:
   ```bash
   docker exec <c> yt-dlp --js-runtimes node --cookies <file> "ytsearch1:test" --dump-json --flat-playlist
   ```
4. Test IPv6 vs IPv4 (`curl -6` / `curl -4`) — this separates "IP blocked" from "code broken"
5. Check the cached download dir — old-format files (`.webm` vs `.m4a`) from before a fix can keep failing; clear the cache after upgrades

---

## 7. Architecture recommendations (from KV Music)

- All yt-dlp invocation args built in one helper (adds `--js-runtimes node`, IPv6 flag, cookies, extra args)
- Downloads cached by `<video_id>.<ext>`; serve via `ServeFile` (handles Range)
- Cookie state: shared `CookieStore` between the HTTP client (innerTube API calls) and the Netscape file serializer
- Clear in-memory caches after any cookie refresh so everything re-fetches with the new session
- Keep the error body informative: `Download failed. stderr: <yt-dlp output>` — it is the fastest diagnostic for users

---

## 8. 2026 Synology + VNPT + `usque` WARP MASQUE (`443/udp`) + Strict Companion Stream IP-Symmetry (KV-Tube)

In late 2026 on residential Vietnamese ISPs (notably **VNPT**) and Synology NAS hosts without routable IPv6:
1. Residential IPv4 ranges get flagged by YouTube (`Sign in to confirm you're not a bot` / `403 Forbidden`), AND WireGuard UDP ports (`2408/udp`, `500/udp`, `1701/udp`, `4500/udp`) are frequently throttled or DPI-blocked by ISP middleboxes.
2. **Cloudflare WARP over MASQUE (`usque`, HTTP/3 QUIC on `443/udp`)** bypasses WireGuard DPI cleanly because it looks identical to standard QUIC `443/udp` web traffic while providing a clean Cloudflare egress IP (`HTTP_PROXY` / `SOCKS5` sidecar on the internal Docker network).

### Critical Rule #1: Strict Stream IP-Symmetry (Extraction IP == Playback IP)
YouTube binds signed `googlevideo.com/videoplayback` URLs (`ip=<egress-ip>` inside `sparams` + `sig`) to **the exact IP address that extracted the player response**:
- If **Invidious Companion** extracts `/api/v1/videos/:id` via the `usque` WARP proxy IP, **the browser MUST NOT fetch `*.googlevideo.com` directly** from the user's residential/mobile IP — `googlevideo.com` immediately rejects the mismatched IP with `403 Forbidden`!
- Similarly, server-side single-stream downloads (`/api/download`), `ffmpeg` dual-stream HD muxing (`-i videoUrl -i audioUrl`), and `/api/media-proxy` **must NOT fetch `googlevideo.com` directly over raw container WAN** if Companion extracted via WARP.
- **Required end-to-end flow**:
  1. Frontend requests `/api/v1/videos/:id?local=true` (`invidious.getVideo` always passes `local=true`), and `/api/invidious/[...path]` injects `local=true` on DASH manifests (`/api/manifest/dash/`), HLS manifests (`/api/manifest/hls_variant/`, `/api/manifest/hls_playlist/`), and `/latest_version`.
  2. `invidious.proxyUrl(raw)` keeps static image CDNs (`ytimg.com`, `ggpht.com`, `googleusercontent.com`) direct, **never leaves `*.googlevideo.com` direct**, rewrites `manifest.googlevideo.com/...` -> `/api/invidious/companion/...`, and rewrites `*.googlevideo.com/videoplayback?...` -> `/api/invidious/companion/videoplayback?...&host=<edge-host>` (preserving exact percent-encoding of signed query params).
  3. `/api/invidious/[...path]`, `/api/download`, and `/api/media-proxy` normalize `/api/invidious/companion/...`, `/companion/...`, `127.0.0.1:8282`, `localhost:8282`, and `*.googlevideo.com` URLs (including manual `301`/`302`/`303`/`307`/`308` redirect hops) to internal `${COMPANION_URL}/companion/...` so **100% of stream bytes exit through Companion -> `usque` WARP**.
  4. Never fall back to public Invidious mirrors (`nerdvpn.de`, `nadeko.net`, `yewtu.be`) for `/videos/*` or media/manifest routes — public mirrors either 401/403 or return streams signed for foreign server IPs.

### Critical Rule #2: Node 22 Native Env Proxy (`NODE_USE_ENV_PROXY=1`)
- Run the Next.js standalone container on **`node:22-alpine`** (`NODE_USE_ENV_PROXY=1`) so Node's built-in global `fetch()` (`undici`) natively honors `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` across server routes (`/api/mix`, `/api/shorts/*`, `/api/channel-avatar`, oEmbed metadata) without custom `https.Agent` hacks while keeping internal container traffic (`companion`, `invidious`, `backend`, `127.0.0.1`, `localhost`) bypassed via `NO_PROXY`.

### Critical Rule #3: Eliminate Next.js RSC Prefetch Storms & Stream Cutoff Timeouts
- **Next.js `<Link>` RSC Prefetch Storm**: By default in Next.js App Router, rendering 20–40 `<Link href="/watch?v=...">` video cards in the viewport triggers 20–40 background RSC prefetches, each invoking `generateMetadata` on `/watch`. If `generateMetadata` calls `invidious.getVideo(videoId)` (especially inside an uncancelled `Promise.race`), opening `/` or `/watch` unleashes dozens of concurrent player + PO-token extractions that rate-limit (`429`) Companion and WARP instantly!
  - **Fix A**: Add `prefetch={false}` to **every** `<Link>` pointing to `/watch...`, and never call `router.prefetch('/watch...')` or `invidious.getVideo()` on hover.
  - **Fix B**: In `app/watch/page.tsx` (`generateMetadata`), use YouTube's lightweight `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` with `AbortSignal.timeout(1200)` and fall back to `https://i.ytimg.com/vi/<id>/hqdefault.jpg`.
- **Response-Header-Only Timeouts**: Never pass `AbortSignal.timeout(30_000)` to a streaming `fetch()` proxy — `undici` aborts the response body stream when the timer fires, cutting off video playback at the 30-second mark! Use a manual `AbortController` + `setTimeout` that calls `clearTimeout(timer)` **as soon as `await fetch(...)` resolves response headers**, while wiring `req.signal` (`abort` event) to cancel upstream Range fetches cleanly when the client seeks or disconnects.
- **0-Byte `200 OK` Protection & Domain Hygiene**: Reject `0`-byte / empty `200 OK` bodies on `/api/v1/*` JSON routes as `502` upstream errors instead of forwarding empty bodies that crash `res.json()` in the browser, and auto-evict stale `localStorage` (`kv_invidious_instance`) entries pointing at retired/reassigned domains (`yt.khoavo.myds.me` — now TypeType, `youtube.khoavo.myds.me`) or loopback (`127.0.0.1`, `localhost`).
