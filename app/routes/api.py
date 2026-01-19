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
from app.services.settings import SettingsService
from app.services.summarizer import TextRankSummarizer
from app.services.gemini_summarizer import summarize_with_gemini, extract_key_points_with_gemini
from app.services.youtube import YouTubeService
from app.services.transcript_service import TranscriptService


logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__, url_prefix='/api')

# Database path
DATA_DIR = os.environ.get("KVTUBE_DATA_DIR", "data")
DB_NAME = os.path.join(DATA_DIR, "kvtube.db")

# Caching
API_CACHE = {}
CACHE_TIMEOUT = 60  # 1 minute for fresher content



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
    """Fetch videos from YouTube search using yt_dlp library."""
    try:
        import yt_dlp
        
        # Calculate optimal search limit
        search_limit = playlist_end if playlist_end else (playlist_start + limit)
        
        ydl_opts = {
            'headers': {'User-Agent': 'Mozilla/5.0'},
            'skip_download': True,
            'extract_flat': True,
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'playliststart': playlist_start,
            'playlistend': search_limit,
        }
        
        # We search for enough items to cover the range
        # Note: yt-dlp 'ytsearchN' fetches N items maximum.
        search_query = f"ytsearch{search_limit}:{query}"
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_query, download=False)
            
            results = []
            if not info:
                return []
                
            entries = info.get('entries', [])
            
            for data in entries:
                if not data: continue
                
                video_id = data.get("id")
                if not video_id: continue
                
                # Filter logic
                if filter_type == "video":
                     # In flat extraction, duration is decimal seconds
                     duration_secs = data.get("duration")
                     if duration_secs and int(duration_secs) <= 70:
                         continue
                     title = (data.get("title") or "").lower()
                     if "#shorts" in title:
                         continue
                
                # Format duration
                duration = None
                duration_secs = data.get("duration")
                if duration_secs:
                    m, s = divmod(int(duration_secs), 60)
                    h, m = divmod(m, 60)
                    duration = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
                
                # Robust view count
                vc = data.get("view_count")
                if vc is None:
                    vc = 0
                
                results.append({
                    "id": video_id,
                    "title": data.get("title", "Unknown"),
                    "uploader": data.get("uploader") or data.get("channel") or "Unknown",
                    "channel_id": data.get("channel_id"),
                    "uploader_id": data.get("uploader_id"),
                    "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                    "view_count": vc,
                    "upload_date": data.get("upload_date", ""),
                    "duration": duration,
                })
                
            return results

    except Exception as e:
        logger.error(f"Error fetching videos (lib): {e}")
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


    return jsonify(final_list[:30])


# --- Caching Helpers ---
SECTION_CACHE = {}
CACHE_TTL = 900  # 15 minutes

def get_cached_section(key):
    """Get data from cache if valid."""
    if key in SECTION_CACHE:
        data, timestamp = SECTION_CACHE[key]
        if time.time() - timestamp < CACHE_TTL:
            return data
    return None

def set_cached_section(key, data):
    """Set data to cache with timestamp."""
    SECTION_CACHE[key] = (data, time.time())


# --- Homepage Section Helpers ---

def warm_cache_job():
    """Background job to warm cache for popular regions."""
    logger.info("Starting background cache warming...")
    regions = ["vietnam", "global"]
    
    # Delay slightly to let server start
    time.sleep(5)
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for region in regions:
            logger.info(f"Warming cache for region: {region}")
            
            # Warm Trending
            fetch_trending_fresh(region, 16)
            
            # Warm Recommended
            fetch_recommended(region, 16)
            
            # Warm Tech (Page 1 now)
            query_tech = f"latest smart technology gadgets reviews {region if region != 'global' else ''}"
            fetch_videos(query_tech, limit=16, filter_type="video")
            
            # Warm Music (Page 1 now)
            query_music = f"music hits {region if region != 'global' else ''}"
            fetch_videos(query_music, limit=16, filter_type="video")

    logger.info("Cache warming complete!")

