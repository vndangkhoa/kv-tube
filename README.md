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
  🌐 <b>Language / Ngôn ngữ:</b>
  <a href="#-features"><b>🇬🇧 English</b></a> •
  <a href="#tieng-viet"><b>🇻🇳 Tiếng Việt</b></a>
</p>

---

<p align="center">
  <i>Watch, search, and subscribe — just like YouTube, but fully under your control.</i>
</p>

**Navigation:** [Features](#-features) • [Quick Start](#-quick-start) • [Why KV-Tube?](#-why-kv-tube) • [Architecture](#%EF%B8%8F-architecture) • [Native Apps](#-native-apps-mobile--tv) • [Deployment](#-deployment) • [🖥️ Synology NAS Setup](#%EF%B8%8F-synology-nas-dsm-72) • [Configuration](#%EF%B8%8F-configuration) • [Development](#-development) • [Support](#-support-the-project) • [Contributing](#-contributing)

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

The recommended production deployment is the **4-container Invidious stack** — Invidious (YouTube backend), PostgreSQL 16, Invidious Companion (stream signature decryptor), and the KV-Tube Next.js frontend. Everything pulls pre-built images, so only the compose file is needed:

```bash
mkdir -p kv-tube && cd kv-tube
curl -O https://raw.githubusercontent.com/vndangkhoa/kv-tube/main/docker-compose.yml
docker compose up -d
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

Two images are published, one per deployment mode:

| Image | Contents | Use it for |
|-------|----------|------------|
| `kv-tube-ui` (~485 MB) | Next.js frontend only | The **recommended 4-container stack** (`docker-compose.yml` above) — talks to your Invidious + Companion containers |
| `kv-tube` (~1.1 GB) | Frontend + Go backend + yt-dlp + ffmpeg (supervisord) | **Classic all-in-one mode** — a single standalone container with no Invidious dependency |

Each is available on:

| Registry | Frontend-only (`kv-tube-ui`) | Unified (`kv-tube`) |
|----------|------------------------------|----------------------|
| **Docker Hub** | `vndangkhoa/kv-tube-ui:latest` | `vndangkhoa/kv-tube:latest` |
| **GitHub Container Registry** | `ghcr.io/vndangkhoa/kv-tube-ui:latest` | `ghcr.io/vndangkhoa/kv-tube:latest` |
| **Forgejo** | `git.khoavo.myds.me/vndangkhoa/kv-tube-ui:latest` | `git.khoavo.myds.me/vndangkhoa/kv-tube:latest` |

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
  # Pre-built image (no source build required). To build from source instead,
  # uncomment the build section and run `docker compose up -d --build`.
  kv-tube:
    image: vndangkhoa/kv-tube-ui:latest
    # build:
    #   context: ./frontend
    #   dockerfile: Dockerfile
    #   args:
    #     # Browser-facing Invidious URL, inlined into the client bundle at build time.
    #     - NEXT_PUBLIC_INVIDIOUS_URL=http://127.0.0.1:7601
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

---

### 🖥️ Synology NAS (DSM 7.2+) — Complete Setup Guide

> 👶 **New to Synology/Docker?** Follow the simplified beginner guide instead: **[README-SYNOLOGY.md](README-SYNOLOGY.md)** — 6 easy steps, no terminal needed. *(Có bản tiếng Việt bên trong!)*

This is the recommended way to run KV-Tube at home. Everything runs in Docker via **Container Manager**, no manual builds required.

#### 📋 Requirements

| Requirement | Details |
|-------------|---------|
| **DSM version** | 7.2 or newer (needs **Container Manager**, which replaced the old Docker package) |
| **RAM** | ~2 GB free (Invidious + PostgreSQL + Next.js frontend) |
| **Disk** | ~3 GB for images + a few GB for the database/cache (grows over time) |
| **Network** | Outbound internet access for pulling images and reaching YouTube |

#### Method 1 — Container Manager GUI (no terminal required)

1. **Create the folder**
   Open **File Station** → navigate to your `docker` shared folder (create it if missing, e.g. on `volume1`) → create a sub-folder named `kv-tube`.
   Final path example: `/volume1/docker/kv-tube`.

2. **Download the compose file**
   Download [`docker-compose.yml`](docker-compose.yml) from this repository and upload it into `/docker/kv-tube` via File Station.
   *(Alternative: skip this and paste the YAML directly in step 3.)*

3. **Create the project**
   Open **Package Center** → confirm **Container Manager** is installed → open it → go to **Project** → click **Create**:
   - **Project name:** `kv-tube`
   - **Path:** `/docker/kv-tube`
   - **Source:** choose **Upload docker-compose.yml** and pick the file you downloaded — or choose **Create docker-compose.yml** and paste its contents.

4. **Review settings before finishing** (important):
   - `domain` (inside `INVIDIOUS_CONFIG`) and `NEXT_PUBLIC_SITE_URL`: replace the author's values (`yt.khoavo.myds.me`, `youtube.khoavo.myds.me`) with **your own DDNS hostname** (e.g. `mynas.synology.me`), or leave them as-is if you only use the LAN.
   - `hmac_key` and `SERVER_SECRET_KEY`: **generate your own random values** if you expose the instance publicly (e.g. `openssl rand -hex 32`).
   - `user: 1026:100` (under the `invidious` service): this is the author's NAS UID/GID. Find yours via SSH with `id <your-username>` and adjust accordingly — otherwise the database folder will hit permission errors.
   - Ports `3241` (web UI) and `7601` (Invidious API): change the left-hand side if they conflict with anything on your NAS.

5. **Build & start**
   Click **Next** → skip the *Web portal* setup (you can add a DSM shortcut later) → review the summary → click **Done**.
   Container Manager now pulls the 4 images and starts the stack. First boot (PostgreSQL init + Invidious migrations) takes roughly **1–2 minutes**.

6. **Verify**
   In Container Manager → **Project** → `kv-tube`, all 4 containers should show **Running** (green). Then open:

   | Service | URL |
   |---------|-----|
   | **KV-Tube Web UI** | `http://<NAS-IP>:3241` |
   | **Invidious API** | `http://<NAS-IP>:7601` |

#### Method 2 — SSH (for power users)

Enable SSH in **Control Panel → Terminal & SNMP**, then:

```bash
ssh <admin-user>@<NAS-IP>
sudo -i
mkdir -p /volume1/docker/kv-tube && cd /volume1/docker/kv-tube
curl -O https://raw.githubusercontent.com/vndangkhoa/kv-tube/main/docker-compose.yml
docker compose up -d       # DSM 7.2 ships Compose v2
docker compose logs -f     # watch startup until all services are healthy
```

#### 🔁 Optional: HTTPS via Synology Reverse Proxy

To serve KV-Tube over HTTPS with a real certificate:

1. **Control Panel → Security → Certificate**: import/obtain a certificate for your DDNS hostname (e.g. via Let's Encrypt) and set it as default.
2. **Control Panel → Login Portal → Advanced → Reverse Proxy → Create**:
   - *Source:* HTTPS · hostname `yt.example.com` · port `443`
   - *Destination:* HTTP · `localhost` · port `3241`
3. Update the compose file to match:
   - `NEXT_PUBLIC_SITE_URL=https://yt.example.com`
   - Inside `INVIDIOUS_CONFIG`: `domain: yt.example.com`
4. Rebuild the project (**Project → kv-tube → Action → Build**) — or `docker compose up -d` over SSH.

#### ⬆️ Updating on Synology

Via SSH (simplest):

```bash
cd /volume1/docker/kv-tube
docker compose pull            # pull latest images
docker compose up -d           # recreate changed containers (data volumes persist)
docker image prune -f          # optional: clean up old dangling images
```

Via GUI: **Container Manager → Project → kv-tube → Stop**, then **Action → Build** after editing the compose file — Container Manager re-pulls images during the build. Your data lives in `./data/`, so updates are safe.

#### 🩺 Troubleshooting

| Symptom | Cause & Fix |
|---------|-------------|
| `Invidious` container keeps restarting, log shows DB permission errors | `user: 1026:100` doesn't match your NAS account. Run `id <your-user>` via SSH, update the compose file, then `sudo chown -R <uid>:<gid> /volume1/docker/kv-tube/data` and rebuild. |
| Port 3241 or 7601 already in use | Another package/container uses the port — remap the left side, e.g. `"8241:3000"`. |
| Web UI loads but videos/thumbnails don't play | `NEXT_PUBLIC_INVIDIOUS_URL` must be reachable **from your client device**, not just from the NAS. Use `http://<NAS-IP>:7601` or your reverse-proxy domain. |
| Playback stops working after days | YouTube rotates stream signatures — restart the `Invidious-COMPANION` container (and consider enabling auto-updates for it). |
| Project fails to build with network errors | DSM DNS issues — try again, or set a DNS server in Control Panel → Network, then rebuild. |

#### 📦 Alternative: Native SPK Package

Prefer installing KV-Tube like a regular Package Center app? There is a community-maintained Synology package:

👉 [KV-Tube SPK Package](https://github.com/vndangkhoa/synology-spk)

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

---
---

<h1 align="center" id="tieng-viet">🇻🇳 Tiếng Việt</h1>

<p align="center">
  <strong>YouTube cá nhân của bạn · Tự lưu trữ, riêng tư, siêu nhẹ</strong>
</p>

<p align="center">
  <i>Xem, tìm kiếm và đăng ký kênh — giống hệt YouTube, nhưng hoàn toàn nằm trong tầm kiểm soát của bạn.</i>
</p>

<p align="center">
  🌐 <b>Ngôn ngữ / Language:</b>
  <a href="#-features"><b>🇬🇧 English</b></a> •
  <a href="#tieng-viet"><b>🇻🇳 Tiếng Việt</b></a>
</p>

**Mục lục:** [Tính năng](#-tính-năng) • [Bắt đầu nhanh](#-bắt-đầu-nhanh) • [Tại sao chọn KV-Tube?](#-tại-sao-chọn-kv-tube) • [Kiến trúc](#️-kiến-trúc) • [Ứng dụng gốc](#-ứng-dụng-gốc-di-động--tv) • [Triển khai](#-triển-khai) • [🖥️ Cài đặt trên Synology NAS](#️-synology-nas-dsm-72--hướng-dẫn-đầy-đủ) • [Cấu hình](#️-cấu-hình) • [Phát triển](#-phát-triển) • [Ủng hộ](#-ủng-hộ-dự-án) • [Đóng góp](#-đóng-góp)

## ✨ Tính năng

<table>
<tr>
  <td width="50%">
    <h3>🎞️ Phát video thích ứng</h3>
    Stream HLS và DASH với bộ chọn chất lượng thích ứng — từ 144p đến 4K, kèm tốc độ phát linh hoạt và hỗ trợ phụ đề.
  </td>
  <td width="50%">
    <h3>📜 Lịch sử xem & Bảng tin</h3>
    Tự động ghi lại lịch sử xem và bảng tin cá nhân hóa. Luôn đồng bộ, không bao giờ mất vị trí đang xem.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🔔 Đăng ký kênh & Trang kênh</h3>
    Theo dõi bất kỳ kênh YouTube nào. Trang kênh đầy đủ với banner, ảnh đại diện, số người theo dõi/video và danh sách video cuộn vô hạn.
  </td>
  <td width="50%">
    <h3>🔍 Tìm kiếm toàn văn</h3>
    Tìm kiếm nhanh trên video, kênh và danh sách phát với các chip lọc theo danh mục.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🎵 Nhạc nền & PWA</h3>
    Nghe tiếp nhạc ngay cả khi khóa màn hình. Cài đặt được dưới dạng PWA với trải nghiệm toàn màn hình và cache giao diện offline.
  </td>
  <td width="50%">
    <h3>🌓 Giao diện & Khu vực</h3>
    Thiết kế hiện đại lấy cảm hứng Materialious với chế độ Tối, Sáng và Theo hệ thống. Tùy chỉnh nội dung thịnh hành theo từng khu vực.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>💬 Bình luận & Tương tác</h3>
    Bình luận YouTube thật, số lượt thích/dislike qua <b>Return YouTube Dislike (RYD)</b>, và tự động bỏ qua phân đoạn quảng cáo nhờ <b>SponsorBlock</b>.
  </td>
  <td width="50%">
    <h3>📥 Tải video trên server & thiết bị</h3>
    Tải video về thiết bị dạng MP4 với thanh tiến trình trực tiếp. Ba mức chất lượng: <b>Thấp</b> (≤360p), <b>Đề xuất</b> (≤1080p) hoặc <b>Tốt nhất</b>.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>📱 Ứng dụng di động Android gốc</h3>
    Kotlin &amp; Jetpack Compose với Material 3. Media3 ExoPlayer, tải video ngay trên thiết bị qua NewPipeExtractor + WorkManager, lịch sử bằng Room DB và tự động cập nhật.
  </td>
  <td width="50%">
    <h3>📺 Ứng dụng Android TV gốc</h3>
    Giao diện Leanback "10-foot" xây bằng Compose for TV. Điều khiển D-pad, Media3 ExoPlayer (HLS/DASH), kết nối máy chủ Invidious tùy chỉnh.
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>🔐 Đồng bộ tài khoản Invidious</h3>
    Kết nối tài khoản Invidious để đồng bộ đăng ký kênh, bảng tin và lịch sử xem trên mọi thiết bị, hỗ trợ nhập/xuất dữ liệu.
  </td>
  <td width="50%">
    <h3>⚡ Nhanh, bền bỉ & tự dọn dẹp</h3>
    Giải mã chữ ký stream qua companion, caching tích cực, fallback đa client và tự động dọn dẹp cache tạm định kỳ.
  </td>
</tr>
</table>

---

## 🚀 Bắt đầu nhanh

Triển khai production được khuyến nghị là **stack Invidious 4 container** — Invidious (backend YouTube), PostgreSQL 16, Invidious Companion (giải mã chữ ký stream) và frontend Next.js của KV-Tube. Mọi thứ đều dùng image dựng sẵn nên chỉ cần file compose:

```bash
mkdir -p kv-tube && cd kv-tube
curl -O https://raw.githubusercontent.com/vndangkhoa/kv-tube/main/docker-compose.yml
docker compose up -d
```

Truy cập các dịch vụ:
- **Giao diện web KV-Tube:** [http://localhost:3241](http://localhost:3241)
- **API backend Invidious:** [http://localhost:7601](http://localhost:7601)

Frontend nói chuyện với Invidious theo kiểu server-to-server qua mạng bridge nội bộ của Docker (`172.42.0.0/24`), nên **không cần API key**.

### 📦 Image All-in-One cổ điển (backend Go cũ)

Thích chạy tất cả trong một container độc lập? Image cổ điển (backend Go/Gin + Next.js + yt-dlp quản lý bởi supervisord) vẫn được hỗ trợ:

```bash
git clone https://github.com/vndangkhoa/kv-tube.git
cd kv-tube
docker build -t kv-tube:latest .
docker run -d -p 3241:3000 -p 8080:8080 -v ./data:/app/data kv-tube:latest
```

### 📥 Container Image

Có 2 image được phát hành, tương ứng với mỗi chế độ triển khai:

| Image | Nội dung | Dùng khi nào |
|-------|----------|--------------|
| `kv-tube-ui` (~485 MB) | Chỉ frontend Next.js | **Stack 4 container được khuyến nghị** (xem `docker-compose.yml`) — giao tiếp với container Invidious + Companion của bạn |
| `kv-tube` (~1.1 GB) | Frontend + backend Go + yt-dlp + ffmpeg (supervisord) | **Chế độ all-in-one cổ điển** — một container độc lập, không phụ thuộc Invidious |

Mỗi image đều có sẵn trên:

| Registry | Chỉ frontend (`kv-tube-ui`) | Đầy đủ (`kv-tube`) |
|----------|------------------------------|----------------------|
| **Docker Hub** | `vndangkhoa/kv-tube-ui:latest` | `vndangkhoa/kv-tube:latest` |
| **GitHub Container Registry** | `ghcr.io/vndangkhoa/kv-tube-ui:latest` | `ghcr.io/vndangkhoa/kv-tube:latest` |
| **Forgejo** | `git.khoavo.myds.me/vndangkhoa/kv-tube-ui:latest` | `git.khoavo.myds.me/vndangkhoa/kv-tube:latest` |

### 🌐 Kho mã nguồn

Dự án được bảo trì liên tục và nhân bản trên:

- **GitHub:** [https://github.com/vndangkhoa/kv-tube](https://github.com/vndangkhoa/kv-tube)
- **Forgejo:** [https://git.khoavo.myds.me/vndangkhoa/kv-tube](https://git.khoavo.myds.me/vndangkhoa/kv-tube)

---

## 🤔 Tại sao chọn KV-Tube?

YouTube rất tuyệt — nhưng cũng đầy quảng cáo, theo dõi mọi hoạt động và thường xuyên đề xuất dựa trên thuật toán thay vì ý muốn của bạn.

KV-Tube mang lại cho bạn:

- **Quyền riêng tư** — Không theo dõi người dùng, không telemetry. Lịch sử xem và đăng ký kênh nằm trên instance của chính bạn.
- **Không quảng cáo & không sponsor** — Tích hợp sẵn SponsorBlock và Return YouTube Dislike ngay từ đầu.
- **Sở hữu** — Chạy trên NAS, home server, VPS hoặc Raspberry Pi của bạn.
- **Đa nền tảng** — Web, PWA, ứng dụng Android di động gốc và ứng dụng Android TV gốc.

---

## 🏗️ Kiến trúc

KV-Tube dùng kiến trúc mô-đun với frontend Next.js 16 vận hành trên backend Invidious tự host:

| Dịch vụ | Công nghệ | Cổng | Vai trò |
|---------|-----------|------|---------|
| **kv-tube** (frontend) | Next.js 16, React 19, TailwindCSS | `3241` (map vào `:3000`) | UI SSR/PWA, proxy media, cổng API Invidious |
| **invidious** | Invidious (Crystal) | `7601` (map vào `:3000`) | Proxy API YouTube, trích xuất metadata, xác thực |
| **invidious-db** | PostgreSQL 16 Alpine | nội bộ | Cơ sở dữ liệu Invidious (kênh, playlist, token) |
| **companion** | invidious-companion | nội bộ (`:8282`) | Giải mã chữ ký stream YouTube |
| **backend** *(tùy chọn/dev)* | Go 1.25, Gin, SQLite, yt-dlp | `8080` | Backend độc lập / proxy môi trường dev |

*(Sơ đồ luồng dữ liệu chi tiết — xem phần tiếng Anh bên trên.)*

---

## 📱 Ứng dụng gốc (Di động & TV)

KV-Tube cung cấp 2 ứng dụng Android gốc, xây bằng Kotlin và Jetpack Compose.

### 📲 Ứng dụng di động Android (`android-app/`)

Client native đầy đủ tính năng dành cho điện thoại và tablet Android:

- **UI & UX:** Thiết kế Material 3 hiện đại, khớp với giao diện web KV-Tube.
- **Phát media:** Media3 ExoPlayer với adaptive streaming và nghe nền.
- **Tải ngay trên thiết bị:** Trích stream trực tiếp bằng **NewPipeExtractor** với 3 mức chất lượng (Thấp ≤360p, Đề xuất ≤1080p, Tốt nhất). Tải nền đáng tin cậy qua **WorkManager**.
- **Trình quản lý tải:** Room database cục bộ với tìm kiếm, sắp xếp (tên, ngày, dung lượng, kênh), đổi tên và xóa.
- **Tính năng:** Feed đăng ký kênh, trang kênh, lịch sử xem, video đã thích, share sheet hệ thống và trình tự động kiểm tra cập nhật qua bản phát hành GitHub/Forgejo.
- **Tương thích:** Android 5.0+ (minSdk 21, compileSdk 35).

```bash
cd android-app
# Build APK debug
./gradlew assembleDebug
# Cài lên thiết bị/emulator đang kết nối
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 📺 Ứng dụng Android TV (`android-tv/`)

Trải nghiệm Leanback "10-foot" được xây riêng cho Android TV và Google TV:

- **UI & Điều hướng:** Xây bằng **Compose for TV** (`tv-material` + `tv-foundation`), hỗ trợ đầy đủ remote D-pad và xử lý focus trực quan.
- **Phát media:** Media3 ExoPlayer hỗ trợ mượt mà cả stream HLS và DASH.
- **Tích hợp Invidious:** Kết nối thẳng tới Invidious tự host của bạn (mặc định `https://yt.khoavo.myds.me`, có thể đổi trong Cài đặt trên ứng dụng).
- **Xác thực:** Hỗ trợ token phiên Invidious cho feed đăng ký riêng tư và đồng bộ lịch sử xem.
- **Tương thích:** Android 7.0+ (minSdk 24, compileSdk 35).

```bash
cd android-tv
# Build APK debug
./gradlew :app:assembleDebug
# Cài lên Android TV
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 📦 Triển khai

Stack đầy đủ được định nghĩa trong [`docker-compose.yml`](docker-compose.yml) — xem nội dung YAML chi tiết ở [phần tiếng Anh](#-deployment) bên trên.

---

### 🖥️ Synology NAS (DSM 7.2+) — Hướng dẫn đầy đủ

> 👶 **Mới dùng Synology/Docker?** Hãy theo dõi hướng dẫn đơn giản dành cho người mới: **[README-SYNOLOGY.md](README-SYNOLOGY.md)** — 6 bước dễ dàng, không cần terminal.

Đây là cách khuyến nghị để chạy KV-Tube tại nhà. Mọi thứ chạy trong Docker thông qua **Container Manager**, không cần build thủ công.

#### 📋 Yêu cầu

| Yêu cầu | Chi tiết |
|---------|----------|
| **Phiên bản DSM** | 7.2 trở lên (cần **Container Manager** — gói mới thay thế Docker cũ) |
| **RAM** | Trống ~2 GB (Invidious + PostgreSQL + frontend Next.js) |
| **Ổ đĩa** | ~3 GB cho image + vài GB cho database/cache (sẽ tăng dần) |
| **Mạng** | Có kết nối internet ra ngoài để kéo image và truy cập YouTube |

#### Cách 1 — Giao diện Container Manager (không cần terminal)

1. **Tạo thư mục**
   Mở **File Station** → vào thư mục chia sẻ `docker` (tạo mới nếu chưa có, ví dụ trên `volume1`) → tạo thư mục con tên `kv-tube`.
   Đường dẫn ví dụ: `/volume1/docker/kv-tube`.

2. **Tải file compose**
   Tải [`docker-compose.yml`](docker-compose.yml) từ repository này rồi upload vào `/docker/kv-tube` qua File Station.
   *(Hoặc bỏ qua bước này và dán trực tiếp YAML ở bước 3.)*

3. **Tạo Project**
   Mở **Trung tâm gói (Package Center)** → chắc chắn **Container Manager** đã cài → mở nó → chọn **Project** → bấm **Create**:
   - **Tên project:** `kv-tube`
   - **Đường dẫn:** `/docker/kv-tube`
   - **Nguồn:** chọn **Upload docker-compose.yml** và trỏ tới file vừa tải — hoặc chọn **Create docker-compose.yml** rồi dán nội dung vào.

4. **Kiểm tra thiết lập trước khi hoàn tất** (quan trọng):
   - `domain` (bên trong `INVIDIOUS_CONFIG`) và `NEXT_PUBLIC_SITE_URL`: thay giá trị của tác giả (`yt.khoavo.myds.me`, `youtube.khoavo.myds.me`) bằng **hostname DDNS của bạn** (ví dụ `mynas.synology.me`), hoặc giữ nguyên nếu chỉ dùng trong mạng LAN.
   - `hmac_key` và `SERVER_SECRET_KEY`: **tự sinh giá trị ngẫu nhiên riêng** nếu bạn public ra internet (ví dụ lệnh `openssl rand -hex 32`).
   - `user: 1026:100` (trong service `invidious`): đây là UID/GID trên NAS của tác giả. Xem UID/GID của bạn qua SSH bằng lệnh `id <tên-user>` rồi chỉnh lại — nếu không, thư mục database sẽ bị lỗi quyền.
   - Cổng `3241` (web UI) và `7601` (API Invidious): đổi phía trái nếu bị trùng với dịch vụ khác trên NAS.

5. **Build & khởi động**
   Bấm **Next** → bỏ qua bước *Web portal* (có thể tạo shortcut DSM sau) → xem lại tổng kết → bấm **Done**.
   Container Manager sẽ kéo 4 image và khởi động stack. Lần chạy đầu (khởi tạo PostgreSQL + migration của Invidious) mất khoảng **1–2 phút**.

6. **Kiểm tra**
   Trong Container Manager → **Project** → `kv-tube`, cả 4 container phải hiển thị **Running** (màu xanh). Sau đó mở:

   | Dịch vụ | Địa chỉ |
   |---------|---------|
   | **Giao diện web KV-Tube** | `http://<IP-NAS>:3241` |
   | **API Invidious** | `http://<IP-NAS>:7601` |

#### Cách 2 — SSH (dành cho người dùng nâng cao)

Bật SSH trong **Control Panel → Terminal & SNMP**, rồi:

```bash
ssh <user-admin>@<IP-NAS>
sudo -i
mkdir -p /volume1/docker/kv-tube && cd /volume1/docker/kv-tube
curl -O https://raw.githubusercontent.com/vndangkhoa/kv-tube/main/docker-compose.yml
docker compose up -d       # DSM 7.2 có sẵn Compose v2
docker compose logs -f     # theo dõi khởi động tới khi mọi dịch vụ healthy
```

#### 🔁 Tùy chọn: HTTPS qua Reverse Proxy của Synology

Để chạy KV-Tube qua HTTPS với chứng chỉ thật:

1. **Control Panel → Security → Certificate**: nhập/tạo chứng chỉ cho hostname DDNS của bạn (qua Let's Encrypt) và đặt làm mặc định.
2. **Control Panel → Login Portal → Advanced → Reverse Proxy → Create**:
   - *Nguồn:* HTTPS · hostname `yt.example.com` · cổng `443`
   - *Đích:* HTTP · `localhost` · cổng `3241`
3. Cập nhật file compose cho khớp:
   - `NEXT_PUBLIC_SITE_URL=https://yt.example.com`
   - Trong `INVIDIOUS_CONFIG`: `domain: yt.example.com`
4. Build lại project (**Project → kv-tube → Action → Build**) — hoặc chạy `docker compose up -d` qua SSH.

#### ⬆️ Cập nhật trên Synology

Qua SSH (đơn giản nhất):

```bash
cd /volume1/docker/kv-tube
docker compose pull            # kéo image mới nhất
docker compose up -d           # tạo lại các container thay đổi (volume dữ liệu được giữ nguyên)
docker image prune -f          # tùy chọn: dọn image cũ rác
```

Qua giao diện: **Container Manager → Project → kv-tube → Stop**, sau đó sửa file compose rồi **Action → Build** — Container Manager sẽ tự kéo lại image khi build. Dữ liệu nằm trong `./data/` nên việc cập nhật an toàn.

#### 🩺 Xử lý sự cố

| Hiện tượng | Nguyên nhân & cách khắc phục |
|------------|------------------------------|
| Container `Invidious` liên tục restart, log báo lỗi quyền DB | `user: 1026:100` không khớp tài khoản NAS của bạn. Chạy `id <tên-user>` qua SSH, sửa lại compose, rồi `sudo chown -R <uid>:<gid> /volume1/docker/kv-tube/data` và build lại. |
| Cổng 3241 hoặc 7601 bị chiếm | Gói/container khác đang dùng cổng đó — đổi map, ví dụ `"8241:3000"`. |
| Web UI load được nhưng video/thumbnail không chạy | `NEXT_PUBLIC_INVIDIOUS_URL` phải truy cập được **từ thiết bị khách**, không chỉ từ NAS. Dùng `http://<IP-NAS>:7601` hoặc domain reverse-proxy của bạn. |
| Xem video được vài ngày rồi lỗi | YouTube xoay vòng chữ ký stream — restart container `Invidious-COMPANION` (nên bật tự động cập nhật cho nó). |
| Build project lỗi mạng | Lỗi DNS của DSM — thử lại, hoặc đặt DNS trong Control Panel → Network rồi build lại. |

#### 📦 Lựa chọn khác: Gói SPK native

Muốn cài KV-Tube như ứng dụng thường trong Package Center? Có gói Synology được bảo trì riêng:

👉 [Gói KV-Tube SPK](https://github.com/vndangkhoa/synology-spk)

---

## ⚙️ Cấu hình

### Biến môi trường Frontend (`docker-compose.yml` / `frontend/.env`)

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `INVIDIOUS_URL` | `http://invidious:3000` | URL nội bộ để Next.js phía server giao tiếp với Invidious |
| `NEXT_PUBLIC_INVIDIOUS_URL` | `http://127.0.0.1:7601` | URL Invidious công khai mà trình duyệt dùng để lấy stream/thumbnail. **Phải truyền qua build arg** (`build.args`) — được nhúng vào bundle client lúc build |
| `INVIDIOUS_TOKEN` / `NEXT_PUBLIC_INVIDIOUS_TOKEN` | *trống* | Token phiên Invidious mặc định (tùy chọn) cho feed/lịch sử riêng tư |
| `NEXT_PUBLIC_SITE_URL` | `https://youtube.khoavo.myds.me` | URL công khai của site, dùng cho preview chia sẻ Open Graph |
| `NEXT_PUBLIC_SPONSORBLOCK_URL` | `https://sponsor.ajay.app` | Endpoint SponsorBlock để tự bỏ phân đoạn quảng cáo |
| `NEXT_PUBLIC_RYD_URL` | `https://returnyoutubedislikeapi.com` | Endpoint API Return YouTube Dislike |

> Khu vực thịnh hành không điều khiển bằng biến môi trường — mặc định là `VN` và người dùng có thể đổi qua Region Selector trong ứng dụng (lưu vào cookie).

### Biến môi trường Backend Go (`backend/.env` / `.env.example`)

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `8080` | Cổng lắng nghe của backend |
| `KVTUBE_DATA_DIR` | `./data` | Thư mục chứa SQLite database và file cache |
| `GIN_MODE` | `release` | Chế độ framework Gin (`release` hoặc `debug`) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,...` | Danh sách origin được phép, phân cách bởi dấu phẩy, hoặc `*` |
| `RATE_LIMIT_RATE` | `300` | Số request API tối đa mỗi IP trong một chu kỳ (riêng endpoint proxy được miễn) |
| `RATE_LIMIT_INTERVAL` | `1m` | Chu kỳ giới hạn (định dạng duration của Go, vd `30s`, `1m`) |
| `RATE_LIMIT_BURST` | `120` | Dung lượng burst của giới hạn |
| `YTDLP_PROXY` | *trống* | Proxy HTTP/SOCKS5 tùy chọn cho yt-dlp (`socks5://user:pass@host:port`) |
| `YTDLP_COOKIES` | *trống* | Đường dẫn tới file `cookies.txt` (bắt buộc cho bình luận; giúp qua màn bot-check) |
| `YTDLP_COOKIES_FROM_BROWSER` | *trống* | Xuất cookies từ trình duyệt local thay vì file (chỉ chạy ngoài Docker) |
| `FORCE_IPV6` | *bỏ trống* | Ép IPv6 cho yt-dlp (`1` = ép, `0` = tắt, bỏ trống = tự dò) |
| `YTDLP_AUTO_UPDATE` | `true` | Tự cập nhật yt-dlp khi khởi động và mỗi 24 giờ |

---

## 💻 Phát triển

### Dùng script khởi chạy thống nhất

Repository có sẵn script khởi chạy để bật đồng thời backend Go và frontend Next.js:

```bash
# Chạy chế độ dev (hot reload)
./launch.sh dev

# Chạy chế độ production
./launch.sh prod

# Dừng các dịch vụ đang chạy
./stop.sh
```

### Chạy thủ công

```bash
# 1. Khởi động Frontend (Next.js)
cd frontend
npm install
npm run dev

# 2. Khởi động Backend (Go)
cd backend
go run main.go

# 3. Build ứng dụng di động
cd android-app
./gradlew assembleDebug

# 4. Build ứng dụng TV
cd android-tv
./gradlew :app:assembleDebug
```

---

## 💖 Ủng hộ dự án

KV-Tube miễn phí, mã nguồn mở và không quảng cáo — được phát triển và bảo trì bằng cả tâm huyết. Nếu nó giúp bạn thoát khỏi quảng cáo hoặc mang lại niềm vui, mọi đóng góp đều đáng trân quý:

<p align="center">
  <img src="frontend/public/donation.jpg" alt="Ủng hộ KV-Tube" width="360" />
</p>

<p align="center">
  Mỗi đóng góp — dù nhỏ — giúp duy trì máy chủ và phát triển liên tục. Cảm ơn bạn! ❤️
</p>

---

## 🤝 Đóng góp

Các đóng góp, báo lỗi và đề xuất tính năng luôn được chào đón!

1. Fork repository
2. Tạo nhánh tính năng (`git checkout -b feature/amazing-feature`)
3. Commit thay đổi (`git commit -m 'feat: add amazing feature'`)
4. Push lên nhánh (`git push origin feature/amazing-feature`)
5. Mở Pull Request

---

## 📄 Giấy phép

Phân phối theo **Giấy phép MIT**. Xem [`LICENSE`](LICENSE) để biết thêm chi tiết.

<p align="center">
  <br />
  <sub>Nếu dự án hữu ích với bạn, hãy <a href="https://github.com/vndangkhoa/kv-tube">⭐ star trên GitHub</a> nhé!</sub>
  <br />
  <sub>Xây dựng với ❤️ bởi <a href="https://github.com/vndangkhoa">Khoa Vo</a></sub>
</p>
