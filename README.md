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
    <h3>💬 Comments & Engagement</h3>
    Real YouTube comments, comment counts, likes, and dislikes — powered by
    Invidious + SponsorBlock &amp; Return YouTube Dislike integration.
  </td>
  <td width="50%">
    <h3>📥 Server-side Downloads</h3>
    Download any video straight to your device as an MP4. The server fetches it
    with yt-dlp and streams a live progress bar — no ads, no client-side hacks.
    Pick from three quality tiers: <b>Low</b> (≤360p), <b>Recommended</b> (≤1080p), or <b>Best</b>.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🔐 Invidious Account Sync</h3>
    Optionally connect your Invidious account: subscriptions, feed, and watch
    history sync automatically across devices, with import/export support.
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

The recommended deployment is a 4-container stack — **Invidious** (YouTube API
backend), **PostgreSQL**, the **Invidious Companion** (stream signature
decryptor), and the KV-Tube frontend:

```bash
mkdir -p kv-tube && cd kv-tube
curl -O https://raw.githubusercontent.com/vndangkhoa/kv-tube/main/docker-compose.yml
docker compose up -d --build
```

Then open **http://localhost:3241** (KV-Tube UI) — Invidious itself listens on
**http://localhost:7601**. The frontend talks to Invidious server-to-server
over an internal Docker network, so no Invidious API key is needed.

Prefer running everything in a single container? The classic all-in-one image
(Go backend + Next.js + yt-dlp, managed by supervisord) is still published:

```bash
git clone https://github.com/vndangkhoa/kv-tube.git
cd kv-tube
docker build -t kv-tube:latest .
docker run -d -p 5011:3000 -p 8981:8080 -v ./data:/app/data kv-tube:latest
```

> **Note:** with the Invidious stack, no YouTube cookies are required — the
> Invidious instance handles extraction and the frontend proxies streams
> through `/api/invidious`. If your Invidious instance requires auth for
> subscriptions/feed sync, generate an API token in the Invidious account
> settings and paste it in **KV-Tube → Settings → Invidious Token**.

<p align="center">
  <b>Frontend:</b> <a href="http://localhost:3241">http://localhost:3241</a> &nbsp;•&nbsp;
  <b>Invidious API:</b> <a href="http://localhost:7601">http://localhost:7601</a>
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
- **Simplicity** — One `docker compose up`. Zero configuration.

## 📖 Backstory

I built KV-Tube because I wanted a way to watch YouTube content without the YouTube baggage — ads, recommendation rabbit holes, and the feeling that the product was me, not the video player.

What started as a simple Go API to proxy video streams evolved into a full-featured frontend with subscriptions, search, PWA support, and a clean, YouTube-like interface. It runs on my Synology NAS at home, and I use it daily.

If that resonates, give it a star ⭐ — it helps others find the project.

---

## 🏗️ Architecture