def start_background_warmer():
    """Start the cache warmer in a background thread."""
    import threading
    warmer_thread = threading.Thread(target=warm_cache_job, daemon=True)
    warmer_thread.start()


def batch_fetch_metadata(video_ids):
    """Fetch full metadata for a list of video IDs using yt_dlp library directly."""
    if not video_ids:
        return {}

    # Deduplicate and filter
    valid_ids = list(set([vid for vid in video_ids if vid]))
    if not valid_ids:
        return {}
    
    logger.info(f"Batch fetching metadata for {len(valid_ids)} videos using yt_dlp library")

    try:
        import yt_dlp
    except ImportError:
        logger.error("yt_dlp library not found in environment.")
        return {}

    results = {}
    
    ydl_opts = {
        'skip_download': True,
        'ignoreerrors': True,
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            for vid in valid_ids:
                try:
                    url = f"https://www.youtube.com/watch?v={vid}"
                    info = ydl.extract_info(url, download=False)
                    
                    if not info:
                        continue
                        
                    vid_id = info.get("id")
                    u_date = info.get("upload_date", "MISSING")
                    
                    with open("hydration_debug.txt", "a") as f:
                        f.write(f"Fetched {vid_id}: Date={u_date}\n")
                    
                    # Format duration
                    dur_str = ""
                    duration_secs = info.get("duration")
                    if duration_secs:
                        m, s = divmod(int(duration_secs), 60)
                        h, m = divmod(m, 60)
                        dur_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
                    
                    results[vid_id] = {
                        "id": vid_id,
                        "title": info.get("title", "Unknown"),
                        "thumbnail": info.get("thumbnail") or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
                        "uploader": info.get("uploader") or info.get("channel") or "Unknown",
                        "view_count": info.get("view_count") or 0,
                        "duration": dur_str,
                        "upload_date": info.get("upload_date", ""),
                    }
                except Exception as inner_e:
                    logger.warning(f"Failed to fetch metadata for {vid}: {inner_e}")
                    continue
                    
        return results

    except Exception as e:
        logger.error(f"Batch metadata fetch failed: {e}")
        return {}


def get_history_videos(video_ids):
    """Get video info for history items using batch lookup for metadata."""
    if not video_ids or not video_ids[0]:
        return []
    
    # Filter valid IDs (preserve order)
    target_ids = [vid for vid in video_ids[:8] if vid]
    if not target_ids:
        return []

    metadata_map = batch_fetch_metadata(target_ids)
    
    videos = []
    for vid_id in target_ids:
        if vid_id in metadata_map:
            video = metadata_map[vid_id]
            video["_from_history"] = True
            videos.append(video)
        else:
            # Fallback for missing items
            videos.append({
                "id": vid_id,
                "title": "", 
                "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
                "uploader": "",
                "view_count": 0,
                "duration": "",
                "_from_history": True
            })
    return videos


def fetch_subscription_videos(channel_ids, limit=16):
    """Fetch latest videos from subscribed channels."""
    if not channel_ids or not channel_ids[0]:
        return []
    
    all_videos = []
    
    # Fetch from up to 4 channels in parallel
    channels_to_fetch = [c for c in channel_ids[:4] if c]
    
    def fetch_channel(channel_id):
        try:
            suffix = "videos"
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
                "--playlist-end", "4",
                "--no-warnings",
            ]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            stdout, _ = proc.communicate(timeout=15)
            
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
                        "title": v.get("title", "Unknown"),
                        "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
                        "view_count": v.get("view_count") or 0,
                        "duration": dur_str,
                        "upload_date": v.get("upload_date"),
                        "uploader": v.get("uploader") or v.get("channel") or "",
                    })
                except json.JSONDecodeError:
                    continue
            return videos
        except Exception as e:
            logger.debug(f"Error fetching channel {channel_id}: {e}")
            return []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(fetch_channel, channels_to_fetch))
        for res in results:
            all_videos.extend(res)
    
    # Deduplicate and shuffle
    unique = {v["id"]: v for v in all_videos if v.get("id")}.values()
    result = list(unique)
    random.shuffle(result)
    return result[:limit]


