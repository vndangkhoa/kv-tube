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


def add_cors_headers(response):
    """Add CORS headers to allow video playback from any origin."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Range, Content-Type"
    response.headers["Access-Control-Expose-Headers"] = "Content-Length, Content-Range, Accept-Ranges"
    return response


@streaming_bp.route("/video_proxy", methods=["GET", "OPTIONS"])
def video_proxy():
    """Proxy video streams with HLS manifest rewriting."""
    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = Response("")
        return add_cors_headers(response)
    
    url = request.args.get("url")
    if not url:
        return "No URL provided", 400

    # Forward headers to mimic browser and support seeking
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.youtube.com/",
        "Origin": "https://www.youtube.com",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
    }
    
    # Override with propagated headers (h_*)
    for key, value in request.args.items():
        if key.startswith("h_"):
            header_name = key[2:]  # Remove 'h_' prefix
            headers[header_name] = value

    # Support Range requests (scrubbing)
    range_header = request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header

    try:
        logger.info(f"Proxying URL: {url[:100]}...")
        req = requests.get(url, headers=headers, stream=True, timeout=30)
        
        logger.info(f"Upstream Status: {req.status_code}, Content-Type: {req.headers.get('content-type', 'unknown')}")
        if req.status_code != 200 and req.status_code != 206:
            logger.error(f"Upstream Error: {req.status_code}")

        # Handle HLS (M3U8) Rewriting - CRITICAL for 1080p+ and proper sync
        content_type = req.headers.get("content-type", "").lower()
        url_path = url.split("?")[0]
        
        # Improved manifest detection - YouTube may send text/plain or octet-stream
        is_manifest = (
            url_path.endswith(".m3u8")
            or "mpegurl" in content_type
            or "m3u8" in url_path.lower()
            or ("/playlist/" in url.lower() and "index.m3u8" in url.lower())
        )
        
        logger.info(f"Is Manifest: {is_manifest}, Status: {req.status_code}")

        # Handle 200 and 206 (partial content) responses for manifests
        if is_manifest and req.status_code in [200, 206]:
            content = req.text
            base_url = url.rsplit("/", 1)[0]
            new_lines = []
            
            logger.info(f"Rewriting manifest with {len(content.splitlines())} lines")

            for line in content.splitlines():
                line_stripped = line.strip()
                if line_stripped and not line_stripped.startswith("#"):
                    # URL line - needs rewriting
                    if not line_stripped.startswith("http"):
                        # Relative URL - make absolute
                        full_url = f"{base_url}/{line_stripped}"
                    else:
                        # Absolute URL
                        full_url = line_stripped

                    from urllib.parse import quote
                    quoted_url = quote(full_url, safe="")
                    new_line = f"/video_proxy?url={quoted_url}"
                    
                    # Propagate existing h_* params to segments
                    query_string = request.query_string.decode("utf-8")
                    h_params = [p for p in query_string.split("&") if p.startswith("h_")]
                    if h_params:
                        param_str = "&".join(h_params)
                        new_line += f"&{param_str}"
                    
                    new_lines.append(new_line)
                else:
                    new_lines.append(line)

            rewritten_content = "\n".join(new_lines)
            logger.info(f"Manifest rewritten successfully")
            
            response = Response(
                rewritten_content, content_type="application/vnd.apple.mpegurl"
            )
            return add_cors_headers(response)

        # Standard Stream Proxy (Binary) - for video segments and other files
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

        response = Response(
            stream_with_context(req.iter_content(chunk_size=8192)),
            status=req.status_code,
            headers=response_headers,
            content_type=req.headers.get("content-type"),
        )
        return add_cors_headers(response)
        
    except Exception as e:
        logger.error(f"Proxy Error: {e}")
        return str(e), 500

