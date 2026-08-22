<h1 align="center">🎬 KV-Tube</h1>

<p align="center">
  <strong>Your personal YouTube · Self-hosted, private, lightweight</strong>
</p>

<p align="center">
  <a href="https://github.com/vndangkhoa/kv-tube/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/vndangkhoa/kv-tube?style=flat-square" alt="License" />
  </a>
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Invidious-API-000000?style=flat-square&logo=crystal" alt="Invidious" />
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go" alt="Go" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat-square&logo=pwa" alt="PWA" />
  <img src="https://img.shields.io/badge/Android-5.0+-3DDC84?style=flat-square&logo=android" alt="Android" />
  <img src="https://img.shields.io/badge/Android%20TV-7.0+-00838F?style=flat-square&logo=android" alt="Android TV" />
  <img src="https://img.shields.io/badge/Kotlin-2.1-7F52FF?style=flat-square&logo=kotlin" alt="Kotlin" />
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
  <a href="#%EF%B8%8F-architecture">Architecture</a> •
  <a href="#-native-apps-mobile--tv">Native Apps</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#%EF%B8%8F-configuration">Configuration</a> •
  <a href="#-development">Development</a> •
  <a href="#-support-the-project">Support</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

<p align="center">
  <i>Watch, search, and subscribe — just like YouTube, but fully under your control.</i>
</p>

## ✨ Features

<table>
<tr>
  <td width="50%">
    <h3>🎞️ Adaptive Video Playback</h3>
    HLS and DASH streaming with adaptive quality selector — from 144p up to 4K, including variable playback speeds and subtitle support.
  </td>
  <td width="50%">
    <h3>📜 Watch History & Feed</h3>
    Automatically tracked watch history and personalized feed. Always in sync, never lose your place.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🔔 Subscriptions & Channels</h3>
    Follow any YouTube channel. Rich channel pages with banners, avatars, subscriber/video counts, and infinite-scrolling video lists.
  </td>
  <td width="50%">
    <h3>🔍 Full-Text Search</h3>
    Fast search across videos, channels, and playlists with category filter chips.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🎵 Background Audio & PWA</h3>
    Keep listening with your screen locked. Installable PWA with full-screen experience and offline UI caching.
  </td>
  <td width="50%">
    <h3>🌓 Themes & Region Tuning</h3>
    Modern Materialious-inspired design with Dark, Light, and System themes. Tailor trending content to any region.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>💬 Comments & Engagement</h3>
    Real YouTube comments, like/dislike counts via <b>Return YouTube Dislike (RYD)</b>, and automatic segment skipping powered by <b>SponsorBlock</b>.
  </td>
  <td width="50%">
    <h3>📥 Server & Client Downloads</h3>
    Download videos straight to your device as MP4 with live progress. Multi-tier quality selection: <b>Low</b> (≤360p), <b>Recommended</b> (≤1080p), or <b>Best</b>.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>📱 Native Android Mobile App</h3>
    Kotlin &amp; Jetpack Compose with Material 3. Media3 ExoPlayer, on-device NewPipeExtractor downloads via WorkManager, Room DB history, and auto-updates.
  </td>
  <td width="50%">
    <h3>📺 Native Android TV App</h3>
    10-foot Leanback interface built with Compose for TV. D-pad navigation, Media3 ExoPlayer (HLS/DASH), and customizable Invidious server connection.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🔐 Invidious Account Sync</h3>
    Connect your Invidious account to sync subscriptions, feed, and watch history across all devices with import/export support.
  </td>
  <td width="50%">
    <h3>⚡ Fast, Resilient & Self-cleaning</h3>
    Stream signature decryption via companion, aggressive caching, multi-client fallback, and automated temp file cache purging.
  </td>
</tr>
</table>

---

## 🚀 Quick Start