def fetch_recommended(region, limit=16):
    """Fetch recommended videos based on general popularity (Cached)."""
    cache_key = f"recommended_{region}_{limit}"
    cached = get_cached_section(cache_key)
    if cached:
        return cached

    query_pool = [
        "popular videos 2025",
        "viral videos this week",
        "best videos today",
        "recommended for you",
        "entertainment videos",
    ]
    
    # Add region suffix
    region_suffix = " vietnam" if region == "vietnam" else ""
    
    # Pick 2-3 random queries
    selected = random.sample(query_pool, min(3, len(query_pool)))
    queries = [q + region_suffix for q in selected]
    
    all_videos = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(
            lambda q: fetch_videos(q, limit=8, filter_type="video"),
            queries
        ))
        for res in results:
            all_videos.extend(res)
    
    # Deduplicate and shuffle
    unique = {v["id"]: v for v in all_videos if v.get("id")}.values()
    result = list(unique)
    random.shuffle(result)
    
    final_data = result[:limit]
    set_cached_section(cache_key, final_data)
    return final_data


def fetch_trending_fresh(region, limit=16):
    """Fetch trending with randomization for variety on each refresh (Cached)."""
    cache_key = f"trending_{region}_{limit}"
    cached = get_cached_section(cache_key)
    if cached:
        return cached

    query_pool = [
        "trending videos 2025",
        "viral videos today",
        "hot videos now",
        "most watched today",
        "trending music 2025",
        "trending entertainment",
    ]
    
    region_suffix = " vietnam" if region == "vietnam" else ""
    
    # Use timestamp to add variety
    random.seed(time.time())
    selected = random.sample(query_pool, min(3, len(query_pool)))
    queries = [q + region_suffix for q in selected]
    
    all_videos = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(
            lambda q: fetch_videos(q, limit=8, filter_type="video"),
            queries
        ))
        for res in results:
            all_videos.extend(res)
    
    # Deduplicate and shuffle
    unique = {v["id"]: v for v in all_videos if v.get("id")}.values()
    result = list(unique)
    random.shuffle(result)
    
    final_data = result[:limit]
    set_cached_section(cache_key, final_data)
    return final_data


