# KV-Tube

A modern, fast, and fully-featured YouTube-like video streaming platform. Built with a robust Go backend and a highly responsive Next.js frontend, KV-Tube is designed for seamless deployment on systems like Synology NAS via Docker.

## Features

- **Modern Video Player**: High-resolution video playback with HLS support and quality selection.
- **Fast Navigation**: Instant click feedback with skeleton loaders for related videos.
- **Infinite Scrolling**: Scroll seamlessly through a dynamic video grid on the homepage.
- **Watch History & Suggestions**: Keep track of what you've watched, with smart video suggestions.
- **Region Selection**: Tailor your content to specific regions (e.g., Vietnam).
- **Responsive Design**: Beautiful, mobile-friendly interface with light and dark theme support.
- **Containerized**: Fully Dockerized for easy setup using `docker-compose`.

## Architecture
- **Backend & Frontend**: Go (Gin framework) and Next.js are combined into a single unified Docker container using a multi-stage `Dockerfile`. 
- **Process Management**: `supervisord` manages the concurrent execution of the backend API and Next.js frontend within the same network namespace.
- **Data storage**: SQLite is used for watch history, optimized for `linux/amd64`.

## Deployment on Synology NAS

We recommend using Docker Compose for simple and robust deployment.

### 1. Prerequisites
- Docker and Container Manager installed on your Synology NAS.
- Make sure ports `5011` are free, or adjust `docker-compose.yml` to fit your needs.

### 2. Setup

Create a `docker-compose.yml` file matching the one provided in the repository:

```yaml
version: '3.8'

services:
  kv-tube-app:
    image: git.khoavo.myds.me/vndangkhoa/kv-tube-app:v4.0.1
    container_name: kv-tube-app
    restart: unless-stopped
    ports:
      - "5011:3000"
    volumes:
      - ./data:/app/data
    environment:
      - KVTUBE_DATA_DIR=/app/data
      - GIN_MODE=release
      - NODE_ENV=production
```

### 3. Run
In the directory containing your `docker-compose.yml`, run:

```bash
docker-compose up -d
```

The application will be accessible at `http://<your-nas-ip>:5011`.

## Development

- Frontend builds can be started in `frontend/` via `npm run dev`.
- Backend server starts in `backend/` via `go run main.go`.
