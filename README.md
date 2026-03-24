# KV-Tube

A modern, fast, and fully-featured YouTube-like video streaming platform. Built with a robust Go backend and a highly responsive Next.js frontend, KV-Tube is designed for seamless deployment on systems like Synology NAS via Docker.

## Features

- **Modern Video Player**: High-resolution video playback with HLS support and quality selection.
- **Fast Navigation**: Instant click feedback with skeleton loaders for related videos.
- **Infinite Scrolling**: Scroll seamlessly through a dynamic video grid on the homepage.
- **Watch History & Suggestions**: Keep track of what you've watched seamlessly! Fully integrated library history tracking.
- **Subscriptions Management**: Keep up to date with seamless subscription updates for YouTube channels.
- **Optimized for Safari**: Stutter-free playback algorithms and high-tolerance Hls.js configurations tailored for macOS users.
- **Background Audio**: Allows videos to continue playing audio when the browser tab is hidden or device locked (perfect for music).
- **Progressive Web App**: Fully installable PWA out of the box with offline fallbacks and custom vector iconography.
- **Region Selection**: Tailor your content to specific regions (e.g., Vietnam).
- **Responsive Design**: Beautiful, mobile-friendly interface with light and dark theme support.
- **Containerized**: Fully Dockerized for easy setup using `docker-compose`.

## Architecture
- **Backend & Frontend**: Go (Gin framework) and Next.js are combined into a single unified Docker container using a multi-stage `Dockerfile`. 
- **Process Management**: `supervisord` manages the concurrent execution of the backend API and Next.js frontend within the same network namespace.
- **Data storage**: SQLite is used for watch history, optimized for `linux/amd64`.

## Deployment on Synology NAS (v4.0.7)

We recommend using **Container Manager** (DSM 7.2+) or **Docker** (DSM 6/7.1) for a robust and easily manageable deployment.

### 1. Prerequisites
- **Container Manager** or **Docker** package installed from Package Center.
- Ensure port `5011` is available on your NAS.
- Create a folder named `kv-tube` in your `docker` shared folder (e.g., `/volume1/docker/kv-tube`).

### 2. Using Container Manager (Recommended)
1. Open **Container Manager** > **Project** > **Create**.
2. Set a Project Name (e.g., `kv-tube`).
3. Set Path to `/volume1/docker/kv-tube`.
4. Source: Select **Create docker-compose.yml** and paste the following:

```yaml
version: '3.8'

services:
  kv-tube:
    image: git.khoavo.myds.me/vndangkhoa/kv-tube:v4.0.7
    container_name: kv-tube
    platform: linux/amd64
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

5. Click **Next** until the end and **Done**. The container will build and start automatically.

### 3. Accessing the App
The application will be accessible at:
- `http://<your-nas-ip>:5011`
- **Mobile Users**: Add to Home Screen via Safari for the full PWA experience with background playback.

## Development

- Frontend builds can be started in `frontend/` via `npm run dev`.
- Backend server starts in `backend/` via `go run main.go`.
