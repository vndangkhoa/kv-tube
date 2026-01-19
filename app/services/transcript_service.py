"""
Transcript Service Module
Fetches video transcripts with fallback strategy: yt-dlp -> ytfetcher
"""
import os
import re
import glob
import json
import random
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class TranscriptService:
    """Service for fetching YouTube video transcripts with fallback support."""
    
    @classmethod
    def get_transcript(cls, video_id: str) -> Optional[str]:
        """
        Get transcript text for a video.
        
        Strategy:
        1. Try yt-dlp (current method, handles auto-generated captions)
        2. Fallback to ytfetcher library if yt-dlp fails
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Transcript text or None if unavailable
        """
        video_id = video_id.strip()
        
        # Try yt-dlp first (primary method)
        text = cls._fetch_with_ytdlp(video_id)
        if text:
            logger.info(f"Transcript fetched via yt-dlp for {video_id}")
            return text
            
        # Fallback to ytfetcher
        logger.info(f"yt-dlp failed, trying ytfetcher for {video_id}")
        text = cls._fetch_with_ytfetcher(video_id)
        if text:
            logger.info(f"Transcript fetched via ytfetcher for {video_id}")
            return text
            
        logger.warning(f"All transcript methods failed for {video_id}")
        return None
    
    @classmethod
    def _fetch_with_ytdlp(cls, video_id: str) -> Optional[str]:
        """Fetch transcript using yt-dlp (downloading subtitles to file)."""
        import yt_dlp
        
        try:
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
                'outtmpl': f"/tmp/{temp_prefix}",
                'subtitlesformat': 'json3/vtt/best',
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
                
                # Find the downloaded file
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
                    if selected_file:
                        break
                
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
                
                # Parse based on format
                if selected_file.endswith('.json3') or content.strip().startswith('{'):
                    return cls._parse_json3(content)
                else:
                    return cls._parse_vtt(content)

        except Exception as e:
            logger.error(f"yt-dlp transcript fetch failed: {e}")
            return None
    
    @classmethod
    def _fetch_with_ytfetcher(cls, video_id: str) -> Optional[str]:
        """Fetch transcript using ytfetcher library as fallback."""
        try:
            from ytfetcher import YTFetcher
            
            logger.info(f"Using ytfetcher for {video_id}")
            
            # Create fetcher for single video
            fetcher = YTFetcher.from_video_ids(video_ids=[video_id])
            
            # Fetch transcripts
            data = fetcher.fetch_transcripts()
            
            if not data:
                logger.warning(f"ytfetcher returned no data for {video_id}")
                return None
            
            # Extract text from transcript objects
            text_parts = []
            for item in data:
                transcripts = getattr(item, 'transcripts', []) or []
                for t in transcripts:
                    txt = getattr(t, 'text', '') or ''
                    txt = txt.strip()
                    if txt and txt != '\n':
                        text_parts.append(txt)
            
            if not text_parts:
                logger.warning(f"ytfetcher returned empty transcripts for {video_id}")
                return None
                
            return " ".join(text_parts)
            
        except ImportError:
            logger.warning("ytfetcher not installed. Run: pip install ytfetcher")
            return None
        except Exception as e:
            logger.error(f"ytfetcher transcript fetch failed: {e}")
            return None
    
    @staticmethod
    def _parse_json3(content: str) -> Optional[str]:
        """Parse JSON3 subtitle format."""
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
        except Exception as e:
            logger.warning(f"JSON3 parse failed: {e}")
            return None
    
    @staticmethod
    def _parse_vtt(content: str) -> Optional[str]:
        """Parse VTT/XML subtitle content."""
        try:
            lines = content.splitlines()
            text_lines = []
            seen = set()
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                if "-->" in line:
                    continue
                if line.isdigit():
                    continue
                if line.startswith("WEBVTT"):
                    continue
                if line.startswith("Kind:"):
                    continue
                if line.startswith("Language:"):
                    continue
                
                # Remove tags like <c> or <00:00:00>
                clean = re.sub(r'<[^>]+>', '', line)
                if clean and clean not in seen:
                    seen.add(clean)
                    text_lines.append(clean)
                    
            return " ".join(text_lines)
                
        except Exception as e:
            logger.error(f"VTT transcript parse error: {e}")
            return None