@api_bp.route("/homepage")
def get_homepage():
    """Get personalized homepage sections with pagination."""
    # Common parameters
    region = request.args.get("region", "vietnam")
    page = int(request.args.get("page", 1))
    
    sections = []
    
    try:
        if page == 1:
            # --- Page 1: Personalization & Core Sections ---
            
            # Context from params
            history_ids = [h for h in request.args.get("history", "").split(",") if h][:10]
            history_titles = [t for t in request.args.get("titles", "").split(",") if t][:5]
            history_channels = [c for c in request.args.get("channels", "").split(",") if c][:5]
            subscriptions = [s for s in request.args.get("subs", "").split(",") if s][:10]
            
            # Define helper functions for parallel execution
            def get_continue_watching():
                if history_ids:
                    history_vids = get_history_videos(history_ids[:8])
                    if history_vids:
                        return {
                            "id": "continue_watching",
                            "title": "Continue Watching",
                            "videos": history_vids
                        }
                return None

            def get_suggested():
                if history_titles:
                    suggested = []
                    queries = []
                    for title in history_titles[:3]:
                        words = title.split()[:4]
                        query_base = " ".join(words)
                        queries.append(f"{query_base} related -shorts")
                    for channel in history_channels[:2]:
                        queries.append(f"{channel} latest videos -shorts")
                    
                    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                        results = list(executor.map(lambda q: fetch_videos(q, limit=6, filter_type="video"), queries))
                        for res in results:
                            suggested.extend(res)
                    
                    unique = {v["id"]: v for v in suggested if v.get("id")}.values()
                    suggested_list = list(unique)
                    random.shuffle(suggested_list)
                    if suggested_list:
                        return {
                            "id": "suggested",
                            "title": "Suggested For You",
                            "videos": suggested_list[:16]
                        }
                return None

            def get_subscriptions():
                if subscriptions:
                    sub_videos = fetch_subscription_videos(subscriptions, limit=16)
                    if sub_videos:
                        return {
                            "id": "subscriptions",
                            "title": "From Your Subscriptions",
                            "videos": sub_videos
                        }
                return None

            def get_recommended():
                recommended = fetch_recommended(region, limit=16)
                if recommended:
                    return {
                        "id": "recommended",
                        "title": "Videos You Might Like",
                        "videos": recommended
                    }
                return None

            def get_trending():
                trending = fetch_trending_fresh(region, limit=16)
                if trending:
                    return {
                        "id": "trending",
                        "title": "Trending Now",
                        "videos": trending
                    }
                return None

            def get_music():
                query = f"music hits {region if region != 'global' else ''}"
                vids = fetch_videos(query, limit=16, filter_type="video")
                if vids:
                    return {
                        "id": "music",
                        "title": "Music Hits",
                        "videos": vids
                    }
                return None

            def get_tech():
                query = f"latest smart technology gadgets reviews {region if region != 'global' else ''}"
                vids = fetch_videos(query, limit=16, filter_type="video")
                if vids:
                    return {
                        "id": "tech",
                        "title": "Tech & Gadgets",
                        "videos": vids
                    }
                return None

            # Execute in parallel
            with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
                futures = {
                    executor.submit(get_continue_watching): "continue_watching",
                    executor.submit(get_suggested): "suggested",
                    executor.submit(get_subscriptions): "subscriptions",
                    executor.submit(get_recommended): "recommended",
                    executor.submit(get_trending): "trending",
                    executor.submit(get_music): "music",
                    executor.submit(get_tech): "tech"
                }
                
                results_map = {}
                for future in concurrent.futures.as_completed(futures):
                    try:
                        res = future.result()
                        if res:
                            results_map[res["id"]] = res
                    except Exception as e:
                        logger.error(f"Error fetching section {futures[future]}: {e}")

            # Assemble sections in specific order
            order = ["continue_watching", "suggested", "subscriptions", "recommended", "music", "tech", "trending"]
            for key in order:
                if key in results_map:
                    sections.append(results_map[key])

        else:
            # --- Page 2+: Infinite Scroll Categories ---
            categories = [
                {"id": "gaming", "title": "Gaming", "query": "gaming trending"},
                {"id": "sports", "title": "Sports", "query": "sports highlights"},
                {"id": "news", "title": "News", "query": "latest news"},
                {"id": "movies", "title": "Movies", "query": "movie trailers"},
                {"id": "podcasts", "title": "Podcasts", "query": "popular podcasts"},
                {"id": "live", "title": "Live", "query": "live stream"},
                {"id": "education", "title": "Education", "query": "educational videos"},
                {"id": "comedy", "title": "Comedy", "query": "best comedy skits"},
                {"id": "travel", "title": "Travel", "query": "travel vlog"},
                {"id": "food", "title": "Food", "query": "cooking recipes"},
                {"id": "auto", "title": "Automotive", "query": "car reviews"},
                {"id": "science", "title": "Science", "query": "science explained"},
                {"id": "DIY", "title": "DIY & Crafts", "query": "diy projects"},
            ]
            
            # Pagination logic: 3 sections per page
            page_idx = page - 2 
            items_per_page = 3
            start = (page_idx * items_per_page) % len(categories)
            
            selected_cats = []
            for i in range(items_per_page):
                idx = (start + i) % len(categories)
                selected_cats.append(categories[idx])
            
            for cat in selected_cats:
                # Add region to query for relevance
                query = f"{cat['query']} {region if region != 'global' else ''}"
                vids = fetch_videos(query, limit=20, filter_type="video")
                if vids:
                    sections.append({
                        "id": cat["id"],
                        "title": cat["title"],
                        "videos": vids
                    })

        return jsonify({"mode": "sections", "data": sections})

    except Exception as e:
        logger.error(f"Homepage error: {e}")
        # Fallback
        fallback = fetch_trending_fresh(region, limit=20)
        return jsonify({"mode": "sections", "data": [{
            "id": "trending",
            "title": "Trending Now",
            "videos": fallback
        }]})


