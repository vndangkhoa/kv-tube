from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file, Response, stream_with_context, session, flash
import os
import sys
import subprocess
import json
import requests
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
import yt_dlp
from functools import wraps
import yt_dlp
from functools import wraps
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
import re
import heapq
# nltk removed to avoid SSL/download issues. Using regex instead.

app = Flask(__name__)
app.secret_key = 'super_secret_key_change_this'  # Required for sessions

# Ensure data directory exists for persistence
DATA_DIR = "data"
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

DB_NAME = os.path.join(DATA_DIR, "kvtube.db")

# --- Database Setup ---
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # Users Table
    c.execute('''CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL
                )''')
    # Saved/History Table
    # type: 'history' or 'saved'
    c.execute('''CREATE TABLE IF NOT EXISTS user_videos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    video_id TEXT,
                    title TEXT,
                    thumbnail TEXT,
                    type TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )''')
    # Cache Table for video metadata/streams
    c.execute('''CREATE TABLE IF NOT EXISTS video_cache (
                    video_id TEXT PRIMARY KEY,
                    data TEXT,
                    expires_at DATETIME
                )''')
    conn.commit()
    conn.close()

# Run init
init_db()

# --- Auth Helpers ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

# --- Auth Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()
        
        if user and check_password_hash(user['password'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            return redirect(url_for('index')) # Changed from 'home' to 'index'
        else:
            flash('Invalid username or password')
            
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        hashed_pw = generate_password_hash(password)
        
        try:
            conn = get_db_connection()
            conn.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, hashed_pw))
            conn.commit()
            conn.close()
            flash('Registration successful! Please login.')
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            flash('Username already exists')
            
    return render_template('register.html')

