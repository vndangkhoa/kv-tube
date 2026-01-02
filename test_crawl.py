import sys
import subprocess
import json
import time

def test_fetch(query, label):
    print(f"--- Testing Query: '{query}' ({label}) ---")
    limit = 150
    cmd = [
        sys.executable, '-m', 'yt_dlp',
        f'ytsearch{limit}:{query}', 
        '--dump-json',
        '--default-search', 'ytsearch',
        '--no-playlist',
        '--flat-playlist',
        '--playlist-start', '1',
        '--playlist-end', str(limit)
    ]
    
    start_time = time.time()
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
    except Exception as e:
        print(f"Error running command: {e}")
        return

    raw_count = 0
    valid_count = 0
    
    for line in stdout.splitlines():
        try:
            data = json.loads(line)
            raw_count += 1
            
            # Simulate our strict filter filters
            video_id = data.get('id')
            title = data.get('title', '').lower()
            duration_secs = data.get('duration')
            
            if not video_id: continue
            
            # Title Filter
            if '#shorts' in title:
                continue
                
            # Duration Filter (Loose: allow missing, strict if present)
            if duration_secs and int(duration_secs) <= 70:
                continue
            
            # If we are here, it's valid
            valid_count += 1
            
        except:
            continue
            
    elapsed = time.time() - start_time
    print(f"Raw Results: {raw_count}")
    print(f"Valid Horizontal Videos (filtered): {valid_count}")
    print(f"Time Taken: {elapsed:.2f}s")
    print("-" * 30)

if __name__ == "__main__":
    # Test queries from app.py
    test_fetch("review công nghệ điện thoại laptop", "Vietnam Tech")
    test_fetch("tech gadget review smartphone", "Global Tech")