KV-Tube is a thin, Materialious-inspired frontend on top of a self-hosted
[Invidious](https://invidious.io) instance. A Docker Compose stack runs four
services on an internal network:

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/Invidious-000000?style=flat&logo=crystal" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql" />
  <img src="https://img.shields.io/badge/TailwindCSS-06B6D4?style=flat&logo=tailwindcss" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript" />
</p>

| Service | Tech | Port | Role |
|---------|------|------|------|
| **kv-tube** (frontend) | Next.js 16 + Tailwind | `3241` | SSR/PWA UI, API proxy to Invidious |
| **invidious** | Invidious (Crystal) | `7601` | YouTube metadata, streams, search, auth |
| **invidious-db** | PostgreSQL 16 | internal | Invidious state (channels, users, tokens) |
| **companion** | invidious-companion | internal | Decrypts YouTube stream signatures |

The classic single-image build (Go/Gin + yt-dlp + SQLite under supervisord)
still exists as a legacy fallback — see the root `Dockerfile`.

## 📦 Deployment

### 🐳 Docker Compose (Recommended)

The stack is defined in the repo's `docker-compose.yml`:

```yaml
services:
  invidious-db:        # PostgreSQL 16 — Invidious state
    image: postgres:16-alpine
    volumes: ["./data/invidious/db:/var/lib/postgresql/data:rw"]
    healthcheck: { test: ["CMD", "pg_isready", "-q", "-d", "invidious", "-U", "kemal"] }

  companion:           # YouTube stream-signature decryptor
    image: quay.io/invidious/invidious-companion:latest
    volumes: ["./data/invidious/companion:/var/tmp/youtubei.js:rw"]

  invidious:           # The Invidious API backend
    image: quay.io/invidious/invidious:master
    ports: ["7601:3000"]
    depends_on: [invidious-db, companion]
    environment:
      INVIDIOUS_CONFIG: |   # db creds, companion URL, hmac key, domain...

  kv-tube:             # The KV-Tube frontend (built from ./frontend)
    build: ./frontend
    ports: ["3241:3000"]
    environment:
      - INVIDIOUS_URL=http://invidious:3000        # server-to-server
      - NEXT_PUBLIC_INVIDIOUS_URL=https://yt.your.domain  # client-side streams/thumbnails
      - NEXT_PUBLIC_SITE_URL=https://tube.your.domain
      - NEXT_PUBLIC_SPONSORBLOCK_URL=https://sponsor.ajay.app
      - NEXT_PUBLIC_RYD_URL=https://returnyoutubedislikeapi.com

networks:
  invidious-net: { driver: bridge, ipam: { config: [{ subnet: "172.42.0.0/24" }] } }
```

Full, working file: [`docker-compose.yml`](docker-compose.yml). Set
`NEXT_PUBLIC_INVIDIOUS_URL` to your public Invidious URL (e.g.
`https://yt.khoavo.myds.me`) so the browser can reach it for playback and
thumbnails; behind a reverse proxy, expose `7601` and `3241`.

The all-in-one legacy image is also still available — swap registries freely:

```yaml
    image: vndangkhoa/kv-tube:latest     # Docker Hub
    # image: ghcr.io/vndangkhoa/kv-tube:latest   # GitHub Container Registry
    # image: git.khoavo.myds.me/vndangkhoa/kv-tube:latest  # Forgejo
```

> **Note:** the classic single-container image runs the Go backend + Next.js
> frontend with supervisord and expects `docker run -p 5011:3000 -p 8981:8080`
> with a `./data` volume — see the legacy section of the Quick Start.

### 🖥️ Synology NAS (DSM 7.2+)

1. Copy this folder to the NAS (`/volume1/docker/kv-tube`).
2. In **Container Manager** → **Project** → **Create**, select the folder.
3. Done — the compose stack builds and starts. Open `http://<NAS-IP>:3241`.
   For one-click install via Package Center, use the
   [KV-Tube SPK](https://github.com/vndangkhoa/synology-spk) instead.

### 🛠️ Multi-arch Build

```bash
docker buildx build --platform linux/amd64 -t kv-tube:latest --push .
```

---

## ⚙️ Configuration

### Frontend (`docker-compose.yml` → `kv-tube` service)

| Variable | Description |
|----------|-------------|
| `INVIDIOUS_URL` | Internal Invidious URL for server-side calls (e.g. `http://invidious:3000`) |
| `NEXT_PUBLIC_INVIDIOUS_URL` | Public Invidious URL used by the browser for playback/thumbnails |
| `NEXT_PUBLIC_SITE_URL` | Public KV-Tube URL (share previews, PWA) |
| `NEXT_PUBLIC_SPONSORBLOCK_URL` | SponsorBlock API endpoint |
| `NEXT_PUBLIC_RYD_URL` | Return YouTube Dislike API endpoint |
| `NEXT_PUBLIC_DEFAULT_REGION` | Default region for trending/content (e.g. `VN`) |

### Invidious (`INVIDIOUS_CONFIG` in `docker-compose.yml`)

Key settings: `db` (Postgres credentials — must match the `invidious-db`
service), `invidious_companion` + `invidious_companion_key` (stream signature
decryption), `hmac_key` (session signing — keep secret), `domain` +
`https_only` (public URL). See the
[Invidious configuration docs](https://docs.invidious.io/configuration/) for
the full reference.

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
cd android-app
# Ensure JAVA_HOME points to JDK 17
./gradlew assembleDebug
# Install on emulator/device
adb install -r app/build/outputs/apk/debug/app-debug.apk
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
