"""
KV-Tube Streaming Blueprint
Video streaming and proxy routes
"""
from flask import Blueprint, request, Response, stream_with_context, send_from_directory
import requests
import os
import logging
import socket
import urllib3.util.connection as urllib3_cn

# Force IPv4 for requests (which uses urllib3)
def allowed_gai_family():
    return socket.AF_INET

urllib3_cn.allowed_gai_family = allowed_gai_family

logger = logging.getLogger(__name__)

streaming_bp = Blueprint('streaming', __name__)

# Configuration for local video path
VIDEO_DIR = os.environ.get("KVTUBE_VIDEO_DIR", "./videos")


@streaming_bp.route("/stream/<path:filename>")
def stream_local(filename):
    """Stream local video files."""
    return send_from_directory(VIDEO_DIR, filename)


@streaming_bp.route("/video_proxy")
def video_proxy():
    """Proxy video streams with HLS manifest rewriting."""
    url = request.args.get("url")
    if not url:
        return "No URL provided", 400

    # Forward headers to mimic browser and support seeking
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        # "Referer": "https://www.youtube.com/",  # Removed to test if it fixes 403
    }

    # Support Range requests (scrubbing)
    range_header = request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header

    try:
        logger.info(f"Proxying URL: {url}")
        # logger.info(f"Proxy Request Headers: {headers}")
        req = requests.get(url, headers=headers, stream=True, timeout=30)
        
        logger.info(f"Upstream Status: {req.status_code}")
        if req.status_code != 200:
             logger.error(f"Upstream Error Body: {req.text[:500]}")

        # Handle HLS (M3U8) Rewriting - CRITICAL for 1080p+ and proper sync
        content_type = req.headers.get("content-type", "").lower()
        url_path = url.split("?")[0]
        is_manifest = (
            url_path.endswith(".m3u8")
            or "application/x-mpegurl" in content_type
            or "application/vnd.apple.mpegurl" in content_type
        )

        if is_manifest and req.status_code == 200:
            content = req.text
            base_url = url.rsplit("/", 1)[0]
            new_lines = []

            for line in content.splitlines():
                if line.strip() and not line.startswith("#"):
                    # If relative, make absolute
                    if not line.startswith("http"):
                        full_url = f"{base_url}/{line}"
                    else:
                        full_url = line

                    from urllib.parse import quote
                    quoted_url = quote(full_url, safe="")
                    new_lines.append(f"/video_proxy?url={quoted_url}")
                else:
                    new_lines.append(line)

            return Response(
                "\n".join(new_lines), content_type="application/vnd.apple.mpegurl"
            )

        # Standard Stream Proxy (Binary)
        excluded_headers = [
            "content-encoding",
            "content-length",
            "transfer-encoding",
            "connection",
        ]
        response_headers = [
            (name, value)
            for (name, value) in req.headers.items()
            if name.lower() not in excluded_headers
        ]

        return Response(
            stream_with_context(req.iter_content(chunk_size=8192)),
            status=req.status_code,
            headers=response_headers,
            content_type=req.headers.get("content-type"),
        )
    except Exception as e:
        logger.error(f"Proxy Error: {e}")
        return str(e), 500