@api_bp.route("/trending")
def get_trending():
    """Get trending videos (flat list)."""
    region = request.args.get("region", "vietnam")
    limit = int(request.args.get("limit", 20))
    
    videos = fetch_trending_fresh(region, limit=limit)
    
    # Simple hydration check for the first few to ensure date display
    if videos:
         ids = [v['id'] for v in videos[:5]]
         meta = batch_fetch_metadata(ids)
         for v in videos:
             if v['id'] in meta and meta[v['id']].get('upload_date'):
                 v['upload_date'] = meta[v['id']]['upload_date']
                 
    return jsonify(videos)


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
        
        # Hydration
        ids_to_hydrate = [v['id'] for v in unique_videos[:12]]
        if ids_to_hydrate:
            metadata_map = batch_fetch_metadata(ids_to_hydrate)
            for video in unique_videos:
                if video['id'] in metadata_map:
                    meta = metadata_map[video['id']]
                    if meta.get("upload_date"):
                        video["upload_date"] = meta["upload_date"]
                        video["view_count"] = meta.get("view_count", video.get("view_count", 0))
                    if meta.get("duration"):
                         video["duration"] = meta["duration"]

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

        # Use YouTubeService which handles failover (Local -> Remote)
        info = YouTubeService.get_video_info(video_id)
        
        if not info:
             return jsonify({"error": "Failed to fetch video info from all engines"}), 500

        stream_url = info.get("stream_url")
        if not stream_url:
            return jsonify({"error": "No stream URL found"}), 500

        response_data = {
            "original_url": stream_url,
            "title": info.get("title", "Unknown"),
            "description": info.get("description", ""),
            "uploader": info.get("uploader", ""),
            "uploader_id": info.get("uploader_id", ""),
            "channel_id": info.get("channel_id", ""),
            "upload_date": info.get("upload_date", ""),
            "view_count": info.get("view_count", 0),
            "subtitle_url": info.get("subtitle_url"),
            "related": [],
        }

        from urllib.parse import quote
        
        # Encode headers into the proxy URL
        http_headers = info.get("http_headers", {})
        header_params = ""
        for k, v in http_headers.items():
             # Only pass critical headers that might affect access
             if k.lower() in ['user-agent', 'cookie', 'referer', 'origin']:
                header_params += f"&h_{quote(k)}={quote(v)}"
        
        proxied_url = f"/video_proxy?url={quote(stream_url, safe='')}{header_params}"
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


