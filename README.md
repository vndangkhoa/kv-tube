#
**KV-Tube** is a distraction-free, privacy-focused YouTube frontend designed for a premium viewing experience.

### 🚀 **New Features (v2.0 Updates)**
*   **Horizontal-First Experience**: Strictly enforces horizontal videos across all categories. "Shorts" and vertical content are aggressively filtered out for a cleaner, cinematic feed.
*   **Personalized Discovery**:
    *   **Suggested for You**: Dynamic recommendations based on your local watch history.
    *   **You Might Like**: curated discovery topics to help you find new interests.
*   **Refined Tech Feed**: Specialized "Tech & AI" section focusing on gadget reviews, unboxings, and deep dives (no spammy vertical clips).
*   **Performance**: Optimized fetching limits to ensure rich, full grids of content despite strict filtering.

## Features
*   **No Ads**: Watch videos without interruptions.
*   **Privacy Focused**: No Google account required. Watch history is stored locally (managed by SQLite).
- **Trending**: Browse trending videos by category (Tech, Music, Gaming, etc.).
- **Auto-Captions**: English subtitles automatically enabled if available.
- **AI Summary**: (Optional) Extractive summarization of video content running locally.
- **PWA Ready**: Installable on mobile devices with a responsive drawer layout.
- **Dark/Light Mode**: User preference persisted in settings.

## 🚀 Deployment

### Option A: Docker Compose (Recommended for Synology NAS)

This is the easiest way to run KV-Tube.

1.  Create a folder named `kv-tube` on your NAS/Server.
2.  Copy `docker-compose.yml` into that folder.
3.  Create a `data` folder inside `kv-tube`.
4.  Run the container.

**docker-compose.yml**
```yaml
version: '3.8'

services:
  kv-tube:
    image: vndangkhoa/kvtube:latest
    container_name: kv-tube
    restart: unless-stopped
    ports:
      - "5011:5001"
    volumes:
      - ./data:/app/data
    environment:
      - PYTHONUNBUFFERED=1
      - FLASK_ENV=production
```

**Run Command:**
```bash
docker-compose up -d
```
Access the app at `http://YOUR_NAS_IP:5011`

### Option B: Local Development (Python)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/vndangkhoa/kv-tube.git
    cd kv-tube
    ```

2.  **Install Dependencies:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

3.  **Run:**
    ```bash
    python3 app.py
    ```
    Open `http://127.0.0.1:5001` in your browser.

## 🛠️ Configuration

The app is zero-config by default.
- **Database**: SQLite (stored in `./data/kvtube.db`)
- **Port**: 5001 (internal), mapped to 5011 in Docker compose example.

## 📝 License
Proprietary / Personal Use.
