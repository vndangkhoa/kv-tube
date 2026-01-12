"""
KV-Tube Pages Blueprint
HTML page routes for the web interface
"""
from flask import Blueprint, render_template, request, url_for

pages_bp = Blueprint('pages', __name__)


@pages_bp.route("/")
def index():
    """Home page with trending videos."""
    return render_template("index.html", page="home")


@pages_bp.route("/results")
def results():
    """Search results page."""
    query = request.args.get("search_query", "")
    return render_template("index.html", page="results", query=query)


@pages_bp.route("/my-videos")
def my_videos():
    """User's saved videos page (client-side rendered)."""
    return render_template("my_videos.html")


@pages_bp.route("/settings")
def settings():
    """Settings page."""
    return render_template("settings.html", page="settings")


@pages_bp.route("/downloads")
def downloads():
    """Downloads page."""
    return render_template("downloads.html", page="downloads")


@pages_bp.route("/watch")
def watch():
    """Video watch page."""
    from flask import url_for as flask_url_for
    
    video_id = request.args.get("v")
    local_file = request.args.get("local")

    if local_file:
        return render_template(
            "watch.html",
            video_type="local",
            src=flask_url_for("streaming.stream_local", filename=local_file),
            title=local_file,
        )

    if not video_id:
        return "No video ID provided", 400
    return render_template("watch.html", video_type="youtube", video_id=video_id)


@pages_bp.route("/channel/<channel_id>")
def channel(channel_id):
    """Channel page with videos list."""
    import sys
    import subprocess
    import json
    import logging
    
    logger = logging.getLogger(__name__)
    
    if not channel_id:
        from flask import redirect, url_for as flask_url_for
        return redirect(flask_url_for("pages.index"))

    try:
        # Robustness: Resolve name to ID if needed
        real_id_or_url = channel_id
        is_search_fallback = False
        
        # If channel_id is @UCN... format, strip the @ to get the proper UC ID
        if channel_id.startswith("@UC"):
            real_id_or_url = channel_id[1:]

        if not real_id_or_url.startswith("UC") and not real_id_or_url.startswith("@"):
            search_cmd = [
                sys.executable,
                "-m",
                "yt_dlp",
                f"ytsearch1:{channel_id}",
                "--dump-json",
                "--default-search",
                "ytsearch",
                "--no-playlist",
            ]
            try:
                proc_search = subprocess.run(search_cmd, capture_output=True, text=True)
                if proc_search.returncode == 0:
                    first_result = json.loads(proc_search.stdout.splitlines()[0])
                    if first_result.get("channel_id"):
                        real_id_or_url = first_result.get("channel_id")
                        is_search_fallback = True
            except Exception as e:
                logger.debug(f"Channel search fallback failed: {e}")

        # Fetch basic channel info
        channel_info = {
            "id": real_id_or_url,
            "title": channel_id if not is_search_fallback else "Loading...",
            "avatar": None,
            "banner": None,
            "subscribers": None,
        }

        # Determine target URL for metadata fetch
        target_url = real_id_or_url
        if target_url.startswith("UC"):
            target_url = f"https://www.youtube.com/channel/{target_url}"
        elif target_url.startswith("@"):
            target_url = f"https://www.youtube.com/{target_url}"

        cmd = [
            sys.executable,
            "-m",
            "yt_dlp",
            target_url,
            "--dump-json",
            "--flat-playlist",
            "--playlist-end",
            "1",
            "--no-warnings",
        ]

        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        stdout, stderr = proc.communicate()

        if stdout:
            try:
                first = json.loads(stdout.splitlines()[0])
                channel_info["title"] = (
                    first.get("channel")
                    or first.get("uploader")
                    or channel_info["title"]
                )
                channel_info["id"] = first.get("channel_id") or channel_info["id"]
            except json.JSONDecodeError as e:
                logger.debug(f"Channel JSON parse failed: {e}")
        
        # If title is still just the ID, try to get channel name
        if channel_info["title"].startswith("UC") or channel_info["title"].startswith("@"):
            try:
                name_cmd = [
                    sys.executable,
                    "-m",
                    "yt_dlp",
                    target_url,
                    "--print", "channel",
                    "--playlist-items", "1",
                    "--no-warnings",
                ]
                name_proc = subprocess.run(name_cmd, capture_output=True, text=True, timeout=15)
                if name_proc.returncode == 0 and name_proc.stdout.strip():
                    channel_info["title"] = name_proc.stdout.strip()
            except Exception as e:
                logger.debug(f"Channel name fetch failed: {e}")

        return render_template("channel.html", channel=channel_info)

    except Exception as e:
        return f"Error loading channel: {str(e)}", 500
