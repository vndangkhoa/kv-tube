"""
KV-Tube API Blueprint
All JSON API endpoints for the frontend
"""
from flask import Blueprint, request, jsonify, Response
import os
import sys
import subprocess
import json
import sqlite3
import re
import heapq
import logging
import time
import random
import concurrent.futures
import yt_dlp


logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__, url_prefix='/api')

# Database path
DATA_DIR = os.environ.get("KVTUBE_DATA_DIR", "data")
DB_NAME = os.path.join(DATA_DIR, "kvtube.db")

# Caching
API_CACHE = {}
CACHE_TIMEOUT = 600  # 10 minutes



def get_db_connection():
    """Get database connection with row factory."""
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


# --- Helper Functions ---

def extractive_summary(text, num_sentences=5):
    """Extract key sentences from text using word frequency."""
    # Clean text
    clean_text = re.sub(r"\[.*?\]", "", text)
    clean_text = clean_text.replace("\n", " ")
    
    # Split into sentences
    sentences = re.split(r"(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s", clean_text)
    
    # Calculate word frequencies
    word_frequencies = {}
    stop_words = set([
        "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
        "to", "of", "in", "on", "at", "for", "width", "that", "this", "it",
        "you", "i", "we", "they", "he", "she"
    ])
    
    for word in re.findall(r"\w+", clean_text.lower()):
        if word not in stop_words:
            word_frequencies[word] = word_frequencies.get(word, 0) + 1
    
    if not word_frequencies:
        return "Not enough content to summarize."
    
    # Normalize
    max_freq = max(word_frequencies.values())
    for word in word_frequencies:
        word_frequencies[word] /= max_freq
    
    # Score sentences
    sentence_scores = {}
    for sent in sentences:
        for word in re.findall(r"\w+", sent.lower()):
            if word in word_frequencies:
                sentence_scores[sent] = sentence_scores.get(sent, 0) + word_frequencies[word]
    
    # Get top sentences
    summary_sentences = heapq.nlargest(num_sentences, sentence_scores, key=sentence_scores.get)
    return " ".join(summary_sentences)


def fetch_videos(query, limit=20, filter_type=None, playlist_start=1, playlist_end=None):
    """Fetch videos from YouTube search."""
    try:
        if not playlist_end:
            playlist_end = playlist_start + limit
        
        cmd = [
            sys.executable, "-m", "yt_dlp",
            f"ytsearch{limit}:{query}",
            "--dump-json",
            "--flat-playlist",
            "--no-playlist",
            "--playlist-start", str(playlist_start),
            "--playlist-end", str(playlist_end),
        ]
        
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = proc.communicate()
        
        results = []
        for line in stdout.splitlines():
            try:
                data = json.loads(line)
                video_id = data.get("id")
                if video_id:
                    duration_secs = data.get("duration")
                    
                    # Filter logic
                    if filter_type == "video":
                        if duration_secs and int(duration_secs) <= 70:
                            continue
                        if "#shorts" in (data.get("title") or "").lower():
                            continue
                    
                    # Format duration
                    duration = None
                    if duration_secs:
                        m, s = divmod(int(duration_secs), 60)
                        h, m = divmod(m, 60)
                        duration = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
                    
                    results.append({
                        "id": video_id,
                        "title": data.get("title", "Unknown"),
                        "uploader": data.get("uploader") or data.get("channel") or "Unknown",
                        "channel_id": data.get("channel_id"),
                        "uploader_id": data.get("uploader_id"),
                        "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                        "view_count": data.get("view_count", 0),
                        "upload_date": data.get("upload_date", ""),
                        "duration": duration,
                    })
            except json.JSONDecodeError:
                continue
        return results
    except Exception as e:
        logger.error(f"Error fetching videos: {e}")
        return []


# --- API Routes ---

@api_bp.route("/save_video", methods=["POST"])
def save_video():
    """Deprecated - client-side handled."""
    return jsonify({"success": True, "message": "Use local storage"})


@api_bp.route("/history")
def get_history():
    """Get watch history from database."""
    conn = get_db_connection()
    rows = conn.execute(
        'SELECT video_id as id, title, thumbnail FROM user_videos WHERE type = "history" ORDER BY timestamp DESC LIMIT 50'
    ).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@api_bp.route("/suggested")
