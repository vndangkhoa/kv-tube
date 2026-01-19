
import requests
import time
import logging
import json
from typing import Optional, Dict, Any
from config import Config

logger = logging.getLogger(__name__)

class LoaderToService:
    """Service for interacting with loader.to / savenow.to API"""
    
    BASE_URL = "https://p.savenow.to"
    DOWNLOAD_ENDPOINT = "/ajax/download.php"
    PROGRESS_ENDPOINT = "/api/progress"
    
    @classmethod
    def get_stream_url(cls, video_url: str, format_id: str = "1080") -> Optional[Dict[str, Any]]:
        """
        Get download URL for a video via loader.to
        
        Args:
            video_url: Full YouTube URL
            format_id: Target format (1080, 720, 4k, etc.)
            
        Returns:
            Dict containing 'stream_url' and available metadata, or None
        """
        try:
            # 1. Initiate Download
            params = {
                'format': format_id,
                'url': video_url,
                'api_key': Config.LOADER_TO_API_KEY
            }
            
            # Using curl-like headers to avoid bot detection
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://loader.to/',
                'Origin': 'https://loader.to'
            }
            
            logger.info(f"Initiating Loader.to fetch for {video_url}")
            response = requests.get(
                f"{cls.BASE_URL}{cls.DOWNLOAD_ENDPOINT}", 
                params=params, 
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if not data.get('success') and not data.get('id'):
                logger.error(f"Loader.to initial request failed: {data}")
                return None
                
            task_id = data.get('id')
            info = data.get('info', {})
            logger.info(f"Loader.to task started: {task_id}")
            
            # 2. Poll for progress
            # Timeout after 60 seconds
            start_time = time.time()
            while time.time() - start_time < 60:
                progress_url = data.get('progress_url')
                # If progress_url is missing, construct it manually (fallback)
                if not progress_url and task_id:
                     progress_url = f"{cls.BASE_URL}/api/progress?id={task_id}"

                if not progress_url:
                     logger.error("No progress URL found")
                     return None

                p_res = requests.get(progress_url, headers=headers, timeout=10)
                if p_res.status_code != 200:
                    logger.warning(f"Progress check failed: {p_res.status_code}")
                    time.sleep(2)
                    continue
                    
                p_data = p_res.json()
                
                # Check for success (success can be boolean true or int 1)
                is_success = p_data.get('success') in [True, 1, '1']
                text_status = p_data.get('text', '').lower()
                
                if is_success and p_data.get('download_url'):
                    logger.info("Loader.to extraction successful")
                    return {
                        'stream_url': p_data['download_url'],
                        'title': info.get('title') or 'Unknown Title',
                        'thumbnail': info.get('image'),
                        # Add basic fields to match yt-dlp dict structure
                        'description': f"Fetched via Loader.to (Format: {format_id})",
                        'uploader': 'Unknown',
                        'duration': None,
                        'view_count': 0
                    }
                
                # Check for failure
                if 'error' in text_status or 'failed' in text_status: 
                   logger.error(f"Loader.to task failed: {text_status}")
                   return None

                # Wait before next poll
                time.sleep(2)
            
            logger.error("Loader.to timed out waiting for video")
            return None
            
        except Exception as e:
            logger.error(f"Loader.to service error: {e}")
            return None