The recommended production deployment is the **4-container Invidious stack** — Invidious (YouTube backend), PostgreSQL 16, Invidious Companion (stream signature decryptor), and the KV-Tube Next.js frontend. The compose file builds the frontend image from the `frontend/` directory, so clone the full repository first:

```bash
git clone https://github.com/vndangkhoa/kv-tube.git
cd kv-tube
docker compose up -d --build
```

Access the services:
- **KV-Tube Web UI:** [http://localhost:3241](http://localhost:3241)
- **Invidious Backend API:** [http://localhost:7601](http://localhost:7601)

The frontend talks to Invidious server-to-server over an internal Docker bridge network (`172.42.0.0/24`), so no API key is required.

<p align="center">
  <b>Frontend:</b> <a href="http://localhost:3241">http://localhost:3241</a> &nbsp;•&nbsp;
  <b>Invidious API:</b> <a href="http://localhost:7601">http://localhost:7601</a>
</p>

### 📦 Classic All-in-One Image (Legacy Go Backend)

Prefer running everything inside a single standalone container? The classic image (Go/Gin backend + Next.js + yt-dlp managed by supervisord) is also supported:

```bash
git clone https://github.com/vndangkhoa/kv-tube.git
cd kv-tube
docker build -t kv-tube:latest .
docker run -d -p 3241:3000 -p 8080:8080 -v ./data:/app/data kv-tube:latest
```

### 📥 Container Images

Pre-built container images are published to multiple registries:

| Registry | Image |
|----------|-------|
| **Docker Hub** | `vndangkhoa/kv-tube:latest` |
| **GitHub Container Registry** | `ghcr.io/vndangkhoa/kv-tube:latest` |
| **Forgejo** | `git.khoavo.myds.me/vndangkhoa/kv-tube:latest` |

### 🌐 Source Repositories

The project is actively maintained and mirrored across:

- **GitHub:** [https://github.com/vndangkhoa/kv-tube](https://github.com/vndangkhoa/kv-tube)
- **Forgejo:** [https://git.khoavo.myds.me/vndangkhoa/kv-tube](https://git.khoavo.myds.me/vndangkhoa/kv-tube)

---

## 🤔 Why KV-Tube?

YouTube is incredible — but it's also ad-ridden, tracks everything, and frequently changes recommendations based on algorithms rather than your intent.

KV-Tube gives you:

- **Privacy** — No user tracking, no corporate telemetry. Your watch history and subscriptions stay on your instance.
- **Zero Ads & Sponsors** — Integrated SponsorBlock and Return YouTube Dislike support out of the box.
- **Ownership** — Run it on your NAS, home server, VPS, or Raspberry Pi.
- **Multi-Platform** — Web, PWA, native Android mobile app, and native Android TV app.

---

## 🏗️ Architecture

KV-Tube uses a modular architecture with a Next.js 16 frontend powered by a self-hosted Invidious backend:

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react" />
  <img src="https://img.shields.io/badge/Invidious-000000?style=flat&logo=crystal" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql" />
  <img src="https://img.shields.io/badge/TailwindCSS-06B6D4?style=flat&logo=tailwindcss" />
  <img src="https://img.shields.io/badge/Kotlin-7F52FF?style=flat&logo=kotlin" />
</p>

| Service | Technology | Port | Role |
|---------|------------|------|------|
| **kv-tube** (frontend) | Next.js 16, React 19, TailwindCSS | `3241` (mapped to `:3000`) | SSR/PWA UI, media proxies, Invidious API gateway |
| **invidious** | Invidious (Crystal) | `7601` (mapped to `:3000`) | YouTube API proxy, metadata extraction, auth |
| **invidious-db** | PostgreSQL 16 Alpine | internal | Invidious database (channels, playlists, tokens) |
| **companion** | invidious-companion | internal (`:8282`) | Decrypts YouTube stream signatures |
| **backend** *(optional/dev)* | Go 1.25, Gin, SQLite, yt-dlp | `8080` | Standalone backend / development proxy |

### 🔀 Data Flow

```mermaid
flowchart TD
    subgraph Clients["Client Applications"]
        WEB["Browser / PWA<br/>React 19 + Tailwind"]
        MOBILE["Android Mobile App<br/>Compose + ExoPlayer + WorkManager"]
        TV["Android TV App<br/>Compose for TV + Media3"]
    end

    subgraph KVT["KV-Tube Frontend — Next.js 16 (:3241)"]
        RSC["Server Components<br/>Home · Watch · Channel · Search · Feed"]
        API["API Handlers & Proxies<br/>/api/invidious · /api/download<br/>/api/media-proxy · /api/channel-avatar"]
    end

    subgraph INV["Invidious Backend Stack (internal network)"]
        CORE["invidious Core<br/>(:7601 / internal :3000)"]
        DB[("invidious-db<br/>PostgreSQL 16")]
        COMP["companion<br/>signature decryptor (:8282)"]
    end

    YT[("YouTube Servers")]
    SB["SponsorBlock API"]
    RYD["Return YouTube Dislike API"]

    WEB -->|"SSR & client fetch"| KVT
    MOBILE -->|"API & stream extraction"| CORE
    TV -->|"Direct API / Invidious"| CORE
    RSC -->|"Internal HTTP"| CORE
    API -->|"Proxy HTTP"| CORE
    CORE --> DB
    CORE --> COMP
    COMP -->|"Signature Decryption"| YT
    CORE -->|"Scrapes Metadata & Streams"| YT
    WEB -.-> SB
    WEB -.-> RYD
    MOBILE -.-> SB
```

---

## 📱 Native Apps (Mobile & TV)

KV-Tube provides two dedicated, native Android applications built with Kotlin and Jetpack Compose.

### 📲 Android Mobile App (`android-app/`)

A full-featured native client tailored for Android phones and tablets:

- **UI & UX:** Modern Material 3 design matching the KV-Tube web interface.
- **Playback:** Media3 ExoPlayer with adaptive streaming and background audio.
- **On-Device Downloads:** Direct stream extraction using **NewPipeExtractor** with 3 quality tiers (Low ≤360p, Recommended ≤1080p, Best). Background downloads managed reliably via **WorkManager**.
- **Download Manager:** Local Room database tracking with search, sorting (name, date, size, channel), renaming, and deletion.
- **Features:** Subscriptions feed, channel pages, watch history, liked videos, native share sheet, and in-app auto-update checker via GitHub/Forgejo releases.
- **Compatibility:** Android 5.0+ (minSdk 21, compileSdk 35).

```bash
cd android-app
# Build debug APK
./gradlew assembleDebug
# Install on connected device/emulator
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 📺 Android TV App (`android-tv/`)

A dedicated 10-foot Leanback experience built specifically for Android TV and Google TV devices:

- **UI & Navigation:** Built with **Compose for TV** (`tv-material` + `tv-foundation`) with full D-pad remote support and intuitive focus handling.
- **Playback:** Media3 ExoPlayer with seamless HLS and DASH stream support.
- **Invidious Integration:** Connects directly to your self-hosted Invidious instance (default `https://yt.khoavo.myds.me` or configurable via in-app Settings).
- **Authentication:** Invidious session token support for private subscription feeds and history sync.
- **Compatibility:** Android 7.0+ (minSdk 24, compileSdk 35).

```bash
cd android-tv
# Build debug APK
./gradlew :app:assembleDebug
# Install on Android TV
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 📦 Deployment

### 🐳 Docker Compose (Recommended)

The complete stack is defined in [`docker-compose.yml`](docker-compose.yml):

```yaml
services:
  # 1. Invidious PostgreSQL Database
  invidious-db:
    image: postgres:16-alpine
    container_name: Invidious-DB
    hostname: invidious-db
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD", "pg_isready", "-q", "-d", "invidious", "-U", "kemal"]
      timeout: 45s
      interval: 10s
      retries: 10
    volumes:
      - ./data/invidious/db:/var/lib/postgresql/data:rw
    environment:
      POSTGRES_DB: invidious
      POSTGRES_USER: kemal
      POSTGRES_PASSWORD: kemalpw
    restart: unless-stopped
    networks:
      - invidious-net

  # 2. Invidious Companion (YouTube Token Decryptor)
  companion:
    image: quay.io/invidious/invidious-companion:latest
    container_name: Invidious-COMPANION
    hostname: companion
    environment:
      SERVER_SECRET_KEY: KXyzWwrtQlgMiJZA
    cap_drop:
      - ALL
    read_only: false
    tmpfs:
      - /tmp
    volumes:
      - ./data/invidious/companion:/var/tmp:rw
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
    networks:
      - invidious-net

  # 3. Invidious Core Backend Service
  invidious:
    image: quay.io/invidious/invidious:master
    container_name: Invidious
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:3000 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 90s
    hostname: invidious
    user: 1026:100
    security_opt:
      - no-new-privileges:true
    ports:
      - "7601:3000"
    environment:
      INVIDIOUS_CONFIG: |
        db:
          dbname: invidious
          user: kemal
          password: kemalpw
          host: invidious-db
          port: 5432
        check_tables: true
        captcha_enabled: false
        default_user_preferences:
          locale: vn
          region: VN
        external_port: 443
        invidious_companion:
          - private_url: "http://companion:8282/companion"
        invidious_companion_key: KXyzWwrtQlgMiJZA
        hmac_key: e216a52a6d3f8ee752a0bbb4f6a4981b7287c4b39425d510ac86fe499fb8ec6f
        domain: yt.khoavo.myds.me
        https_only: true
    restart: unless-stopped
    depends_on:
      invidious-db:
        condition: service_healthy
      companion:
        condition: service_started
    networks:
      - invidious-net

  # 4. KV-Tube Materialious-Inspired Frontend WebApp
  kv-tube:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        # Browser-facing Invidious URL, inlined into the client bundle at build
        # time (the browser loads the Invidious embed player from this URL).
        - NEXT_PUBLIC_INVIDIOUS_URL=http://127.0.0.1:7601
    image: kv-tube-ui:latest
    container_name: Invidious-Materialious-UI
    restart: unless-stopped
    ports:
      - "3241:3000"
    environment:
      # Internal Invidious docker network URL (fast direct server-to-server)
      - INVIDIOUS_URL=http://invidious:3000
      # Public Invidious instance domain for client-side playback/thumbnails
      - NEXT_PUBLIC_INVIDIOUS_URL=http://127.0.0.1:7601
      - NEXT_PUBLIC_SITE_URL=https://youtube.khoavo.myds.me
      - NEXT_PUBLIC_SPONSORBLOCK_URL=https://sponsor.ajay.app
      - NEXT_PUBLIC_RYD_URL=https://returnyoutubedislikeapi.com
      - NEXT_PUBLIC_DEFAULT_REGION=VN
      - NODE_ENV=production
    depends_on:
      - invidious
    networks:
      - invidious-net

# Bridge network with custom subnet to avoid IPAM conflicts
networks:
  invidious-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.42.0.0/24
          gateway: 172.42.0.1
```

### 🖥️ Synology NAS (DSM 7.2+)

1. Clone or copy this repository to your Synology volume (e.g. `/volume1/docker/kv-tube`).
2. Open **Container Manager** → **Project** → **Create**.
3. Set the project path to the `kv-tube` folder and click **Build / Start**.
4. Access the web interface at `http://<NAS-IP>:3241`.
5. *(Optional)* For direct Synology Package Center installation, check the [KV-Tube SPK Package](https://github.com/vndangkhoa/synology-spk).

---

## ⚙️ Configuration

### Frontend Environment Variables (`docker-compose.yml` / `frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `INVIDIOUS_URL` | `http://invidious:3000` | Internal URL for server-side Next.js to Invidious communication |
| `NEXT_PUBLIC_INVIDIOUS_URL` | `http://127.0.0.1:7601` | Public Invidious instance URL used by browsers for video streams/thumbnails. **Must be passed as a build arg** (`build.args`) — it is inlined into the client bundle at build time |
| `INVIDIOUS_TOKEN` / `NEXT_PUBLIC_INVIDIOUS_TOKEN` | *empty* | Optional default Invidious session token for private feeds/history |
| `NEXT_PUBLIC_SITE_URL` | `https://youtube.khoavo.myds.me` | Public canonical site URL used for Open Graph share previews |
| `NEXT_PUBLIC_SPONSORBLOCK_URL` | `https://sponsor.ajay.app` | SponsorBlock API endpoint for segment skipping |
| `NEXT_PUBLIC_RYD_URL` | `https://returnyoutubedislikeapi.com` | Return YouTube Dislike API endpoint |

> Trending region is not driven by an environment variable — it defaults to `VN` and can be changed per user via the in-app Region Selector (persisted in a cookie).

### Go Backend Environment Variables (`backend/.env` / `.env.example`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Backend listening port |
| `KVTUBE_DATA_DIR` | `./data` | Directory for SQLite database and cached files |
| `GIN_MODE` | `release` | Gin framework mode (`release` or `debug`) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated list of allowed origins or `*` |
| `RATE_LIMIT_RATE` | `300` | API requests allowed per IP per interval (proxy endpoints are exempt) |
| `RATE_LIMIT_INTERVAL` | `1m` | Rate-limit interval window (Go duration, e.g. `30s`, `1m`) |
| `RATE_LIMIT_BURST` | `120` | Rate-limit burst capacity |
| `YTDLP_PROXY` | *empty* | Optional HTTP/SOCKS5 proxy for yt-dlp (`socks5://user:pass@host:port`) |
| `YTDLP_COOKIES` | *empty* | Path to a `cookies.txt` file (required for comments; helps bypass bot-check) |
| `YTDLP_COOKIES_FROM_BROWSER` | *empty* | Export cookies from a local browser instead of a file (non-Docker only) |
| `FORCE_IPV6` | *unset* | Force IPv6 for yt-dlp (`1` = force, `0` = disable, unset = auto-probe) |
| `YTDLP_AUTO_UPDATE` | `true` | Auto-update yt-dlp nightly at startup and every 24h |

---

## 💻 Development

### Using the Unified Launch Script

The repository includes a launcher script to start both Go backend and Next.js frontend concurrently:

```bash
# Start in development mode (hot reload enabled)
./launch.sh dev

# Start in production mode
./launch.sh prod

# Stop running services
./stop.sh
```

### Running Manually

```bash
# 1. Start Frontend (Next.js)
cd frontend
npm install
npm run dev

# 2. Start Backend (Go)
cd backend
go run main.go

# 3. Build Mobile App
cd android-app
./gradlew assembleDebug

# 4. Build TV App
cd android-tv
./gradlew :app:assembleDebug
```

---

## 💖 Support the Project

KV-Tube is free, open source, and ad-free — developed and maintained with care. If it saves you from ads or brings you joy, your support is deeply appreciated:

<p align="center">
  <img src="frontend/public/donation.jpg" alt="Donate to support KV-Tube" width="360" />
</p>

<p align="center">
  Every contribution — no matter how small — helps keep the servers running and development active. Thank you! ❤️
</p>

---

## 🤝 Contributing

Contributions, issues, and feature suggestions are always welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more details.

<p align="center">
  <br />
  <sub>If you find this project useful, please <a href="https://github.com/vndangkhoa/kv-tube">⭐ star it on GitHub</a>!</sub>
  <br />
  <sub>Built with ❤️ by <a href="https://github.com/vndangkhoa">Khoa Vo</a></sub>
</p>
