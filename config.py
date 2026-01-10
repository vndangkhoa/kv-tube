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
    YTDLP_FORMAT = 'best[ext=mp4]/best'
    YTDLP_TIMEOUT = 30
    
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
