# KV-Tube

A YouTube-like video streaming web application with a pixel-perfect YouTube dark theme UI.

## Recent Updates (v1.1)
- 🚀 **Performance**: Reduced Docker image size by using static `ffmpeg`.
- 📱 **Mobile UI**: Improved 2-column video grid layout and compact sort options on mobile.
- 📦 **NAS Support**: Fixed permission issues by running as root and added multi-arch support (AMD64/ARM64).

## Features

- 🎬 **YouTube Video Playback** - Stream any YouTube video via HLS proxy
- 🎨 **YouTube Dark Theme** - Pixel-perfect recreation of YouTube's UI
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🔍 **Search** - Search YouTube videos directly
- 📚 **Library** - Save videos and view history
- 🎯 **Categories** - Browse by Music, Gaming, News, Sports, etc.
- 🖥️ **Local Videos** - Play local video files

## Quick Start (Docker)

### Build and Run

```bash
# Build the image
docker build -t kv-tube .

# Run the container
docker run -d -p 5001:5001 --name kv-tube kv-tube
```

### Using Docker Compose

```bash
docker-compose up -d
```

Access the app at: http://localhost:5001

## Synology NAS Deployment

### Option 1: Container Manager (Docker)

1. Open **Container Manager** on your Synology NAS
2. Go to **Project** → **Create**
3. Upload the `docker-compose.yml` file
4. Click **Build** and wait for completion
5. Access via `http://your-nas-ip:5001`

### Option 2: Manual Docker

```bash
# SSH into your NAS
ssh admin@your-nas-ip

# Navigate to your docker folder
cd /volume1/docker

# Clone/copy the project
git clone <repo-url> kv-tube
cd kv-tube

# Build and run
docker-compose up -d
```

## Project Structure

```
kv-tube/
├── app.py              # Flask application
├── requirements.txt    # Python dependencies
├── Dockerfile          # Docker build config
├── docker-compose.yml  # Docker Compose config
├── templates/          # HTML templates
│   ├── layout.html     # Base layout (header, sidebar)
│   ├── index.html      # Home page
│   ├── watch.html      # Video player page
│   └── ...
├── static/
│   ├── css/style.css   # YouTube-style CSS
│   └── js/main.js      # Frontend JavaScript
└── kctube.db           # SQLite database
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_ENV` | production | Flask environment |
| `PYTHONUNBUFFERED` | 1 | Python output buffering |

## Tech Stack

- **Backend**: Flask + Gunicorn
- **Frontend**: Vanilla JS + Artplayer
- **Video**: yt-dlp + HLS.js
- **Database**: SQLite
- **Container**: Docker

## License

MIT