def get_suggested():
    """Get suggested videos based on watch history."""
    client_titles = request.args.get("titles", "")
    client_channels = request.args.get("channels", "")
    
    history_titles = []
    history_channels = []
    
    if client_titles:
        history_titles = [t.strip() for t in client_titles.split(",") if t.strip()][:5]
    if client_channels:
        history_channels = [c.strip() for c in client_channels.split(",") if c.strip()][:3]
    
    # Server-side fallback
    if not history_titles:
        try:
            conn = get_db_connection()
            rows = conn.execute(
                'SELECT title FROM user_videos WHERE type = "history" ORDER BY timestamp DESC LIMIT 5'
            ).fetchall()
            conn.close()
            history_titles = [row['title'] for row in rows]
        except Exception as e:
            logger.debug(f"History fetch failed: {e}")
    
    if not history_titles:
        return jsonify(fetch_videos("trending", limit=20))
    
    all_suggestions = []
    queries = []
    
    for title in history_titles[:3]:
        words = title.split()[:4]
        query_base = " ".join(words)
        queries.append(f"{query_base} related -shorts")
    
    for channel in history_channels[:2]:
        queries.append(f"{channel} latest videos -shorts")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(lambda q: fetch_videos(q, limit=8, filter_type="video"), queries))
        for res in results:
            all_suggestions.extend(res)
    
    unique_vids = {v["id"]: v for v in all_suggestions}.values()
    final_list = list(unique_vids)
    random.shuffle(final_list)
    
    return jsonify(final_list[:30])