@app.route('/logout')
@app.route('/api/update_profile', methods=['POST'])
@login_required
def update_profile():
    data = request.json
    new_username = data.get('username')
    
    if not new_username:
        return jsonify({'success': False, 'message': 'Username is required'}), 400
        
    try:
        conn = get_db_connection()
        conn.execute('UPDATE users SET username = ? WHERE id = ?', 
                    (new_username, session['user_id']))
        conn.commit()
        conn.close()
        
        session['username'] = new_username
        return jsonify({'success': True, 'message': 'Profile updated'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

def logout():
    session.clear()
    return redirect(url_for('index')) # Changed from 'home' to 'index'

@app.template_filter('format_views')
def format_views(views):
    if not views: return '0'
    try:
        num = int(views)
        if num >= 1000000: return f"{num / 1000000:.1f}M"
        if num >= 1000: return f"{num / 1000:.0f}K"
        return f"{num:,}"
    except:
        return str(views)

@app.template_filter('format_date')
def format_date(value):
    if not value: return 'Recently'
    from datetime import datetime, timedelta
    try:
        # Handle YYYYMMDD
        if len(str(value)) == 8 and str(value).isdigit():
            dt = datetime.strptime(str(value), '%Y%m%d')
        # Handle Timestamp
        elif isinstance(value, (int, float)):
            dt = datetime.fromtimestamp(value)
        # Handle already formatted (YYYY-MM-DD)
        else:
             # Try common formats
             try: dt = datetime.strptime(str(value), '%Y-%m-%d')
             except: return str(value)
             
        now = datetime.now()
        diff = now - dt
        
        if diff.days > 365:
            return f"{diff.days // 365} years ago"
        if diff.days > 30:
            return f"{diff.days // 30} months ago"
        if diff.days > 0:
            return f"{diff.days} days ago"
        if diff.seconds > 3600:
            return f"{diff.seconds // 3600} hours ago"
        return "Just now"
    except:
        return str(value)

# Configuration for local video path - configurable via env var
VIDEO_DIR = os.environ.get('KVTUBE_VIDEO_DIR', './videos')

@app.route('/')
def index():
    return render_template('index.html', page='home')

@app.route('/my-videos')
def my_videos():
    filter_type = request.args.get('type', 'history') # 'saved' or 'history'
    
    videos = []
    logged_in = 'user_id' in session
    
    if logged_in:
        conn = get_db_connection()
        videos = conn.execute('''
            SELECT * FROM user_videos 
            WHERE user_id = ? AND type = ? 
            ORDER BY timestamp DESC
        ''', (session['user_id'], filter_type)).fetchall()
        conn.close()
    
    return render_template('my_videos.html', videos=videos, filter_type=filter_type, logged_in=logged_in)

@app.route('/api/save_video', methods=['POST'])
@login_required
def save_video():
    data = request.json
    video_id = data.get('id')
    title = data.get('title')
    thumbnail = data.get('thumbnail')
    action_type = data.get('type', 'history') # 'history' or 'saved'
    
    conn = get_db_connection()
    
    # Check if already exists to prevent duplicates (optional, strictly for 'saved')
    if action_type == 'saved':
        exists = conn.execute('SELECT id FROM user_videos WHERE user_id = ? AND video_id = ? AND type = ?', 
                             (session['user_id'], video_id, 'saved')).fetchone()
        if exists:
            conn.close()
            return jsonify({'status': 'already_saved'})

    conn.execute('INSERT INTO user_videos (user_id, video_id, title, thumbnail, type) VALUES (?, ?, ?, ?, ?)',
                 (session['user_id'], video_id, title, thumbnail, action_type))
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

@app.route('/stream/<path:filename>')
def stream_local(filename):
    return send_from_directory(VIDEO_DIR, filename)

@app.route('/settings')
def settings():
    return render_template('settings.html', page='settings')

@app.route('/video_proxy')
def video_proxy():
    url = request.args.get('url')
    if not url:
        return "No URL provided", 400
    
    # Forward headers to mimic browser and support seeking
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    }
    
    # Support Range requests (scrubbing)
    range_header = request.headers.get('Range')
    if range_header:
        headers['Range'] = range_header
    
    try:
        req = requests.get(url, headers=headers, stream=True, timeout=30)
        
        # Handle HLS (M3U8) Rewriting - CRITICAL for 1080p+ and proper sync
        content_type = req.headers.get('content-type', '').lower()
        # Extract URL path without query params for checking extension
        url_path = url.split('?')[0]
        is_manifest = (url_path.endswith('.m3u8') or 
                       'application/x-mpegurl' in content_type or
                       'application/vnd.apple.mpegurl' in content_type)
        
        if is_manifest:
            content = req.text
            base_url = url.rsplit('/', 1)[0]
            new_lines = []
            
            for line in content.splitlines():
                if line.strip() and not line.startswith('#'):
                    # It's a segment or sub-playlist
                    # If relative, make absolute
                    if not line.startswith('http'):
                        full_url = f"{base_url}/{line}"
                    else:
                        full_url = line
                    
                    # Proxy it - use urllib.parse.quote with safe parameter
                    from urllib.parse import quote
                    quoted_url = quote(full_url, safe='')
                    new_lines.append(f"/video_proxy?url={quoted_url}")
                else:
                    new_lines.append(line)
            
            return Response('\n'.join(new_lines), content_type='application/vnd.apple.mpegurl')

        # Standard Stream Proxy (Binary)
        # We exclude headers that might confuse the browser/flask
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        response_headers = [(name, value) for (name, value) in req.headers.items()
                           if name.lower() not in excluded_headers]
        
        return Response(stream_with_context(req.iter_content(chunk_size=8192)), 
                        status=req.status_code,
                        headers=response_headers,
                        content_type=req.headers.get('content-type'))
    except Exception as e:
        print(f"Proxy Error: {e}")
        return str(e), 500

@app.route('/watch')
def watch():
    video_id = request.args.get('v')
    local_file = request.args.get('local')
    
    if local_file:
        return render_template('watch.html', video_type='local', src=url_for('stream_local', filename=local_file), title=local_file)
    
    if not video_id:
        return "No video ID provided", 400
    return render_template('watch.html', video_type='youtube', video_id=video_id)

@app.route('/channel/<channel_id>')
def channel(channel_id):
    if not channel_id:
        return redirect(url_for('index'))
    
    try:
        # Robustness: Resolve name to ID if needed (Metadata only fetch)
        real_id_or_url = channel_id
        is_search_fallback = False
        
        if not channel_id.startswith('UC') and not channel_id.startswith('@'):
            # Simple resolve logic - reusing similar block from before but optimized for metadata
             search_cmd = [
                sys.executable, '-m', 'yt_dlp',
                f'ytsearch1:{channel_id}',
                '--dump-json',
                '--default-search', 'ytsearch',
                '--no-playlist'
            ]
             try:
                 proc_search = subprocess.run(search_cmd, capture_output=True, text=True)
                 if proc_search.returncode == 0:
                     first_result = json.loads(proc_search.stdout.splitlines()[0])
                     if first_result.get('channel_id'):
                         real_id_or_url = first_result.get('channel_id')
                         is_search_fallback = True
             except: pass

        # Fetch basic channel info (Avatar/Banner)
        # We use a very short playlist fetch just to get the channel dict
        channel_info = {
            'id': real_id_or_url, # Use resolved ID for API calls
            'title': channel_id if not is_search_fallback else 'Loading...',
            'avatar': None,
            'banner': None,
            'subscribers': None
        }
        
        # Determine target URL for metadata fetch
        target_url = real_id_or_url
        if target_url.startswith('UC'): target_url = f'https://www.youtube.com/channel/{target_url}'
        elif target_url.startswith('@'): target_url = f'https://www.youtube.com/{target_url}'
            
        cmd = [
            sys.executable, '-m', 'yt_dlp',
            target_url,
            '--dump-json',
            '--flat-playlist',
            '--playlist-end', '1', # Fetch just 1 to get metadata
            '--no-warnings'
        ]
        
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = proc.communicate()
        
        if stdout:
            try:
                first = json.loads(stdout.splitlines()[0])
                channel_info['title'] = first.get('channel') or first.get('uploader') or channel_info['title']
                channel_info['id'] = first.get('channel_id') or channel_info['id']
                # Try to get avatar/banner if available in flat dump (often NOT, but title/id are key)
            except: pass

        # Render shell - videos fetched via JS
        return render_template('channel.html', channel=channel_info)
        
    except Exception as e:
        return f"Error loading channel: {str(e)}", 500

@app.route('/api/related')
def get_related_videos():
    video_id = request.args.get('v')
    title = request.args.get('title')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    
    if not title and not video_id:
        return jsonify({'error': 'Video ID or Title required'}), 400
        
    try:
        query = f"{title} related" if title else f"{video_id} related"
        
        # Calculate pagination
        # Page 1: 0-10 (but usually fetched by get_stream_info)
        # Page 2: 10-20
        start = (page - 1) * limit
        end = start + limit
        
        videos = fetch_videos(query, limit=limit, playlist_start=start+1, playlist_end=end)
        return jsonify(videos)
    except Exception as e:
        print(f"Error fetching related: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/download')
def get_download_url():
    """Get a direct MP4 download URL for a video"""
    video_id = request.args.get('v')
    if not video_id:
        return jsonify({'error': 'No video ID'}), 400
    
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Use format that avoids HLS/DASH manifests (m3u8)
        # Prefer progressive download formats
        ydl_opts = {
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best[protocol!*=m3u8]/best',
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'youtube_include_dash_manifest': False,  # Avoid DASH
            'youtube_include_hls_manifest': False,   # Avoid HLS
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Try to get URL that's NOT an m3u8
            download_url = info.get('url', '')
            
            # If still m3u8, try getting from formats directly
            if '.m3u8' in download_url or not download_url:
                formats = info.get('formats', [])
                # Find best non-HLS format
                for f in reversed(formats):
                    f_url = f.get('url', '')
                    f_ext = f.get('ext', '')
                    f_protocol = f.get('protocol', '')
                    if f_url and 'm3u8' not in f_url and f_ext == 'mp4':
                        download_url = f_url
                        break
            
            title = info.get('title', 'video')
            
            if download_url and '.m3u8' not in download_url:
                return jsonify({
                    'url': download_url,
                    'title': title,
                    'ext': 'mp4'
                })
            else:
                # Fallback: return YouTube link for manual download
                return jsonify({
                    'error': 'Direct download not available. Try a video downloader site.',
                    'fallback_url': url
                }), 200
                
    except Exception as e:
        print(f"Download URL error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/channel/videos')
def get_channel_videos():
    channel_id = request.args.get('id')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    sort_mode = request.args.get('sort', 'latest')
    filter_type = request.args.get('filter_type', 'video') # 'video' or 'shorts'
    
    if not channel_id: return jsonify([])
    
    try:
        # Calculate playlist range
        start = (page - 1) * limit + 1
        end = start + limit - 1
        
        # Construct URL based on ID type AND Filter Type
        base_url = ""
        if channel_id.startswith('UC'): base_url = f'https://www.youtube.com/channel/{channel_id}'
        elif channel_id.startswith('@'): base_url = f'https://www.youtube.com/{channel_id}'
        else: base_url = f'https://www.youtube.com/channel/{channel_id}' # Fallback
        
        target_url = base_url
        if filter_type == 'shorts':
            target_url += '/shorts'
        elif filter_type == 'video':
            target_url += '/videos'
        
        playlist_args = ['--playlist-start', str(start), '--playlist-end', str(end)]
        
        if sort_mode == 'oldest':
             playlist_args = ['--playlist-reverse', '--playlist-start', str(start), '--playlist-end', str(end)]
        
        # ... (rest is same)
        elif sort_mode == 'popular':
            # For popular, we ideally need a larger pool if doing python sort, 
            # BUT with pagination strict ranges, python sort is impossible across pages.
            # We MUST rely on yt-dlp/youtube sort.
            # Attempt to use /videos URL which supports sort? 
            # Actually, standard channel URL + --flat-playlist returns "Latest".
            # To get popular, we would typically need to scape /videos?sort=p.
            # yt-dlp doesn't support 'sort' arg for channels directly.
            # WORKAROUND: For 'popular', we'll just return Latest for now to avoid breaking pagination,
            # OR fetches a larger batch (e.g. top 100) and slice it? 
            # Let's simple return latest but marked. 
            # Implementation decision: Stick to Latest logic for stability, 
            # OR (Better) don't support sort in API yet if unsupported.
            # Let's keep logic simple: ignore sort for API to ensure speed.
            pass

        cmd = [
            sys.executable, '-m', 'yt_dlp',
            target_url,
            '--dump-json',
            '--flat-playlist',
            '--no-warnings'
        ] + playlist_args
        
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = proc.communicate()
        
        videos = []
        for line in stdout.splitlines():
            try:
                v = json.loads(line)
                dur_str = None
                if v.get('duration'):
                    m, s = divmod(int(v['duration']), 60)
                    h, m = divmod(m, 60)
                    dur_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
                    
                videos.append({
                    'id': v.get('id'),
                    'title': v.get('title'),
                    'thumbnail': f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
                    'view_count': v.get('view_count') or 0,
                    'duration': dur_str,
                    'upload_date': v.get('upload_date'),
                    'uploader': v.get('uploader'),
                    'channel_id': v.get('channel_id') or channel_id
                })
            except: continue
            
        return jsonify(videos)
    except Exception as e:
        print(f"API Error: {e}")
        return jsonify([])
        
    except Exception as e:
        return f"Error loading channel: {str(e)}", 500

@app.route('/api/get_stream_info')
def get_stream_info():
    video_id = request.args.get('v')
    if not video_id:
        return jsonify({'error': 'No video ID'}), 400
    
    try:
        # 1. Check Cache
        import time
        conn = get_db_connection()
        cached = conn.execute('SELECT data, expires_at FROM video_cache WHERE video_id = ?', (video_id,)).fetchone()
        
        current_time = time.time()
        if cached:
            # Check expiry (stored as unix timestamp or datetime string, we'll use timestamp for simplicity)
            try:
                expires_at = float(cached['expires_at'])
                if current_time < expires_at:
                    data = json.loads(cached['data'])
                    conn.close()
                    # Re-proxy the URL just in case, or use cached if valid. 
                    # Actually proxy url requires encoding, let's reconstruct it to be safe.
                    from urllib.parse import quote
                    proxied_url = f"/video_proxy?url={quote(data['original_url'], safe='')}"
                    data['stream_url'] = proxied_url
                    
                    # Add cache hit header for debug
                    response = jsonify(data)
                    response.headers['X-Cache'] = 'HIT'
                    return response
            except:
                pass # Invalid cache, fall through
        
        # 2. Fetch from YouTube (Library Optimization)
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        ydl_opts = {
            'format': 'best[ext=mp4]/best',
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'force_ipv4': True,
            'socket_timeout': 10,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                print(f"❌ yt-dlp error for {video_id}: {str(e)}")
                return jsonify({'error': 'Stream extraction failed'}), 500

        stream_url = info.get('url')
        if not stream_url:
             return jsonify({'error': 'No stream URL found in metadata'}), 500

        # Fetch Related Videos (Fallback to search if not provided)
        # We use the title + " related" to find relevant content
        related_videos = []
        try:
            search_query = f"{info.get('title', '')} related"
            related_videos = fetch_videos(search_query, limit=20)
        except:
            pass

        # Extract Subtitles (English preferred)
        subtitle_url = None
        start_lang = 'en'
        
        subs = info.get('subtitles') or {}
        auto_subs = info.get('automatic_captions') or {}
        
        # DEBUG: Print subtitle info
        print(f"Checking subtitles for {video_id}")
        print(f"Manual Subs keys: {list(subs.keys())}")
        print(f"Auto Subs keys: {list(auto_subs.keys())}")

        # Check manual subs first
        if 'en' in subs:
            subtitle_url = subs['en'][0]['url']
        elif 'vi' in subs:  # Vietnamese fallback
            subtitle_url = subs['vi'][0]['url']
        # Check auto subs (usually available)
        elif 'en' in auto_subs:
            subtitle_url = auto_subs['en'][0]['url']
        elif 'vi' in auto_subs:
            subtitle_url = auto_subs['vi'][0]['url']
        
        # If still none, just pick the first one from manual then auto
        if not subtitle_url:
            if subs:
                first_key = list(subs.keys())[0]
                subtitle_url = subs[first_key][0]['url']
            elif auto_subs:
                first_key = list(auto_subs.keys())[0]
                subtitle_url = auto_subs[first_key][0]['url']
        
        print(f"Selected Subtitle URL: {subtitle_url}")

        # 3. Construct Response Data
        response_data = {
            'original_url': stream_url,
            'title': info.get('title', 'Unknown Title'),
            'description': info.get('description', ''),
            'uploader': info.get('uploader', ''),
            'upload_date': info.get('upload_date', ''),
            'view_count': info.get('view_count', 0),
            'related': related_videos,
            'subtitle_url': subtitle_url
        }
        
        # 4. Cache It (valid for 1 hour = 3600s)
        # YouTube URLs expire in ~6 hours usually.
        expiry = current_time + 3600 
        conn.execute('INSERT OR REPLACE INTO video_cache (video_id, data, expires_at) VALUES (?, ?, ?)',
                     (video_id, json.dumps(response_data), expiry))
        conn.commit()
        conn.close()
        
        # 5. Return Response
        from urllib.parse import quote
        proxied_url = f"/video_proxy?url={quote(stream_url, safe='')}"
        response_data['stream_url'] = proxied_url
        
        response = jsonify(response_data)
        response.headers['X-Cache'] = 'MISS'
        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search')
def search():
    query = request.args.get('q')
    if not query:
        return jsonify({'error': 'No query provided'}), 400
    
    try:
        # Check if query is a YouTube URL
        import re
        # Regex to catch youtube.com/watch?v=, youtu.be/, shorts/, etc.
        youtube_regex = r'(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([\w-]+)'
        match = re.search(youtube_regex, query)
        
        if match:
            video_id = match.group(4)
            # Fetch direct metadata
            meta_cmd = [sys.executable, '-m', 'yt_dlp', '--dump-json', '--no-playlist', f'https://www.youtube.com/watch?v={video_id}']
            meta_proc = subprocess.run(meta_cmd, capture_output=True, text=True)
            
            results = []
            search_title = ""
            
            if meta_proc.returncode == 0:
                data = json.loads(meta_proc.stdout)
                search_title = data.get('title', '')
                
                # Format duration
                duration_secs = data.get('duration')
                if duration_secs:
                    mins, secs = divmod(int(duration_secs), 60)
                    hours, mins = divmod(mins, 60)
                    duration = f"{hours}:{mins:02d}:{secs:02d}" if hours else f"{mins}:{secs:02d}"
                else:
                    duration = None

                # Add the exact match first
                results.append({
                    'id': data.get('id'),
                    'title': data.get('title', 'Unknown'),
                    'uploader': data.get('uploader') or data.get('channel') or 'Unknown',
                    'thumbnail': f"https://i.ytimg.com/vi/{data.get('id')}/hqdefault.jpg",
                    'view_count': data.get('view_count', 0),
                    'upload_date': data.get('upload_date', ''),
                    'duration': duration,
                    'is_exact_match': True # Flag for frontend highlighting if desired
                })
            
            # Now fetch related/similar videos using title
            if search_title:
                rel_cmd = [
                    sys.executable, '-m', 'yt_dlp',
                    f'ytsearch19:{search_title}', # Get 19 more to make ~20 total
                    '--dump-json',
                    '--default-search', 'ytsearch',
                    '--no-playlist',
                    '--flat-playlist' 
                ]
                rel_proc = subprocess.Popen(rel_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                stdout, _ = rel_proc.communicate()
                
                for line in stdout.splitlines():
                    try:
                        r_data = json.loads(line)
                        r_id = r_data.get('id')
                        # Don't duplicate the exact match
                        if r_id != video_id:
                            # Helper to format duration (dup code, could be function)
                            r_dur = r_data.get('duration')
                            if r_dur:
                                m, s = divmod(int(r_dur), 60)
                                h, m = divmod(m, 60)
                                dur_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
                            else:
                                dur_str = None
                                
                            results.append({
                                'id': r_id,
                                'title': r_data.get('title', 'Unknown'),
                                'uploader': r_data.get('uploader') or r_data.get('channel') or 'Unknown',
                                'thumbnail': f"https://i.ytimg.com/vi/{r_id}/hqdefault.jpg",
                                'view_count': r_data.get('view_count', 0),
                                'upload_date': r_data.get('upload_date', ''),
                                'duration': dur_str
                            })
                    except:
                        continue
            
            return jsonify(results)

        else:
            # Standard Text Search
            cmd = [
                sys.executable, '-m', 'yt_dlp',
                f'ytsearch20:{query}',
                '--dump-json',
                '--default-search', 'ytsearch',
                '--no-playlist',
                '--flat-playlist' 
            ]
            
            # Run command
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            stdout, stderr = process.communicate()
            
            results = []
            for line in stdout.splitlines():
                try:
                    data = json.loads(line)
                    video_id = data.get('id')
                    if video_id:
                        # Format duration
                        duration_secs = data.get('duration')
                        if duration_secs:
                            mins, secs = divmod(int(duration_secs), 60)
                            hours, mins = divmod(mins, 60)
                            duration = f"{hours}:{mins:02d}:{secs:02d}" if hours else f"{mins}:{secs:02d}"
                        else:
                            duration = None
                        
                        results.append({
                            'id': video_id,
                            'title': data.get('title', 'Unknown'),
                            'uploader': data.get('uploader') or data.get('channel') or 'Unknown',
                            'thumbnail': f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                            'view_count': data.get('view_count', 0),
                            'upload_date': data.get('upload_date', ''),
                            'duration': duration
                        })
                except:
                    continue
                    
            return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Helper: Extractive Summarization ---
def extractive_summary(text, num_sentences=5):
    # 1. Clean and parse text
    # Remove metadata like [Music] (common in auto-caps)
    clean_text = re.sub(r'\[.*?\]', '', text)
    clean_text = clean_text.replace('\n', ' ')
    
    # 2. Split into sentences (simple punctuation split)
    sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s', clean_text)
    
    # 3. Tokenize and Calculate Word Frequencies
    word_frequencies = {}
    stop_words = set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'for', 'width', 'that', 'this', 'it', 'you', 'i', 'we', 'they', 'he', 'she'])
    
    for word in re.findall(r'\w+', clean_text.lower()):
        if word not in stop_words:
            if word not in word_frequencies:
                word_frequencies[word] = 1
            else:
                word_frequencies[word] += 1
                
    if not word_frequencies:
        return "Not enough content to summarize."

    # Normalize frequencies
    max_freq = max(word_frequencies.values())
    for word in word_frequencies:
        word_frequencies[word] = word_frequencies[word] / max_freq

    # 4. Score Sentences
    sentence_scores = {}
    for sent in sentences:
        for word in re.findall(r'\w+', sent.lower()):
            if word in word_frequencies:
                if sent not in sentence_scores:
                    sentence_scores[sent] = word_frequencies[word]
                else:
                    sentence_scores[sent] += word_frequencies[word]
    
    # 5. Extract Top N Sentences
    summary_sentences = heapq.nlargest(num_sentences, sentence_scores, key=sentence_scores.get)
    return ' '.join(summary_sentences)

@app.route('/api/summarize')
def summarize_video():
    video_id = request.args.get('v')
    if not video_id:
        return jsonify({'error': 'No video ID'}), 400
        
    try:
        # Fetch Transcript
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        # Try to find english or manually created first, then auto
        try:
           transcript = transcript_list.find_transcript(['en', 'vi']) 
        except:
           # Fallback to whatever is available (likely auto-generated)
           transcript = transcript_list.find_generated_transcript(['en', 'vi'])
           
        transcript_data = transcript.fetch()
        
        # Combine text
        full_text = " ".join([entry['text'] for entry in transcript_data])
        
        # Summarize
        summary = extractive_summary(full_text, num_sentences=7)
        
        return jsonify({'success': True, 'summary': summary})
        
    except TranscriptsDisabled:
        return jsonify({'success': False, 'message': 'Subtitles are disabled for this video.'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Could not summarize: {str(e)}'})

# Helper function to fetch videos (not a route)
def fetch_videos(query, limit=20, filter_type=None, playlist_start=1, playlist_end=None):
    try:
        # If no end specified, default to start + limit - 1
        if not playlist_end:
            playlist_end = playlist_start + limit - 1
            
        cmd = [
            sys.executable, '-m', 'yt_dlp',
            f'ytsearch{playlist_end}:{query}', # Explicitly request enough items to populate the list up to 'end'
            '--dump-json',
            '--default-search', 'ytsearch',
            '--no-playlist',
            '--flat-playlist',
            '--playlist-start', str(playlist_start),
            '--playlist-end', str(playlist_end)
        ]
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        
        results = []
        for line in stdout.splitlines():
            try:
                data = json.loads(line)
                video_id = data.get('id')
                if video_id:
                    # Format duration
                    duration_secs = data.get('duration')
                    
                    # Filter Logic
                    if filter_type == 'video' and duration_secs and int(duration_secs) <= 60:
                        continue
                    if filter_type == 'short' and duration_secs and int(duration_secs) > 60:
                        continue
                        
                    if duration_secs:
                        mins, secs = divmod(int(duration_secs), 60)
                        hours, mins = divmod(mins, 60)
                        duration = f"{hours}:{mins:02d}:{secs:02d}" if hours else f"{mins}:{secs:02d}"
                    else:
                        duration = None
                    
                    results.append({
                        'id': video_id,
                        'title': data.get('title', 'Unknown'),
                        'uploader': data.get('uploader') or data.get('channel') or 'Unknown',
                        'channel_id': data.get('channel_id'),
                        'uploader_id': data.get('uploader_id'),
                        'thumbnail': f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                        'view_count': data.get('view_count', 0),
                        'upload_date': data.get('upload_date', ''),
                        'duration': duration
                    })
            except:
                continue
        return results
    except Exception as e:
        print(f"Error fetching videos: {e}")
        return []

import concurrent.futures

@app.route('/api/trending')
def trending():
    try:
        category = request.args.get('category', 'all') # Default to 'all' for home
        page = int(request.args.get('page', 1))
        sort = request.args.get('sort', 'month')
        region = request.args.get('region', 'vietnam')
        limit = 120 if category != 'all' else 20 # 120 for grid, 20 for sections
        
        # Helper to build query
        def get_query(cat, reg, s_sort):
            if reg == 'vietnam':
                queries = {
                    'general': 'trending vietnam',
                    'tech': 'AI tools software tech review IT việt nam',
                    'all': 'trending vietnam',
                    'music': 'nhạc việt trending',
                    'gaming': 'gaming việt nam',
                    'movies': 'phim việt nam',
                    'news': 'tin tức việt nam hôm nay',
                    'sports': 'thể thao việt nam',
                    'shorts': 'trending việt nam',
                    'trending': 'trending việt nam',
                    'podcasts': 'podcast việt nam',
                    'live': 'live stream việt nam'
                }
            else:
                queries = {
                    'general': 'trending',
                    'tech': 'AI tools software tech review IT',
                    'all': 'trending',
                    'music': 'music trending',
                    'gaming': 'gaming trending',
                    'movies': 'movies trending',
                    'news': 'news today',
                    'sports': 'sports highlights',
                    'shorts': 'trending',
                    'trending': 'trending now',
                    'podcasts': 'podcast trending',
                    'live': 'live stream'
                }
            
            base = queries.get(cat, 'trending')
            
            from datetime import datetime, timedelta
            three_months_ago = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
            
            sort_filters = {
                'day': ', today',
                'week': ', this week',
                'month': ', this month',
                '3months': f" after:{three_months_ago}",
                'year': ', this year'
            }
            return base + sort_filters.get(s_sort, f" after:{three_months_ago}")

        # === Parallel Fetching for Home Feed ===
        if category == 'all':
            sections_to_fetch = [
                {'id': 'trending', 'title': 'Trending Now', 'icon': 'fire'},
                {'id': 'tech', 'title': 'AI & Tech', 'icon': 'microchip'},
                {'id': 'music', 'title': 'Music', 'icon': 'music'},
                {'id': 'gaming', 'title': 'Gaming', 'icon': 'gamepad'},
                {'id': 'movies', 'title': 'Movies', 'icon': 'film'},
                {'id': 'sports', 'title': 'Sports', 'icon': 'football-ball'},
                {'id': 'news', 'title': 'News', 'icon': 'newspaper'}
            ]
            
            def fetch_section(section):
                q = get_query(section['id'], region, sort)
                # Fetch 20 videos per section, page 1 logic implied (start=1)
                vids = fetch_videos(q, limit=25, filter_type='video', playlist_start=1) 
                return {
                    'id': section['id'],
                    'title': section['title'],
                    'icon': section['icon'],
                    'videos': vids[:20] 
                }

            with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
                results = list(executor.map(fetch_section, sections_to_fetch))
            
            return jsonify({'mode': 'sections', 'data': results})

        # === Standard Single Category Fetch ===
        query = get_query(category, region, sort)
        
        # Calculate offset
        start = (page - 1) * limit + 1
        
        # Determine filter type
        is_shorts_req = request.args.get('shorts')
        if is_shorts_req:
            filter_mode = 'short'
        else:
            filter_mode = 'short' if category == 'shorts' else 'video'

        results = fetch_videos(query, limit=limit, filter_type=filter_mode, playlist_start=start)
        return jsonify(results)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update_ytdlp', methods=['POST'])
def update_ytdlp():
    try:
        # Run pip install -U yt-dlp
        cmd = [sys.executable, '-m', 'pip', 'install', '-U', 'yt-dlp']
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            # Check new version
            ver_cmd = [sys.executable, '-m', 'yt_dlp', '--version']
            ver_result = subprocess.run(ver_cmd, capture_output=True, text=True)
            version = ver_result.stdout.strip()
            return jsonify({'success': True, 'message': f'Updated successfully to {version}'})
        else:
            return jsonify({'success': False, 'message': f'Update failed: {result.stderr}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/comments')
def get_comments():
    """Get comments for a YouTube video"""
    video_id = request.args.get('v')
    if not video_id:
        return jsonify({'error': 'No video ID'}), 400
    
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        cmd = [
            sys.executable, '-m', 'yt_dlp',
            url,
            '--write-comments',
            '--skip-download',
            '--dump-json'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            comments_data = data.get('comments', [])
            
            # Format comments for frontend
            comments = []
            for c in comments_data[:50]:  # Limit to 50 comments
                comments.append({
                    'author': c.get('author', 'Unknown'),
                    'author_thumbnail': c.get('author_thumbnail', ''),
                    'text': c.get('text', ''),
                    'likes': c.get('like_count', 0),
                    'time': c.get('time_text', ''),
                    'is_pinned': c.get('is_pinned', False)
                })
            
            return jsonify({
                'comments': comments,
                'count': data.get('comment_count', len(comments))
            })
        else:
            return jsonify({'comments': [], 'count': 0, 'error': 'Could not load comments'})
            
    except subprocess.TimeoutExpired:
        return jsonify({'comments': [], 'count': 0, 'error': 'Comments loading timed out'})
    except Exception as e:
        return jsonify({'comments': [], 'count': 0, 'error': str(e)})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
