"""
YouTube Service Module
Handles all yt-dlp interactions using the library directly (not subprocess)
"""
import yt_dlp
import logging
from typing import Optional, List, Dict, Any
from config import Config
from app.services.loader_to import LoaderToService
from app.services.settings import SettingsService

logger = logging.getLogger(__name__)


class YouTubeService:
    """Service for fetching YouTube content using yt-dlp library"""
    
    # Common yt-dlp options
    BASE_OPTS = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': 'in_playlist',
        'force_ipv4': True,
        'socket_timeout': Config.YTDLP_TIMEOUT,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
    
    @staticmethod
    def sanitize_video_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize and format video data from yt-dlp"""
        video_id = data.get('id', '')
        duration_secs = data.get('duration')
        
        # Format duration
        duration_str = None
        if duration_secs:
            mins, secs = divmod(int(duration_secs), 60)
            hours, mins = divmod(mins, 60)
            duration_str = f"{hours}:{mins:02d}:{secs:02d}" if hours else f"{mins}:{secs:02d}"
        
        return {
            'id': video_id,
            'title': data.get('title', 'Unknown'),
            'uploader': data.get('uploader') or data.get('channel') or 'Unknown',
            'channel_id': data.get('channel_id'),
            'uploader_id': data.get('uploader_id'),
            'thumbnail': f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else None,
            'view_count': data.get('view_count', 0),
            'upload_date': data.get('upload_date', ''),
            'duration': duration_str,
            'description': data.get('description', ''),
        }
    
    @classmethod
    def search_videos(cls, query: str, limit: int = 20, filter_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Search for videos using yt-dlp library directly
        
        Args:
            query: Search query
            limit: Maximum number of results
            filter_type: 'video' to exclude shorts, 'short' for only shorts
        
        Returns:
            List of sanitized video data dictionaries
        """
        try:
            search_url = f"ytsearch{limit}:{query}"
            
            ydl_opts = {
                **cls.BASE_OPTS,
                'extract_flat': True,
                'playlist_items': f'1:{limit}',
            }
            
            results = []
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(search_url, download=False)
                entries = info.get('entries', []) if info else []
                
                for entry in entries:
                    if not entry or not entry.get('id'):
                        continue
                    
                    # Filter logic
                    title_lower = (entry.get('title') or '').lower()
                    duration_secs = entry.get('duration')
                    
                    if filter_type == 'video':
                        # Exclude shorts
                        if '#shorts' in title_lower:
                            continue
                        if duration_secs and int(duration_secs) <= 70:
                            continue
                    elif filter_type == 'short':
                        # Only shorts
                        if duration_secs and int(duration_secs) > 60:
                            continue
                    
                    results.append(cls.sanitize_video_data(entry))
            
            return results
            
        except Exception as e:
            logger.error(f"Search error for '{query}': {e}")
            return []
    
    @classmethod
    def get_video_info(cls, video_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed video information including stream URL
        
        Args:
            video_id: YouTube video ID
        
        Returns:
            Video info dict with stream_url, or None on error
        """
        engine = SettingsService.get('youtube_engine', 'auto')
        
        # 1. Force Remote
        if engine == 'remote':
            return cls._get_info_remote(video_id)
            
        # 2. Local (or Auto first attempt)
        info = cls._get_info_local(video_id)
        
        if info:
            return info
            
        # 3. Failover if Auto
        if engine == 'auto' and not info:
            logger.warning(f"yt-dlp failed for {video_id}, falling back to remote loader")
            return cls._get_info_remote(video_id)
            
        return None

    @classmethod
    def _get_info_remote(cls, video_id: str) -> Optional[Dict[str, Any]]:
        """Fetch info using LoaderToService"""
        url = f"https://www.youtube.com/watch?v={video_id}"
        return LoaderToService.get_stream_url(url)

    @classmethod
    def _get_info_local(cls, video_id: str) -> Optional[Dict[str, Any]]:
        """Fetch info using yt-dlp (original logic)"""
        try:
            url = f"https://www.youtube.com/watch?v={video_id}"
            
            ydl_opts = {
                **cls.BASE_OPTS,
                'format': Config.YTDLP_FORMAT,
                'noplaylist': True,
                'skip_download': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                if not info:
                    return None
                
                stream_url = info.get('url')
                if not stream_url:
                    logger.warning(f"No stream URL found for {video_id}")
                    return None
                
                # Get subtitles
                subtitle_url = cls._extract_subtitle_url(info)
                
                return {
                    'stream_url': stream_url,
                    'title': info.get('title', 'Unknown'),
                    'description': info.get('description', ''),
                    'uploader': info.get('uploader', ''),
                    'uploader_id': info.get('uploader_id', ''),
                    'channel_id': info.get('channel_id', ''),
                    'upload_date': info.get('upload_date', ''),
                    'view_count': info.get('view_count', 0),
                    'subtitle_url': subtitle_url,
                    'duration': info.get('duration'),
                    'thumbnail': info.get('thumbnail') or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                    'http_headers': info.get('http_headers', {})
                }
                
        except Exception as e:
            logger.error(f"Error getting local video info for {video_id}: {e}")
            return None
    
    @staticmethod
    def _extract_subtitle_url(info: Dict[str, Any]) -> Optional[str]:
        """Extract best subtitle URL from video info"""
        subs = info.get('subtitles') or {}
        auto_subs = info.get('automatic_captions') or {}
        
        # Priority: en manual > vi manual > en auto > vi auto > first available
        for lang in ['en', 'vi']:
            if lang in subs and subs[lang]:
                return subs[lang][0].get('url')
        
        for lang in ['en', 'vi']:
            if lang in auto_subs and auto_subs[lang]:
                return auto_subs[lang][0].get('url')
        
        # Fallback to first available
        if subs:
            first_key = list(subs.keys())[0]
            if subs[first_key]:
                return subs[first_key][0].get('url')
        
        if auto_subs:
            first_key = list(auto_subs.keys())[0]
            if auto_subs[first_key]:
                return auto_subs[first_key][0].get('url')
        
        return None
    
    @classmethod
    def get_channel_videos(cls, channel_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get videos from a YouTube channel
        
        Args:
            channel_id: Channel ID, handle (@username), or URL
            limit: Maximum number of videos
        
        Returns:
            List of video data dictionaries
        """
        try:
            # Construct URL based on ID format
            if channel_id.startswith('http'):
                url = channel_id
            elif channel_id.startswith('@'):
                url = f"https://www.youtube.com/{channel_id}"
            elif len(channel_id) == 24 and channel_id.startswith('UC'):
                url = f"https://www.youtube.com/channel/{channel_id}"
            else:
                url = f"https://www.youtube.com/{channel_id}"
            
            ydl_opts = {
                **cls.BASE_OPTS,
                'extract_flat': True,
                'playlist_items': f'1:{limit}',
            }
            
            results = []
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                entries = info.get('entries', []) if info else []
                
                for entry in entries:
                    if entry and entry.get('id'):
                        results.append(cls.sanitize_video_data(entry))
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting channel videos for {channel_id}: {e}")
            return []
    
    @classmethod
    def get_related_videos(cls, title: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get videos related to a given title"""
        query = f"{title} related"
        return cls.search_videos(query, limit=limit, filter_type='video')
    
    @classmethod
    def get_download_url(cls, video_id: str) -> Optional[Dict[str, str]]:
        """
        Get direct download URL (non-HLS) for a video
        
        Returns:
            Dict with 'url', 'title', 'ext' or None
        """
        try:
            url = f"https://www.youtube.com/watch?v={video_id}"
            
            ydl_opts = {
                **cls.BASE_OPTS,
                'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best[protocol!*=m3u8]/best',
                'noplaylist': True,
                'skip_download': True,
                'youtube_include_dash_manifest': False,
                'youtube_include_hls_manifest': False,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                download_url = info.get('url', '')
                
                # If m3u8, try to find non-HLS format
                if '.m3u8' in download_url or not download_url:
                    formats = info.get('formats', [])
                    for f in reversed(formats):
                        f_url = f.get('url', '')
                        if f_url and 'm3u8' not in f_url and f.get('ext') == 'mp4':
                            download_url = f_url
                            break
                
                if download_url and '.m3u8' not in download_url:
                    return {
                        'url': download_url,
                        'title': info.get('title', 'video'),
                        'ext': 'mp4'
                    }
                
                return None
                
        except Exception as e:
            logger.error(f"Error getting download URL for {video_id}: {e}")
            return None
