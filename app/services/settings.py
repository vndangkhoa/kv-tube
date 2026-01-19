
import json
import os
import logging
from config import Config

logger = logging.getLogger(__name__)

class SettingsService:
    """Manage application settings using a JSON file"""
    
    SETTINGS_FILE = os.path.join(Config.DATA_DIR, 'settings.json')
    
    # Default settings
    DEFAULTS = {
        'youtube_engine': 'auto',  # auto, local, remote
    }
    
    @classmethod
    def _load_settings(cls) -> dict:
        """Load settings from file or return defaults"""
        try:
            if os.path.exists(cls.SETTINGS_FILE):
                with open(cls.SETTINGS_FILE, 'r') as f:
                    data = json.load(f)
                    # Merge with defaults to ensure all keys exist
                    return {**cls.DEFAULTS, **data}
        except Exception as e:
            logger.error(f"Error loading settings: {e}")
        
        return cls.DEFAULTS.copy()

    @classmethod
    def get(cls, key: str, default=None):
        """Get a setting value"""
        settings = cls._load_settings()
        return settings.get(key, default if default is not None else cls.DEFAULTS.get(key))

    @classmethod
    def set(cls, key: str, value):
        """Set a setting value and persist"""
        settings = cls._load_settings()
        settings[key] = value
        
        try:
            with open(cls.SETTINGS_FILE, 'w') as f:
                json.dump(settings, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving settings: {e}")
            raise

    @classmethod
    def get_all(cls):
        """Get all settings"""
        return cls._load_settings()