@api_bp.route("/related")
def get_related_videos():
    """Get related videos for a video."""
    video_id = request.args.get("v")
    title = request.args.get("title")
    uploader = request.args.get("uploader", "")
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 10))

    if not title and not video_id:
        return jsonify({"error": "Video ID or Title required"}), 400

    try:
        topic_limit = limit // 2
        channel_limit = limit - topic_limit
        start = (page - 1) * (limit // 2)

        topic_query = f"{title} related" if title else f"{video_id} related"
        channel_query = uploader if uploader else topic_query

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_topic = executor.submit(fetch_videos, topic_query, limit=topic_limit, playlist_start=start + 1)
            future_channel = executor.submit(fetch_videos, channel_query, limit=channel_limit, playlist_start=start + 1)
            topic_videos = future_topic.result()
            channel_videos = future_channel.result()

        combined = channel_videos + topic_videos
        
        seen = set()
        if video_id:
            seen.add(video_id)
        
        unique_videos = []
        for v in combined:
            if v['id'] not in seen:
                seen.add(v['id'])
                unique_videos.append(v)

        random.shuffle(unique_videos)
        return jsonify(unique_videos)
    except Exception as e:
        logger.error(f"Error fetching related: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/download")
def get_download_url():
    """Get direct MP4 download URL."""
    video_id = request.args.get("v")
    if not video_id:
        return jsonify({"error": "No video ID"}), 400

    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        ydl_opts = {
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best[protocol!*=m3u8]/best",
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "youtube_include_dash_manifest": False,
            "youtube_include_hls_manifest": False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            download_url = info.get("url", "")

            if ".m3u8" in download_url or not download_url:
                formats = info.get("formats", [])
                for f in reversed(formats):
                    f_url = f.get("url", "")
                    if f_url and "m3u8" not in f_url and f.get("ext") == "mp4":
                        download_url = f_url
                        break

            title = info.get("title", "video")

            if download_url and ".m3u8" not in download_url:
                return jsonify({"url": download_url, "title": title, "ext": "mp4"})
            else:
                return jsonify({
                    "error": "Direct download not available. Try a video downloader site.",
                    "fallback_url": url,
                }), 200

    except Exception as e:
        logger.error(f"Download URL error: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/download/formats")
def get_download_formats():
    """Get available download formats for a video."""
    video_id = request.args.get("v")
    if not video_id:
        return jsonify({"success": False, "error": "No video ID"}), 400

    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        ydl_opts = {
            "format": "best",
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "youtube_include_dash_manifest": False,
            "youtube_include_hls_manifest": False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get("title", "Unknown")
            duration = info.get("duration", 0)
            thumbnail = info.get("thumbnail", "")

            video_formats = []
            audio_formats = []
            
            for f in info.get("formats", []):
                f_url = f.get("url", "")
                if not f_url or "m3u8" in f_url:
                    continue
                    
                f_ext = f.get("ext", "")
                quality = f.get("format_note", "") or f.get("format", "") or "Unknown"
                f_filesize = f.get("filesize", 0) or f.get("filesize_approx", 0)
                
                size_str = ""
                if f_filesize:
                    if f_filesize > 1024**3:
                        size_str = f"{f_filesize / 1024**3:.1f} GB"
                    elif f_filesize > 1024**2:
                        size_str = f"{f_filesize / 1024**2:.1f} MB"
                    elif f_filesize > 1024:
                        size_str = f"{f_filesize / 1024:.1f} KB"

                if f_ext in ["mp4", "webm"]:
                    vcodec = f.get("vcodec", "none")
                    acodec = f.get("acodec", "none")
                    
                    if vcodec != "none" and acodec != "none":
                        video_formats.append({
                            "quality": f"{quality} (with audio)",
                            "ext": f_ext,
                            "size": size_str,
                            "url": f_url,
                            "type": "combined",
                            "has_audio": True,
                        })
                    elif vcodec != "none":
                        video_formats.append({
                            "quality": quality,
                            "ext": f_ext,
                            "size": size_str,
                            "url": f_url,
                            "type": "video",
                            "has_audio": False,
                        })
                    elif acodec != "none":
                        audio_formats.append({
                            "quality": quality,
                            "ext": f_ext,
                            "size": size_str,
                            "url": f_url,
                            "type": "audio",
                        })

            def parse_quality(f):
                q = f["quality"].lower()
                for i, res in enumerate(["4k", "2160", "1080", "720", "480", "360", "240", "144"]):
                    if res in q:
                        return i
                return 99

            video_formats.sort(key=parse_quality)
            audio_formats.sort(key=parse_quality)

            return jsonify({
                "success": True,
                "video_id": video_id,
                "title": title,
                "duration": duration,
                "thumbnail": thumbnail,
                "formats": {"video": video_formats[:10], "audio": audio_formats[:5]},
            })

    except Exception as e:
        logger.error(f"Download formats error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/get_stream_info")
def get_stream_info():
    """Get video stream info with caching."""
    video_id = request.args.get("v")
    if not video_id:
        return jsonify({"error": "No video ID"}), 400

    try:
        conn = get_db_connection()
        cached = conn.execute(
            "SELECT data, expires_at FROM video_cache WHERE video_id = ?", (video_id,)
        ).fetchone()

        current_time = time.time()
        if cached:
            try:
                expires_at = float(cached["expires_at"])
                if current_time < expires_at:
                    data = json.loads(cached["data"])
                    conn.close()
                    from urllib.parse import quote
                    proxied_url = f"/video_proxy?url={quote(data['original_url'], safe='')}"
                    data["stream_url"] = proxied_url
                    response = jsonify(data)
                    response.headers["X-Cache"] = "HIT"
                    return response
            except (ValueError, KeyError):
                pass

        url = f"https://www.youtube.com/watch?v={video_id}"
        ydl_opts = {
            "format": "best[ext=mp4]/best",
            "noplaylist": True,
            "quiet": True,
            "skip_download": True,
            "socket_timeout": 10,
            "force_ipv4": True, 
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                logger.warning(f"yt-dlp error for {video_id}: {str(e)}")
                return jsonify({"error": f"Stream extraction failed: {str(e)}"}), 500

        stream_url = info.get("url")
        if not stream_url:
            return jsonify({"error": "No stream URL found"}), 500

        # Log the headers yt-dlp expects us to use
        expected_headers = info.get("http_headers", {})
        logger.info(f"YT-DLP Expected Headers: {expected_headers}")





        response_data = {
            "original_url": stream_url,
            "title": info.get("title", "Unknown"),
            "description": info.get("description", ""),
            "uploader": info.get("uploader", ""),
            "uploader_id": info.get("uploader_id", ""),
            "channel_id": info.get("channel_id", ""),
            "upload_date": info.get("upload_date", ""),
            "view_count": info.get("view_count", 0),
            "related": [],

        }

        from urllib.parse import quote
        proxied_url = f"/video_proxy?url={quote(stream_url, safe='')}"
        response_data["stream_url"] = proxied_url
        


        # Cache it
        expiry = current_time + 3600
        conn.execute(
            "INSERT OR REPLACE INTO video_cache (video_id, data, expires_at) VALUES (?, ?, ?)",
            (video_id, json.dumps(response_data), expiry),
        )
        conn.commit()
        conn.close()

        response = jsonify(response_data)
        response.headers["X-Cache"] = "MISS"
        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/search")
def search():
    """Search for videos."""
    query = request.args.get("q")
    if not query:
        return jsonify({"error": "No query provided"}), 400

    try:
        # Check if URL
        url_match = re.match(r"(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})", query)
        if url_match:
            video_id = url_match.group(1)
            # Fetch single video info
            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                return jsonify([{
                    "id": video_id,
                    "title": info.get("title", "Unknown"),
                    "uploader": info.get("uploader", "Unknown"),
                    "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                    "view_count": info.get("view_count", 0),
                    "upload_date": info.get("upload_date", ""),
                    "duration": None,
                }])

        # Standard search
        results = fetch_videos(query, limit=20, filter_type="video")
        return jsonify(results)

    except Exception as e:
        logger.error(f"Search Error: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/channel")
def get_channel_videos_simple():
    """Get videos from a channel."""
    channel_id = request.args.get("id")
    filter_type = request.args.get("filter_type", "video")
    if not channel_id:
        return jsonify({"error": "No channel ID provided"}), 400

    try:
        # Construct URL
        suffix = "shorts" if filter_type == "shorts" else "videos"
        
        if channel_id.startswith("UC"):
            url = f"https://www.youtube.com/channel/{channel_id}/{suffix}"
        elif channel_id.startswith("@"):
            url = f"https://www.youtube.com/{channel_id}/{suffix}"
        else:
            url = f"https://www.youtube.com/channel/{channel_id}/{suffix}"

        cmd = [
            sys.executable, "-m", "yt_dlp",
            url,
            "--dump-json",
            "--flat-playlist",
            "--playlist-end", "20",
            "--no-warnings",
        ]

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = proc.communicate()

        videos = []
        for line in stdout.splitlines():
            try:
                v = json.loads(line)
                dur_str = None
                if v.get("duration"):
                    m, s = divmod(int(v["duration"]), 60)
                    h, m = divmod(m, 60)
                    dur_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

                videos.append({
                    "id": v.get("id"),
                    "title": v.get("title"),
                    "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
                    "view_count": v.get("view_count") or 0,
                    "duration": dur_str,
                    "upload_date": v.get("upload_date"),
                    "uploader": v.get("uploader") or v.get("channel") or "",
                })
            except json.JSONDecodeError:
                continue

        return jsonify(videos)

    except Exception as e:
        logger.error(f"Channel Fetch Error: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/trending")
def trending():
    """Get trending videos."""
    from flask import current_app
    
    category = request.args.get("category", "all")
    page = int(request.args.get("page", 1))
    sort = request.args.get("sort", "newest")
    region = request.args.get("region", "vietnam")
    
    cache_key = f"trending_{category}_{page}_{sort}_{region}"
    
    # Check cache
    if cache_key in API_CACHE:
        cached_time, cached_data = API_CACHE[cache_key]
        if time.time() - cached_time < CACHE_TIMEOUT:
            return jsonify(cached_data)
    
    try:
        # Category search queries
        queries = {
            "all": "trending videos 2024",
            "music": "music trending",
            "gaming": "gaming trending",
            "news": "news today",
            "tech": "technology reviews 2024",
            "movies": "movie trailers 2024",
            "sports": "sports highlights",
        }
        
        # For 'all' category, always fetch from multiple categories for diverse content
        if category == "all":
            region_suffix = " vietnam" if region == "vietnam" else ""
            
            # Rotate through different queries based on page for variety
            query_sets = [
                [f"trending videos 2024{region_suffix}", f"music trending{region_suffix}", f"tech reviews 2024{region_suffix}"],
                [f"movie trailers 2024{region_suffix}", f"gaming trending{region_suffix}", f"sports highlights{region_suffix}"],
                [f"trending music 2024{region_suffix}", f"viral videos{region_suffix}", f"entertainment news{region_suffix}"],
                [f"tech gadgets{region_suffix}", f"comedy videos{region_suffix}", f"documentary{region_suffix}"],
            ]
            
            # Use different query set based on page to get variety
            query_index = (page - 1) % len(query_sets)
            current_queries = query_sets[query_index]
            
            # Calculate offset within query set
            start_offset = ((page - 1) // len(query_sets)) * 7 + 1
            
            # Fetch from multiple categories in parallel
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                futures = [
                    executor.submit(fetch_videos, q, limit=7, filter_type="video", playlist_start=start_offset)
                    for q in current_queries
                ]
                results = [f.result() for f in futures]
            
            # Combine all videos and deduplicate
            all_videos = []
            seen_ids = set()
            
            for video_list in results:
                for vid in video_list:
                    if vid['id'] not in seen_ids:
                        seen_ids.add(vid['id'])
                        all_videos.append(vid)
            
            # Shuffle for variety
            random.shuffle(all_videos)
            
            # Cache result
            API_CACHE[cache_key] = (time.time(), all_videos)
            return jsonify(all_videos)
        
        # Single category - support proper pagination
        query = queries.get(category, queries["all"])
        if region == "vietnam":
            query += " vietnam"
        
        videos = fetch_videos(query, limit=20, filter_type="video", playlist_start=(page-1)*20+1)
        
        # Cache result
        API_CACHE[cache_key] = (time.time(), videos)
        
        return jsonify(videos)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/summarize")
def summarize_video():
    """Get video summary from transcript."""
    video_id = request.args.get("v")
    if not video_id:
        return jsonify({"error": "No video ID"}), 400

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import TranscriptsDisabled
        
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        try:
            transcript = transcript_list.find_transcript(["en", "vi"])
        except Exception:
            transcript = transcript_list.find_generated_transcript(["en", "vi"])

        transcript_data = transcript.fetch()
        full_text = " ".join([entry["text"] for entry in transcript_data])
        summary = extractive_summary(full_text, num_sentences=7)

        return jsonify({"success": True, "summary": summary})

    except Exception as e:
        return jsonify({"success": False, "message": f"Could not summarize: {str(e)}"})








@api_bp.route("/update_ytdlp", methods=["POST"])
def update_ytdlp():
    """Update yt-dlp to latest version."""
    try:
        cmd = [sys.executable, "-m", "pip", "install", "-U", "yt-dlp"]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode == 0:
            ver_cmd = [sys.executable, "-m", "yt_dlp", "--version"]
            ver_result = subprocess.run(ver_cmd, capture_output=True, text=True)
            version = ver_result.stdout.strip()
            return jsonify({"success": True, "message": f"Updated to {version}"})
        else:
            return jsonify({"success": False, "message": f"Update failed: {result.stderr}"}), 500
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@api_bp.route("/comments")
def get_comments():
    """Get comments for a video."""
    video_id = request.args.get("v")
    if not video_id:
        return jsonify({"error": "No video ID"}), 400

    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        cmd = [
            sys.executable, "-m", "yt_dlp",
            url,
            "--write-comments",
            "--skip-download",
            "--dump-json",
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode == 0:
            data = json.loads(result.stdout)
            comments_data = data.get("comments", [])

            comments = []
            for c in comments_data[:50]:
                comments.append({
                    "author": c.get("author", "Unknown"),
                    "author_thumbnail": c.get("author_thumbnail", ""),
                    "text": c.get("text", ""),
                    "likes": c.get("like_count", 0),
                    "time": c.get("time_text", ""),
                    "is_pinned": c.get("is_pinned", False),
                })

            return jsonify({"comments": comments, "count": data.get("comment_count", len(comments))})
        else:
            return jsonify({"comments": [], "count": 0, "error": "Could not load comments"})

    except subprocess.TimeoutExpired:
        return jsonify({"comments": [], "count": 0, "error": "Comments loading timed out"})
    except Exception as e:
        return jsonify({"comments": [], "count": 0, "error": str(e)})



