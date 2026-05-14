<p align="center">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/MIT License-yellow?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License" />
</p>

<h1 align="center">🎬 KV-Tube</h1>

<p align="center">
  <strong>Self-hosted video streaming platform</strong><br />
  Go backend + Next.js frontend — single Docker container
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#development">Development</a>
</p>

---

<h2>🚀 Quick Start</h2>

```bash
git clone https://github.com/vndangkhoa/kv-tube.git
cd kv-tube
mkdir -p data
docker build -t kv-tube:latest .
docker compose up -d
```

<p align="center">
  <b>Frontend:</b> <code>http://localhost:5011</code> &nbsp;•&nbsp;
  <b>API:</b> <code>http://localhost:8981</code>
</p>

---

<h2>✨ Features</h2>

<table>
<tr>
<td>🎞️</td>
<td><b>Video Playback</b><br/>HLS streaming with quality selection</td>
<td>📜</td>
<td><b>Watch History</b><br/>Track what you've watched</td>
</tr>
<tr>
<td>🔔</td>
<td><b>Subscriptions</b><br/>Follow YouTube channels</td>
<td>🔍</td>
<td><b>Search</b><br/>Find videos instantly</td>
</tr>
<tr>
<td>🎵</td>
<td><b>Background Audio</b><br/>Play with screen locked</td>
<td>📱</td>
<td><b>PWA</b><br/>Install as native app</td>
</tr>
<tr>
<td>🌍</td>
<td><b>Region Selection</b><br/>Tailor content by region</td>
<td>🌓</td>
<td><b>Themes</b><br/>Light & dark mode</td>
</tr>
</table>

---

<h2>🏗️ Architecture</h2>

<p align="center">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" />
  <img src="https://img.shields.io/badge/Gin-008ECF?style=flat&logo=gin&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Supervisord-FF9900?style=flat&logo=superuser&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/yt--dlp-FF0000?style=flat&logo=youtube&logoColor=white" />
  <img src="https://img.shields.io/badge/FFmpeg-007808?style=flat&logo=ffmpeg&logoColor=white" />
</p>

Single unified Docker container running:

| Component | Tech | Port | Role |
|-----------|------|------|------|
| **Backend** | Go + Gin | `8080` | REST API, video processing, yt-dlp |
| **Frontend** | Next.js 16 | `3000` | SSR, PWA, UI |
| **Process Manager** | supervisord | — | Manages both processes |
| **Storage** | SQLite | — | Watch history & metadata |

---

<h2>📦 Deployment</h2>

<h3>🐳 Docker Compose</h3>

```yaml
services:
  kv-tube:
    build: .
    container_name: kv-tube
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

<h3>🖥️ Synology NAS (DSM 7.2+)</h3>

<ol>
  <li>Create <code>/volume1/docker/kv-tube/data</code></li>
  <li>Upload <code>docker-compose.yml</code>, <code>Dockerfile</code>, <code>supervisord.conf</code></li>
  <li>Open <b>Container Manager</b> > <b>Project</b> > <b>Create</b></li>
  <li>Select path <code>/volume1/docker/kv-tube</code>, click <b>Done</b></li>
</ol>

<h3>🛠️ Multi-arch Build</h3>

```bash
docker buildx build --platform linux/amd64 -t kv-tube:latest --push .
```

---

<h2>⚙️ Environment Variables</h2>

| Variable | Default | Description |
|----------|---------|-------------|
| `KVTUBE_DATA_DIR` | `/app/data` | Data storage path |
| `GIN_MODE` | `release` | Gin framework mode |
| `NODE_ENV` | `production` | Node environment |
| `CORS_ALLOWED_ORIGINS` | — | Comma-separated allowed CORS origins |
| `PORT` | `8080` | Backend API port |

---

<h2>💻 Development</h2>

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
go run main.go
```

---

<h2>🔄 Updating</h2>

```bash
docker compose pull
docker compose up -d
```

Or enable auto-updates with <a href="https://github.com/containrrr/watchtower">Watchtower</a>.

---

<h2>📄 License</h2>

<p>
  <img src="https://img.shields.io/github/license/vndangkhoa/kv-tube?style=flat" alt="License" />
</p>

MIT License — see <a href="LICENSE">LICENSE</a> for details.
