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
    ExoPlayer video playback, on-device NewPipeExtractor downloads, bottom navigation,
    dark/light themes, and auto-updates via GitHub/Forgejo releases.
  </td>
  <td width="50%">
    <h3>⬇️ On-device Downloads</h3>
    Download videos directly on your Android device using NewPipeExtractor stream
    extraction. Three quality tiers (Low 360p, Recommended 1080p, Best) with
    background download via WorkManager.
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
    ports:
      - "5011:3000"
      - "8981:8080"
    volumes:
      - ./data:/app/data
    environment:
      - KVTUBE_DATA_DIR=/app/data
      - GIN_MODE=release
      - NODE_ENV=production
      - CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5011
    restart: unless-stopped
```

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

---

## 💻 Development

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
