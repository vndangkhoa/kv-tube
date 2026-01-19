#!/bin/sh
set -e

echo "--- KV-Tube Startup ---"

# 1. Update Core Engines
echo "[Update] Checking for engine updates..."

# Update yt-dlp
echo "[Update] Updating yt-dlp..."
pip install -U yt-dlp || echo "Warning: yt-dlp update failed"



# 2. Check Loader.to Connectivity (Optional verification)
# We won't block startup on this, just log it.
echo "[Update] Engines checked."

# 3. Start Application
echo "[Startup] Launching Gunicorn..."
exec gunicorn --bind 0.0.0.0:5000 --workers 4 --threads 2 --timeout 120 wsgi:app