@api_bp.route("/stream/qualities")
def get_stream_qualities():
    """Get available stream qualities for a video with proxied URLs."""
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
            
            qualities = []
            seen_resolutions = set()
            
            # Sort formats by quality (highest first)
            formats = info.get("formats", [])
            
            for f in formats:
                f_url = f.get("url", "")
                if not f_url or "m3u8" in f_url:
                    continue
                
                # Only include formats with both video and audio (progressive)
                vcodec = f.get("vcodec", "none")
                acodec = f.get("acodec", "none")
                
                if vcodec == "none" or acodec == "none":
                    continue
                
                f_ext = f.get("ext", "")
                if f_ext not in ["mp4", "webm"]:
                    continue
                
                # Get resolution label
                height = f.get("height", 0)
                format_note = f.get("format_note", "")
                
                if height:
                    label = f"{height}p"
                elif format_note:
                    label = format_note
                else:
                    continue
                
                # Skip duplicates
                if label in seen_resolutions:
                    continue
                seen_resolutions.add(label)
                
                # Create proxied URL
                from urllib.parse import quote
                proxied_url = f"/video_proxy?url={quote(f_url, safe='')}"
                
                qualities.append({
                    "label": label,
                    "height": height,
                    "url": proxied_url,
                    "ext": f_ext,
                })
            
            # Sort by height descending (best first)
            qualities.sort(key=lambda x: x.get("height", 0), reverse=True)
            
            # Add "Auto" option at the beginning (uses best available)
            if qualities:
                auto_quality = {
                    "label": "Auto",
                    "height": 9999,  # Highest priority
                    "url": qualities[0]["url"],  # Use best quality
                    "ext": qualities[0]["ext"],
                    "default": True,
                }
                qualities.insert(0, auto_quality)
            
            return jsonify({
                "success": True,
                "video_id": video_id,
                "qualities": qualities[:8],  # Limit to 8 options
            })

    except Exception as e:
        logger.error(f"Stream qualities error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


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


@api_bp.route("/transcript")
def get_transcript():
    """Get video transcript (VTT)."""
    video_id = request.args.get("v")
    if not video_id:
        return "No video ID", 400

    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        # Use yt-dlp to get subtitles
        cmd = [
            sys.executable, "-m", "yt_dlp",
            url,
            "--write-auto-sub",
            "--sub-lang", "en,vi",
            "--skip-download",
            "--no-warnings",
            "--quiet",
            "--sub-format", "vtt",
            "--output", "CAPTIONS_%(id)s"
        ]
        
        # We need to run this in a temp dir or handle output names
        # Simplified: fetch info and get subtitle URL
        
        # Better approach: Get subtitle URL from extract_info
        with yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            subtitles = info.get('subtitles') or info.get('automatic_captions') or {}
            
            # Prefer English, then Vietnamese, then any
            lang = 'en'
            if 'en' not in subtitles and 'vi' in subtitles:
                lang = 'vi'
            elif 'en' not in subtitles:
                # Pick first available
                langs = list(subtitles.keys())
                if langs:
                    lang = langs[0]
            
            if lang and lang in subtitles:
                subs_list = subtitles[lang]
                # Find vtt
                vtt_url = next((s['url'] for s in subs_list if s.get('ext') == 'vtt'), None)
                if not vtt_url:
                    vtt_url = subs_list[0]['url'] # Fallback
                
                # Fetch the VTT content
                import requests
                res = requests.get(vtt_url)
                return Response(res.content, mimetype="text/vtt")
            
        return "No transcript available", 404
            
    except Exception as e:
        logger.error(f"Transcript error: {e}")
        return str(e), 500


@api_bp.route("/summarize")
def summarize_video():
    """Get video summary from transcript using AI (Gemini) or TextRank fallback."""
    video_id = request.args.get("v")
    video_title = request.args.get("title", "")
    translate_to = request.args.get("lang")  # Optional: 'vi' for Vietnamese
    
    if not video_id:
        return jsonify({"error": "No video ID"}), 400
        
    try:
        # 1. Get Transcript Text using TranscriptService (with ytfetcher fallback)
        text = TranscriptService.get_transcript(video_id)
        if not text:
            return jsonify({
                "success": False, 
                "error": "No transcript available to summarize."
            })
        
        # 2. Use TextRank Summarizer - generate longer, more meaningful summaries
        summarizer = TextRankSummarizer()
        summary_text = summarizer.summarize(text, num_sentences=5)  # Increased from 3 to 5
        
        # Allow longer summaries for more meaningful content (600 chars instead of 300)
        if len(summary_text) > 600:
            summary_text = summary_text[:597] + "..."
        
        # Key points will be extracted by WebLLM on frontend (better quality)
        # Backend just returns empty list - WebLLM generates conceptual key points
        key_points = []
        
        # Store original versions
        original_summary = summary_text
        original_key_points = key_points.copy() if key_points else []
        
        # 3. Translate if requested
        translated_summary = None
        translated_key_points = None
        
        if translate_to == 'vi':
            try:
                translated_summary = translate_text(summary_text, 'vi')
                translated_key_points = [translate_text(p, 'vi') for p in key_points] if key_points else []
            except Exception as te:
                logger.warning(f"Translation failed: {te}")
        
        # 4. Return structured data
        return jsonify({
            "success": True, 
            "summary": original_summary,
            "key_points": original_key_points,
            "translated_summary": translated_summary,
            "translated_key_points": translated_key_points,
            "lang": translate_to or "en",
            "video_id": video_id,
            "ai_powered": False
        })
    except Exception as e:
        logger.error(f"Summarization error: {e}")
        return jsonify({"success": False, "error": str(e)})


def translate_text(text, target_lang='vi'):
    """Translate text to target language using Google Translate."""
    try:
        from googletrans import Translator
        
        translator = Translator()
        result = translator.translate(text, dest=target_lang)
        return result.text
        
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text  # Return original text if translation fails


def get_transcript_text(video_id):
    """
    Fetch transcript using yt-dlp (downloading subtitles to file).
    Reliable method that handles auto-generated captions and cookies.
    """
    import yt_dlp
    import glob
    import random
    import json
    import os
    
    try:
        video_id = video_id.strip()
        logger.info(f"Fetching transcript for {video_id} using yt-dlp")
        
        # Use a temporary filename pattern
        temp_prefix = f"transcript_{video_id}_{random.randint(1000, 9999)}"
        
        ydl_opts = {
            'skip_download': True,
            'quiet': True,
            'no_warnings': True,
            'cookiefile': os.environ.get('COOKIES_FILE', 'cookies.txt') if os.path.exists(os.environ.get('COOKIES_FILE', 'cookies.txt')) else None,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['en', 'vi', 'en-US'],
            'outtmpl': f"/tmp/{temp_prefix}", # Save to /tmp
            'subtitlesformat': 'json3/vtt/best', # Prefer json3 for parsing, then vtt
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # This will download the subtitle file to /tmp/
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
            
            # Find the downloaded file
            # yt-dlp appends language code, e.g. .en.json3
            # We look for any file with our prefix
            downloaded_files = glob.glob(f"/tmp/{temp_prefix}*")
            
            if not downloaded_files:
                logger.warning("yt-dlp finished but no subtitle file found.")
                return None
                
            # Pick the best file (prefer json3, then vtt)
            selected_file = None
            for ext in ['.json3', '.vtt', '.ttml', '.srv3']:
                for f in downloaded_files:
                    if f.endswith(ext):
                        selected_file = f
                        break
                if selected_file: break
            
            if not selected_file:
                selected_file = downloaded_files[0]
                
            # Read content
            with open(selected_file, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Cleanup
            for f in downloaded_files:
                try:
                    os.remove(f)
                except:
                    pass
            
            # Parse
            if selected_file.endswith('.json3') or content.strip().startswith('{'):
                try:
                    json_data = json.loads(content)
                    events = json_data.get('events', [])
                    text_parts = []
                    for event in events:
                        segs = event.get('segs', [])
                        for seg in segs:
                            txt = seg.get('utf8', '').strip()
                            if txt and txt != '\n':
                                text_parts.append(txt)
                    return " ".join(text_parts)
                except Exception as je:
                    logger.warning(f"JSON3 parse failed: {je}")
                    
            return parse_transcript_content(content)

    except Exception as e:
        logger.error(f"Transcript fetch failed: {e}")
        
    return None

def parse_transcript_content(content):
    """Helper to parse VTT/XML content."""
    try:
        # Simple VTT cleaner
        lines = content.splitlines()
        text_lines = []
        seen = set()
        
        for line in lines:
            line = line.strip()
            if not line: continue
            if "-->" in line: continue
            if line.isdigit(): continue
            if line.startswith("WEBVTT"): continue
            if line.startswith("Kind:"): continue
            if line.startswith("Language:"): continue
            
            # Remove tags like <c> or <00:00:00>
            clean = re.sub(r'<[^>]+>', '', line)
            if clean and clean not in seen:
                seen.add(clean)
                text_lines.append(clean)
                
        return " ".join(text_lines)
                
    except Exception as e:
        logger.error(f"Transcript parse error: {e}")
        return None








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


@api_bp.route("/update_package", methods=["POST"])
def update_package():
    """Update a Python package (yt-dlp stable/nightly, ytfetcher)."""
    try:
        data = request.json or {}
        pkg = data.get("package", "ytdlp")
        version = data.get("version", "stable")
        
        if pkg == "ytdlp":
            if version == "nightly":
                # Install nightly/master from GitHub
                # Force reinstall and NO CACHE to ensure we get the latest commit
                cmd = [sys.executable, "-m", "pip", "install", 
                       "--no-cache-dir", "--force-reinstall", "-U", 
                       "https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz"]
            else:
                # Install stable from PyPI
                cmd = [sys.executable, "-m", "pip", "install", "-U", "yt-dlp"]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0:
                ver_cmd = [sys.executable, "-m", "yt_dlp", "--version"]
                ver_result = subprocess.run(ver_cmd, capture_output=True, text=True)
                ver_str = ver_result.stdout.strip()
                suffix = " (nightly)" if version == "nightly" else ""
                return jsonify({"success": True, "message": f"yt-dlp updated to {ver_str}{suffix}"})
            else:
                return jsonify({"success": False, "message": f"Update failed: {result.stderr[:200]}"}), 500
                
        elif pkg == "ytfetcher":
            # Install/update ytfetcher from GitHub
            cmd = [sys.executable, "-m", "pip", "install", "-U", 
                   "git+https://github.com/kaya70875/ytfetcher.git"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            
            if result.returncode == 0:
                return jsonify({"success": True, "message": "ytfetcher updated successfully"})
            else:
                return jsonify({"success": False, "message": f"Update failed: {result.stderr[:200]}"}), 500
        else:
            return jsonify({"success": False, "message": f"Unknown package: {pkg}"}), 400
            
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "message": "Update timed out"}), 500
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




@api_bp.route("/settings", methods=["GET"])
def get_settings():
    """Get all settings."""
    return jsonify(SettingsService.get_all())


@api_bp.route("/package/version")
def get_package_version():
    """Get version of a package."""
    pkg = request.args.get("package", "yt_dlp")
    
    try:
        if pkg == "yt_dlp" or pkg == "ytdlp":
            import yt_dlp
            version = yt_dlp.version.__version__
            # Check if it looks like nightly (contains dev or current date)
            return jsonify({"success": True, "package": "yt-dlp", "version": version})
        elif pkg == "ytfetcher":
            try:
                import ytfetcher
                # ytfetcher might not have __version__ exposed easily, but let's try
                version = getattr(ytfetcher, "__version__", "installed")
                return jsonify({"success": True, "package": "ytfetcher", "version": version})
            except ImportError:
                return jsonify({"success": False, "package": "ytfetcher", "version": "not installed"})
        else:
            return jsonify({"error": "Unknown package"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/settings", methods=["POST"])
def update_settings():
    """Update a setting."""
    data = request.json
    if not data or 'key' not in data or 'value' not in data:
        return jsonify({"error": "Invalid request"}), 400
        
    try:
        SettingsService.set(data['key'], data['value'])
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/settings/test", methods=["POST"])
def test_engine():
    """Test the current engine configuration."""
    from app.services.youtube import YouTubeService
    
    # Use a known safe video (Me at the zoo)
    TEST_VID = "jNQXAC9IVRw" 
    
    try:
        # Force a fresh fetch ignoring cache logic if possible
        # We just call get_video_info which uses the current SettingsService engine
        info = YouTubeService.get_video_info(TEST_VID)
        
        if info and info.get('stream_url'):
             return jsonify({
                 "success": True, 
                 "message": f"Successfully fetched via {SettingsService.get('youtube_engine', 'auto')}",
                 "details": {
                     "title": info.get('title'),
                     "engine": SettingsService.get('youtube_engine', 'auto')
                 }
             })
        else:
            return jsonify({
                "success": False, 
                "message": "Fetch returned no data"
            })
            
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})
