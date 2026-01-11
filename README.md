# KV-Tube
**A Distraction-Free, Privacy-Focused YouTube Client**

> [!NOTE] 
> Designed for a premium, cinematic viewing experience.

KV-Tube removes the clutter and noise of modern YouTube, focusing purely on the content you love. It strictly enforces a horizontal-first video policy, aggressively filtering out Shorts and vertical "TikTok-style" content to keep your feed clean and high-quality.

### 🚀 **Key Features (v2.0)**

*   **🚫 Ads-Free & Privacy-First**: Watch without interruptions. No Google account required. All watch history is stored locally on your device (or self-hosted DB).
*   **📺 Horizontal-First Experience**: Say goodbye to "Shorts". The feed only displays horizontal, cinematic content.
*   **🔍 Specialized Feeds**:
    *   **Tech & AI**: Clean feed for gadget reviews and deep dives.
    *   **Trending**: See what's popular across major categories (Music, Gaming, News).
    *   **Suggested for You**: Personalized recommendations based on your local watch history.
*   **🧠 Local AI Integration**:
    *   **Auto-Captions**: Automatically enables English subtitles.
    *   **AI Summary**: (Optional) Generate quick text summaries of videos locally.
*   **⚡ High Performance**: Optimized for speed with smart caching and rate-limit handling.
*   **📱 PWA Ready**: Install on your phone or tablet with a responsive, app-like interface.

---

## 🛠️ Deployment

You can run KV-Tube easily using Docker (recommended for NAS/Servers) or directly with Python.

### Option A: Docker Compose (Recommended)
Ideal for Synology NAS, Unraid, or casual servers.

1.  Create a folder `kv-tube` and add the `docker-compose.yml` file.
2.  Run the container:
    ```bash
    docker-compose up -d
    ```
3.  Access the app at: **http://localhost:5011**

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  kv-tube:
    image: vndangkhoa/kv-tube:v2.1
    container_name: kv-tube
    restart: unless-stopped
    ports:
      - "5011:5000"
    volumes:
      - ./data:/app/data
    environment:
      - PYTHONUNBUFFERED=1
      - FLASK_ENV=production
```

### Option B: Local Development (Python)
For developers or running locally on a PC.

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/vndangkhoa/kv-tube.git
    cd kv-tube
    python -m venv .venv
    # Windows
    .venv\Scripts\activate
    # Linux/Mac
    source .venv/bin/activate
    
    pip install -r requirements.txt
    ```

2.  **Run**:
    ```bash
    python wsgi.py
    ```

3.  Access the app at: **http://localhost:5002**

---

## ⚙️ Configuration

KV-Tube is designed to be "Zero-Config", but you can customize it via Environment Variables (in `.env` or Docker).

| Variable | Default | Description |
| :--- | :--- | :--- |
| `FLASK_ENV` | `production` | Set to `development` for debug mode. |
| `KVTUBE_DATA_DIR` | `./data` | Location for the SQLite database. |
| `KVTUBE_VIDEO_DIR` | `./videos` | (Optional) Location for downloaded videos. |
| `SECRET_KEY` | *(Auto)* | Session security key. Set manually for persistence. |

---

## 🔌 API Endpoints
KV-Tube exposes a RESTful API for its frontend.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/search` | `GET` | Search for videos. |
| `/api/stream_info` | `GET` | Get raw stream URLs (HLS/MP4). |
| `/api/suggested` | `GET` | Get recommendations based on history. |
| `/api/download` | `GET` | Get direct download link for a video. |
| `/api/history` | `GET` | Retrieve local watch history. |

---

## 📜 License
Proprietary / Personal Use. 
Created by **Khoa N.D**
