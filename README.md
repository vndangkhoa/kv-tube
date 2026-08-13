<h1 align="center">🎬 KV-Tube</h1>

<p align="center">
  <strong>Your personal YouTube · Self-hosted, private, lightweight</strong>
</p>

<p align="center">
  <a href="https://github.com/vndangkhoa/kv-tube/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/vndangkhoa/kv-tube?style=flat-square" alt="License" />
  </a>
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go" alt="Go" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/PWA-Yes-5A0FC8?style=flat-square&logo=pwa" alt="PWA" />
  <img src="https://img.shields.io/badge/Android-5.0+-3DDC84?style=flat-square&logo=android" alt="Android" />
  <img src="https://img.shields.io/badge/Kotlin-2.0-7F52FF?style=flat-square&logo=kotlin" alt="Kotlin" />
  <img src="https://img.shields.io/badge/Jetpack%20Compose-Yes-4285F4?style=flat-square" alt="Jetpack Compose" />
</p>

<p align="center">
  <a href="https://github.com/vndangkhoa/kv-tube">
    <img src="https://img.shields.io/badge/Source-GitHub-181717?style=flat-square&logo=github" alt="GitHub" />
  </a>
  <a href="https://git.khoavo.myds.me/vndangkhoa/kv-tube">
    <img src="https://img.shields.io/badge/Source-Forgejo-FF4F4F?style=flat-square&logo=forgejo" alt="Forgejo" />
  </a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-why-kv-tube">Why KV-Tube?</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-development">Development</a> •
  <a href="#-support">Support</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

<p align="center">
  <i>Watch, search, and subscribe — just like YouTube, but fully under your control.</i>
</p>

<!-- TODO: Add a demo screenshot/GIF here -->

## ✨ Features

<table>
<tr>
  <td width="50%">
    <h3>🎞️ Video Playback</h3>
    HLS streaming with adaptive quality — from 144p to 4K.
  </td>
  <td width="50%">
    <h3>📜 Watch History</h3>
    Automatically tracked. Always in sync. Never lose your place.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🔔 Subscriptions</h3>
    Follow any YouTube channel. Get updates instantly.
  </td>
  <td width="50%">
    <h3>🔍 Search</h3>
    Full-text search across videos, channels, and history.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🎵 Background Audio</h3>
    Keep listening with the screen locked — perfect for music.
  </td>
  <td width="50%">
    <h3>📱 PWA</h3>
    Install as a native app. Works offline. Full-screen experience.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🌍 Region Tuning</h3>
    Tailor content and recommendations to any region.
  </td>
  <td width="50%">
    <h3>🌓 Themes</h3>
    Light, dark, and system-following themes out of the box.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>📺 Rich Channel Pages</h3>
    Banner, avatar, description, subscriber & view counts, and infinite-scrolling videos.
  </td>
  <td width="50%">
    <h3>⚡ Fast & Resilient</h3>
    Aggressive caching, multi-client yt-dlp fallback, and lazy metadata hydration.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>📥 Server-side Downloads</h3>
    Download any video straight to your device as an MP4. The server fetches it
    with yt-dlp and streams a live progress bar — no ads, no client-side hacks.
    Pick from three quality tiers: <b>Low</b> (≤360p), <b>Recommended</b> (≤1080p), or <b>Best</b>.
  </td>
  <td width="50%">
    <h3>🧹 Self-cleaning Cache</h3>
    Downloaded files live in a temp server cache (30-minute TTL) and are purged
    automatically — nothing piles up on your disk.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>📱 Android App</h3>
    Native Android client built with Kotlin &amp; Jetpack Compose. Material 3 design,
    ExoPlayer video playback, on-device NewPipeExtractor downloads, share to any app,
    download progress with badge indicator, dark/light themes, and auto-updates
    via GitHub/Forgejo releases.
  </td>
  <td width="50%">
    <h3>⬇️ On-device Downloads</h3>
    Download videos directly on your Android device using NewPipeExtractor stream
    extraction. Three quality tiers (Low 360p, Recommended 1080p, Best) with
    background download via WorkManager. Search, rename, sort, and delete
    downloaded files from the Downloads tab.
  </td>
</tr>
</table>

## 🚀 Quick Start

Pull the pre-built image and run it — no local build needed:

```bash
mkdir -p kv-tube/data && cd kv-tube
curl -O https://raw.githubusercontent.com/vndangkhoa/kv-tube/main/docker-compose.yml
docker compose up -d
```

Prefer building from source?

```bash
git clone https://github.com/vndangkhoa/kv-tube.git
cd kv-tube
mkdir -p data
docker build -t kv-tube:latest .
docker compose up -d
```

