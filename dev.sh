#!/bin/bash
set -e

echo "--- KV-Tube Local Dev Startup ---"

# 1. Check for FFmpeg (Auto-Install Local Static Binary if missing)
if ! command -v ffmpeg &> /dev/null; then
    echo "[Check] FFmpeg not found globally."
    
    # Check local bin
    LOCAL_BIN="$(pwd)/bin"
    if [ ! -f "$LOCAL_BIN/ffmpeg" ]; then
        echo "[Setup] Downloading static FFmpeg for macOS ARM64..."
        mkdir -p "$LOCAL_BIN"
        
        # Download from Martin Riedl's static builds (macOS ARM64)
        curl -L -o ffmpeg.zip "https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip"
        
        echo "[Setup] Extracting FFmpeg..."
        unzip -o -q ffmpeg.zip -d "$LOCAL_BIN"
        rm ffmpeg.zip
        
        # Some zips extract to a subfolder, ensure binary is in bin root
        # (This specific source usually dumps 'ffmpeg' directly, but just in case)
        if [ ! -f "$LOCAL_BIN/ffmpeg" ]; then
             find "$LOCAL_BIN" -name "ffmpeg" -type f -exec mv {} "$LOCAL_BIN" \;
        fi
        
        chmod +x "$LOCAL_BIN/ffmpeg"
    fi
    
    # Add local bin to PATH
    export PATH="$LOCAL_BIN:$PATH"
    echo "[Setup] Using local FFmpeg from $LOCAL_BIN"
fi

if ! command -v ffmpeg &> /dev/null; then
    echo "Error: FFmpeg installation failed. Please install manually."
    exit 1
fi
echo "[Check] FFmpeg found: $(ffmpeg -version | head -n 1)"

# 2. Virtual Environment (Optional but recommended)
if [ ! -d "venv" ]; then
    echo "[Setup] Creating python virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate

# 3. Install Dependencies & Force Nightly yt-dlp
echo "[Update] Installing dependencies..."
pip install -r requirements.txt

echo "[Update] Forcing yt-dlp Nightly update..."
# This matches the aggressive update strategy of media-roller
pip install -U --pre "yt-dlp[default]"

# 4. Environment Variables
export FLASK_APP=wsgi.py
export FLASK_ENV=development
export PYTHONUNBUFFERED=1

# 5. Start Application
echo "[Startup] Starting KV-Tube on http://localhost:5011"
echo "Press Ctrl+C to stop."

# Run with Gunicorn (closer to prod) or Flask (better for debugging)
# Using Gunicorn to match Docker behavior, but with reload for dev
exec gunicorn --bind 0.0.0.0:5011 --workers 2 --threads 2 --reload wsgi:app
