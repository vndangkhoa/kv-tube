# KV-Tube

A modern, fast, and fully-featured YouTube-like video streaming platform. Built with a robust Go backend and a highly responsive Next.js frontend, KV-Tube is designed for seamless deployment on systems like Synology NAS via Docker.

## Features

- **Modern Video Player**: High-resolution video playback with HLS support and quality selection.
- **Watch Page Controls**: Fullscreen mode, loop playback, and wide mode for enhanced viewing experience.
- **Custom Branding**: Consistent KV-Tube iconography throughout the app.
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

## Docker Deployment (v9)

### Quick Start (Local Build)

1. Clone or download this repository
2. Create a `data` folder in the project directory
3. Build and run the container:

```bash
# Build the image
docker build -t kv-tube:latest .

# Run the container
docker-compose up -d
```

### Building & Tagging for Registry

To build and push to your custom registry:

```bash
# Build with your registry and tag
docker build -t your-registry.com/kv-tube:latest .

# Push to registry
docker push your-registry.com/kv-tube:latest
```

### Pre-built Image

If using the pre-built image from Forgejo registry:

```bash
# Pull from Forgejo
docker pull git.khoavo.myds.me/vndangkhoa/kv-tube:v9

# Or tag as latest for local use
docker tag git.khoavo.myds.me/vndangkhoa/kv-tube:v9 kv-tube:latest
```

## Deployment on Synology NAS

We recommend using **Container Manager** (DSM 7.2+) for the best experience. You can also use **Docker** package (DSM 6/7.1).

### Option 1: Using Container Manager (DSM 7.2+) - Recommended

#### Step 1: Prepare the folder
1. Open **File Station** and navigate to your docker folder (e.g., `/volume1/docker/`)
2. Create a new folder named `kv-tube`
3. Inside `kv-tube`, create a `data` subfolder

#### Step 2: Upload files
Upload the following files to `/volume1/docker/kv-tube/`:
- `docker-compose.yml`
- `Dockerfile`
- `supervisord.conf`

#### Step 3: Create Project
1. Open **Container Manager** > **Project** > **Create**
2. Project Name: `kv-tube`
3. Path: `/volume1/docker/kv-tube`
4. Source: Select **docker-compose.yml** (it will auto-detect from the folder)
5. Click **Next** > **Done**

The container will build and start automatically.

#### Step 4: Access the App
- **Frontend**: `http://<your-nas-ip>:5011`
- **Backend API**: `http://<your-nas-ip>:8981`

---

### Option 2: Using Docker Package (DSM 6/7.1)

#### Step 1: Pull the image
Open **Docker** > **Registry** and search for `kv-tube`, or use SSH to pull:

```bash
docker pull kv-tube:latest
```

#### Step 2: Create Container
1. Open **Docker** > **Container** > **Create**
2. Image: `kv-tube:latest` (or your custom registry URL)
3. Container Name: `kv-tube`
4. Network: `Bridge`
5. Port Forwarding:
   - Local Port: `5011` → Container Port: `3000`
   - Local Port: `8981` → Container Port: `8080`
6. Volume: Map `/volume1/docker/kv-tube/data` → `/app/data`
7. Environment:
   - `KVTUBE_DATA_DIR=/app/data`
   - `GIN_MODE=release`
   - `NODE_ENV=production`
8. Restart Policy: `unless-stopped`

#### Step 3: Start Container
Click **Create** and then start the container.

---

### Option 3: Using Docker Compose (SSH)

Connect to your NAS via SSH and run:

```bash
# Navigate to your kv-tube folder
cd /volume1/docker/kv-tube

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

### Mobile PWA Installation

For the best mobile experience:
1. Open `http://<your-nas-ip>:5011` in Safari (iOS) or Chrome (Android)
2. Tap **Share** > **Add to Home Screen** (iOS)
3. Or tap **Install** (Android)

This gives you a native app-like experience with background audio playback.

---

### Updating the Container

**Using Container Manager:**
1. Stop the container
2. Remove the image
3. Pull new image or rebuild
4. Start the container

**Using Docker Compose:**
```bash
cd /volume1/docker/kv-tube
docker-compose pull
docker-compose up -d
```

**Using Watchtower (auto-update):**
The container label enables Watchtower for automatic updates:
```bash
docker run --detach \
    --name watchtower \
    --volume /var/run/docker.sock:/var/run/docker.sock \
    --volume /your/path/config:/config \
    containrrr/watchtower \
    --include-stopped \
    --schedule "0 2 * * *" \
    kv-tube
```

---

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Container won't start | Check logs: `docker logs kv-tube` or via Container Manager |
| Port conflicts | Ensure ports 5011 and 8981 are not used by other services |
| Permission denied | SSH to NAS: `sudo chmod -R 755 /volume1/docker/kv-tube/data` |
| Slow playback | Lower video quality or ensure sufficient network bandwidth |
| Cannot access frontend | Check firewall settings on Synology |

## Development

- Frontend builds can be started in `frontend/` via `npm run dev`.
- Backend server starts in `backend/` via `go run main.go`.
