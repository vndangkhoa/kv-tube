# KV-Tube

A modern, self-hosted video streaming platform. Go backend + Next.js frontend in a single Docker container.

## Quick Start

```bash
git clone https://github.com/vndangkhoa/kv-tube.git
cd kv-tube
mkdir -p data
docker build -t kv-tube:latest .
docker compose up -d
```

- **Frontend:** http://localhost:5011
- **API:** http://localhost:8981

## Features

- High-resolution video playback with HLS and quality selection
- Watch history, subscriptions, and search
- Background audio playback (mobile-friendly)
- Progressive Web App (installable)
- Region selection
- Light/dark theme, responsive design
- Infinite scrolling, skeleton loaders

## Architecture

Single unified Docker container running:
- **Backend:** Go (Gin framework) — API server on port 8080
- **Frontend:** Next.js 16 (standalone) — SSR on port 3000
- **Process Manager:** supervisord manages both processes
- **Storage:** SQLite for watch history and metadata

## Deployment

### Docker Compose

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
    restart: unless-stopped
```

### Synology NAS (DSM 7.2+)

1. Create `/volume1/docker/kv-tube/data`
2. Upload `docker-compose.yml`, `Dockerfile`, `supervisord.conf`
3. Open **Container Manager** > **Project** > **Create**
4. Select path `/volume1/docker/kv-tube`, click **Done**

### Multi-arch Build

```bash
docker buildx build --platform linux/amd64 -t kv-tube:latest --push .
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KVTUBE_DATA_DIR` | `/app/data` | Data storage path |
| `GIN_MODE` | `release` | Gin framework mode |
| `NODE_ENV` | `production` | Node environment |
| `CORS_ALLOWED_ORIGINS` | — | Comma-separated allowed CORS origins |
| `PORT` | `8080` | Backend API port |

## Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
go run main.go
```

## Updating

```bash
docker compose pull
docker compose up -d
```

Or enable auto-updates with [Watchtower](https://github.com/containrrr/watchtower).

## License

MIT License — see [LICENSE](LICENSE) for details.