> **Note:** When YouTube starts serving the "Sign in to confirm you're not a bot"
> error (common on datacenter IPs), upload a cookies file in
> **Settings → YouTube Cookies** (available from the sidebar). The server also
> needs the [deno](https://deno.com) runtime on `PATH` to solve YouTube's
> JavaScript challenges with cookies — the Docker image bundles it at
> `/app/bin/deno/bin/deno` automatically (Node.js is used as a fallback
> runtime). yt-dlp is kept on the latest nightly build automatically (check/update
> manually from **Settings → yt-dlp**).
>
> The server also fights bot-blocks automatically:
> - **IPv6 first** — YouTube blocks many residential IPv4 routes but allows the
>   same traffic over IPv6. The server probes IPv6 at startup and prefers it
>   when routable, flipping back to IPv4 on network failures. Override with
>   `FORCE_IPV6=1` (always) / `FORCE_IPV6=0` (never). Docker needs a
>   dual-stack network (already configured in `docker-compose.yml`).
> - **Cookies auto-repair** — when YouTube rejects your uploaded cookies they are
>   blacklisted, an anonymous session is auto-refreshed, and the request is
>   retried. If no cookies exist at all, an anonymous session is fetched at
>   boot. Rate limits (HTTP 429) are retried with backoff.

<p align="center">
  <b>Frontend:</b> <a href="http://localhost:5011">http://localhost:5011</a> &nbsp;•&nbsp;
  <b>API:</b> <a href="http://localhost:8981">http://localhost:8981</a>
</p>

### 📥 Container Images

Pre-built images are published to three registries:

| Registry | Image |
|----------|-------|
| **Docker Hub** | `vndangkhoa/kv-tube:latest` |
| **GitHub Container Registry** | `ghcr.io/vndangkhoa/kv-tube:latest` |
| **Forgejo** | `git.khoavo.myds.me/vndangkhoa/kv-tube:latest` |

### 🌐 Source Repositories

The project is mirrored on GitHub and Forgejo — both stay in sync:

- **GitHub:** https://github.com/vndangkhoa/kv-tube
- **Forgejo:** https://git.khoavo.myds.me/vndangkhoa/kv-tube

---

## 🤔 Why KV-Tube?

YouTube is incredible — but it's also ad-ridden, tracks everything, and sometimes removes the videos you love.

KV-Tube gives you:

- **Privacy** — No tracking, no algorithms manipulating you. Your watch history stays on your machine.
- **Permanence** — Videos you subscribe to stay available. No takedowns, no region blocks.
- **Ownership** — Run it on your NAS, your VPS, or a Raspberry Pi. It's yours.
- **Simplicity** — One container. One command. Zero configuration.

## 📖 Backstory

I built KV-Tube because I wanted a way to watch YouTube content without the YouTube baggage — ads, recommendation rabbit holes, and the feeling that the product was me, not the video player.

What started as a simple Go API to proxy video streams evolved into a full-featured frontend with subscriptions, search, PWA support, and a clean, YouTube-like interface. It runs on my Synology NAS at home, and I use it daily.

If that resonates, give it a star ⭐ — it helps others find the project.

---

## 🏗️ Architecture

KV-Tube ships as a single Docker image. Everything runs in one container, managed by supervisord.

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=flat&logo=go" />
  <img src="https://img.shields.io/badge/Gin-008ECF?style=flat&logo=go" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/Supervisord-FF9900?style=flat&logo=superuser" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite" />
  <img src="https://img.shields.io/badge/yt--dlp-FF0000?style=flat&logo=youtube" />
  <img src="https://img.shields.io/badge/FFmpeg-007808?style=flat&logo=ffmpeg" />
</p>

| Layer | Tech | Port | Role |
|-------|------|------|------|
| **Backend** | Go + Gin | `8080` | REST API, video fetching, yt-dlp orchestration |
| **Frontend** | Next.js 16 | `3000` | SSR, PWA, responsive UI |
| **Process Manager** | supervisord | — | Keeps backend + frontend alive |
| **Storage** | SQLite | — | Watch history, subscriptions, metadata |

## 📦 Deployment

### 🐳 Docker Compose (Recommended)

Using the pre-built image from **Docker Hub**:

```yaml
services:
  kv-tube:
    image: vndangkhoa/kv-tube:latest
    container_name: kv-tube
    platform: linux/amd64
    restart: unless-stopped
    ports:
      - "5011:3000"   # Frontend (Next.js)
      - "8981:8080"   # Backend API (Go)
    volumes:
      - ./data:/app/data
      # Optional: mount a valid Netscape cookies.txt for YouTube (read-only is
      # fine — the server stages a writable copy internally):
      # - ./cookies.txt:/app/data/cookies.txt:ro
    environment:
      - KVTUBE_DATA_DIR=/app/data
      # - YTDLP_COOKIES=/app/data/cookies.txt  # Only needed if you mount a file above
      # - FORCE_IPV6=1                         # 1=always IPv6, 0=never, unset=auto probe
      - GIN_MODE=release
      - NODE_ENV=production
      - CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5011
    devices:
      - /dev/ptmx  # Required for downloads (progress parsing via pseudo-terminal)
    dns:
      - 8.8.8.8    # Docker's embedded DNS strips AAAA records; public
      - 1.1.1.1    # resolvers make IPv6 lookups work
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/api/health"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - kvtube-net

networks:
  kvtube-net:
    driver: bridge
    enable_ipv6: true   # Dual-stack: lets the server prefer IPv6 (best weapon
    ipam:               # against YouTube IPv4 bot-blocks). Server auto-falls
      config:           # back to IPv4 when IPv6 isn't routable.
        - subnet: fd00:1234::/64
```

> **Troubleshooting:** if your Docker daemon can't create the IPv6 network
> (pre-20.10, or IPv6 disabled in the daemon), delete the `networks:` block at
> the bottom and remove `networks:` from the service — everything still works
> over IPv4, the IPv6 benefits are simply skipped.

Or pull from another registry — swap the image line:

```yaml
    image: ghcr.io/vndangkhoa/kv-tube:latest
    # image: git.khoavo.myds.me/vndangkhoa/kv-tube:latest
```

Prefer building locally? Replace `image:` with `build: .`.

### 🖥️ Synology NAS (DSM 7.2+)

1. Create folder `/volume1/docker/kv-tube/data`
2. Upload `docker-compose.yml`, `Dockerfile`, `supervisord.conf`
3. In **Container Manager** → **Project** → **Create**, select the folder
4. Done. The container builds and starts automatically.

> **Note for Synology:** DSM 7.2 ships a Docker daemon with IPv6 enabled, so
> the dual-stack network in `docker-compose.yml` works out of the box. Beware
> the "assigned but not routed" trap — many routers hand out IPv6 addresses
> without a working route, so the server's IPv6 probe may fail and fall back
> to IPv4 (which YouTube may bot-block). If IPv4 is blocked, enable IPv6
> routing on your router/ISP, or force the family with `FORCE_IPV6=1`.
> If Project creation fails with a network error, remove the `networks:`
> blocks from the compose file.

### 🛠️ Multi-arch Build

```bash
docker buildx build --platform linux/amd64 -t kv-tube:latest --push .
```

---

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `KVTUBE_DATA_DIR` | `/app/data` | Path for SQLite DB and data |
| `GIN_MODE` | `release` | Gin framework log mode |
| `NODE_ENV` | `production` | Node.js environment |
| `CORS_ALLOWED_ORIGINS` | `""` | Comma-separated allowed origins |
| `PORT` | `8080` | Backend API listen port |
| `FORCE_IPV6` | `auto` | `1` = always IPv6, `0` = always IPv4, unset = probe at startup |
| `YTDLP_COOKIES` | `""` | Path to a Netscape-format cookies.txt passed to yt-dlp |
| `YTDLP_COOKIES_FROM_BROWSER` | `""` | Export cookies from a browser (e.g. `chrome`) |
| `YTDLP_PROXY` | `""` | Route yt-dlp through an HTTP/SOCKS5 proxy |
| `YTDLP_AUTO_UPDATE` | `true` | Keep yt-dlp on the latest nightly build |

---

## 💻 Development

Run the whole stack (backend + frontend) with one command:

```bash
./launch.sh dev     # dev: backend binary + next dev (hot reload)
./launch.sh prod    # prod: GIN_MODE=release build + next build/start
./stop.sh           # stop both services
```

Or start each part manually:

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
go run main.go

# Android App
cd android
# Ensure JAVA_HOME points to JDK 17
./gradlew assembleDebug
# Install on emulator/device
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## 💖 Support the Project

KV-Tube is free, open source, and ad-free — built and maintained in spare time. If it saves you from subscriptions or just brings you joy, I'd love your support to keep the project going:

<p align="center">
  <img src="frontend/public/donation.jpg" alt="Donate to support KV-Tube" width="360" />
</p>

<p align="center">
  Every contribution — no matter how small — means a lot. Thank you! ❤️
</p>

---

## 🤝 Contributing

Contributions are welcome! Here's how to help:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Open a Pull Request

Please make sure to follow existing code style and add tests when possible.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

<p align="center">
  <br />
  <sub>If you find this project useful, please <a href="https://github.com/vndangkhoa/kv-tube">⭐ star it on GitHub</a>.</sub>
  <br />
  <sub>Built with ❤️ by <a href="https://github.com/vndangkhoa">Khoa Vo</a></sub>
</p>
