import yt_dlp
import requests
import json
import traceback

def _parse_json3_subtitles(data):
    """Parse YouTube json3 subtitle format into simplified format"""
    transcript = []
    events = data.get('events', [])
    
    for event in events:
        # Skip non-text events
        if 'segs' not in event:
            continue
        
        start_ms = event.get('tStartMs', 0)
        duration_ms = event.get('dDurationMs', 0)
        
        # Combine all segments in this event
        text_parts = []
        for seg in event.get('segs', []):
            text = seg.get('utf8', '')
            if text and text.strip():
                text_parts.append(text)
        
        combined_text = ''.join(text_parts).strip()
        if combined_text:
            transcript.append({
                'text': combined_text,
                'start': start_ms / 1000.0,  # Convert to seconds
                'duration': duration_ms / 1000.0 if duration_ms else 2.0  # Default 2s
            })
    
    return transcript

def debug(video_id):
    print(f"DEBUGGING VIDEO: {video_id}")
    url = f"https://www.youtube.com/watch?v={video_id}"
    languages = ['en', 'vi']
    
    # Use a temp filename template
    import os
    temp_template = f"temp_subs_{video_id}"
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': languages,
        'subtitlesformat': 'json3',
        'outtmpl': temp_template,
    }
    
    try:
        # cleanup old files
        for f in os.listdir('.'):
            if f.startswith(temp_template):
                os.remove(f)

        print("Downloading subtitles via yt-dlp...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # We must enable download=True for it to write files, but skip_download=True in opts prevents video DL
            ydl.download([url])
            
        # Find the downloaded file
        downloaded_file = None
        for f in os.listdir('.'):
            if f.startswith(temp_template) and f.endswith('.json3'):
                downloaded_file = f
                break
        
        if downloaded_file:
            print(f"Downloaded file: {downloaded_file}")
            with open(downloaded_file, 'r', encoding='utf-8') as f:
                sub_data = json.load(f)
                transcript_data = _parse_json3_subtitles(sub_data)
                print(f"Parsed {len(transcript_data)} items")
                # print(f"First 3: {transcript_data[:3]}")
                
            # Cleanup
            os.remove(downloaded_file)
        else:
            print("No subtitle file found after download attempt.")

    except Exception as e:
        traceback.print_exc()

    except Exception as e:
        traceback.print_exc()

if __name__ == '__main__':
    debug('dQw4w9WgXcQ')
