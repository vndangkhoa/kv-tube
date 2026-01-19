"""
KV-Tube Configuration Module
Centralizes all configuration with environment variable support
"""
import os
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', os.urandom(32).hex())
    
    # Database
    DATA_DIR = os.environ.get('KVTUBE_DATA_DIR', 'data')
    DB_NAME = os.path.join(DATA_DIR, 'kvtube.db')
    
    # Video storage
    VIDEO_DIR = os.environ.get('KVTUBE_VIDEO_DIR', './videos')
    
    # Rate limiting
    RATELIMIT_DEFAULT = "60/minute"
    RATELIMIT_SEARCH = "30/minute"
    RATELIMIT_STREAM = "120/minute"
    
    # Cache settings (in seconds)
    CACHE_VIDEO_TTL = 3600  # 1 hour
    CACHE_CHANNEL_TTL = 1800  # 30 minutes
    
    # yt-dlp settings
    # yt-dlp settings - MUST use progressive formats with combined audio+video
    # Format 22 = 720p mp4, 18 = 360p mp4 (both have audio+video combined)
    # HLS m3u8 streams have CORS issues with segment proxying, so we avoid them
    YTDLP_FORMAT = '22/18/best[protocol^=https][ext=mp4]/best[ext=mp4]/best'
    YTDLP_TIMEOUT = 30
    
    # YouTube Engine Settings
    YOUTUBE_ENGINE = os.environ.get('YOUTUBE_ENGINE', 'auto')  # auto, local, remote
    LOADER_TO_API_KEY = os.environ.get('LOADER_TO_API_KEY', '')  # Optional
    
    @staticmethod
    def init_app(app):
        """Initialize app with config"""
        # Ensure data directory exists
        os.makedirs(Config.DATA_DIR, exist_ok=True)


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    FLASK_ENV = 'development'


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    FLASK_ENV = 'production'


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
