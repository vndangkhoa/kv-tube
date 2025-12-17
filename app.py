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

# Configuration for local video path - configurable via env var
VIDEO_DIR = os.environ.get('KVTUBE_VIDEO_DIR', './videos')

@app.route('/')
def index():
    return render_template('index.html', page='home')

@app.route('/my-videos')
@login_required
def my_videos():
    filter_type = request.args.get('type', 'saved') # 'saved' or 'history'
    
    conn = get_db_connection()
    videos = conn.execute('''
        SELECT * FROM user_videos 
        WHERE user_id = ? AND type = ? 
        ORDER BY timestamp DESC
    ''', (session['user_id'], filter_type)).fetchall()
    conn.close()
    
    return render_template('my_videos.html', videos=videos, filter_type=filter_type)

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
            related_videos = fetch_videos(search_query, limit=10)
        except:
            pass

        # Extract Subtitles (English preferred)
        subtitle_url = None
        start_lang = 'en'
        
        subs = info.get('subtitles') or {}
        auto_subs = info.get('automatic_captions') or {}
        
        # Check manual subs first
        if 'en' in subs:
            subtitle_url = subs['en'][0]['url']
        elif 'vi' in subs:  # Vietnamese fallback
            subtitle_url = subs['vi'][0]['url']
        # Check auto subs
        elif 'en' in auto_subs:
            subtitle_url = auto_subs['en'][0]['url']
        
        # If still none, just pick the first one from manual
        if not subtitle_url and subs:
            first_key = list(subs.keys())[0]
            subtitle_url = subs[first_key][0]['url']

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

@app.route('/api/trending')
def fetch_videos(query, limit=20):
    try:
        cmd = [
            sys.executable, '-m', 'yt_dlp',
            f'ytsearch{limit}:{query}',
            '--dump-json',
            '--default-search', 'ytsearch',
            '--no-playlist',
            '--flat-playlist'
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
        return results
    except Exception as e:
        print(f"Error fetching videos: {e}")
        return []

@app.route('/api/trending')
def trending():
    try:
        category = request.args.get('category', 'general')
        page = int(request.args.get('page', 1))
        sort = request.args.get('sort', 'month')
        region = request.args.get('region', 'vietnam')
        limit = 20
        
        # Define search queries
        if region == 'vietnam':
            queries = {
                'general': 'trending vietnam',
                'tech': 'AI tools software tech review IT việt nam',
                'all': 'trending vietnam',
                'music': 'nhạc việt trending',
                'gaming': 'gaming việt nam',
                'movies': 'phim việt nam',
                'news': 'tin tức việt nam hôm nay',
                'sports': 'thể thao việt nam',
                'shorts': 'shorts việt nam',
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
                'shorts': 'shorts trending',
                'trending': 'trending now',
                'podcasts': 'podcast trending',
                'live': 'live stream'
            }
        
        base_query = queries.get(category, 'trending vietnam' if region == 'vietnam' else 'trending')
        
        # Add sort filter
        sort_filters = {
            'day': ', today',
            'week': ', this week',
            'month': ', this month',
            'year': ', this year'
        }
        query = base_query + sort_filters.get(sort, ', this month')
        
        # For pagination, we can't easily offset ytsearch efficiently without fetching all previous
        # So we'll fetch a larger chunk and slice it in python, or just accept that page 2 is similar
        # A simple hack for "randomness" or pages is to append a random term or year, but let's stick to standard behavior
        # Or better: search for "query page X"
        if page > 1:
            query += f" page {page}"

        results = fetch_videos(query, limit=limit)
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
