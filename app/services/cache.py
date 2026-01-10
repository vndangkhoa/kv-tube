"""
Cache Service Module
SQLite-based caching with connection pooling
"""
import sqlite3
import json
import time
import threading
import logging
from typing import Optional, Any, Dict
from contextlib import contextmanager
from config import Config

logger = logging.getLogger(__name__)


class ConnectionPool:
    """Thread-safe SQLite connection pool"""
    
    def __init__(self, db_path: str, max_connections: int = 5):
        self.db_path = db_path
        self.max_connections = max_connections
        self._local = threading.local()
        self._lock = threading.Lock()
        self._init_db()
    
    def _init_db(self):
        """Initialize database tables"""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        # Users table
        c.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )''')
        
        # User videos (history/saved)
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
        
        # Video cache
        c.execute('''CREATE TABLE IF NOT EXISTS video_cache (
            video_id TEXT PRIMARY KEY,
            data TEXT,
            expires_at REAL
        )''')
        
        conn.commit()
        conn.close()
    
    def get_connection(self) -> sqlite3.Connection:
        """Get a thread-local database connection"""
        if not hasattr(self._local, 'connection') or self._local.connection is None:
            self._local.connection = sqlite3.connect(self.db_path)
            self._local.connection.row_factory = sqlite3.Row
        return self._local.connection
    
    @contextmanager
    def connection(self):
        """Context manager for database connections"""
        conn = self.get_connection()
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Database error: {e}")
            raise
    
    def close(self):
        """Close the thread-local connection"""
        if hasattr(self._local, 'connection') and self._local.connection:
            self._local.connection.close()
            self._local.connection = None


# Global connection pool
_pool: Optional[ConnectionPool] = None


def get_pool() -> ConnectionPool:
    """Get or create the global connection pool"""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(Config.DB_NAME)
    return _pool


def get_db_connection() -> sqlite3.Connection:
    """Get a database connection - backward compatibility"""
    return get_pool().get_connection()


class CacheService:
    """Service for caching video metadata"""
    
    @staticmethod
    def get_video_cache(video_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached video data if not expired
        
        Args:
            video_id: YouTube video ID
        
        Returns:
            Cached data dict or None if not found/expired
        """
        try:
            pool = get_pool()
            with pool.connection() as conn:
                row = conn.execute(
                    'SELECT data, expires_at FROM video_cache WHERE video_id = ?',
                    (video_id,)
                ).fetchone()
                
                if row:
                    expires_at = float(row['expires_at'])
                    if time.time() < expires_at:
                        return json.loads(row['data'])
                    else:
                        # Expired, clean it up
                        conn.execute('DELETE FROM video_cache WHERE video_id = ?', (video_id,))
                
                return None
                
        except Exception as e:
            logger.error(f"Cache get error for {video_id}: {e}")
            return None
    
    @staticmethod
    def set_video_cache(video_id: str, data: Dict[str, Any], ttl: int = None) -> bool:
        """
        Cache video data
        
        Args:
            video_id: YouTube video ID
            data: Data to cache
            ttl: Time to live in seconds (default from config)
        
        Returns:
            True if cached successfully
        """
        try:
            if ttl is None:
                ttl = Config.CACHE_VIDEO_TTL
            
            expires_at = time.time() + ttl
            
            pool = get_pool()
            with pool.connection() as conn:
                conn.execute(
                    'INSERT OR REPLACE INTO video_cache (video_id, data, expires_at) VALUES (?, ?, ?)',
                    (video_id, json.dumps(data), expires_at)
                )
            
            return True
            
        except Exception as e:
            logger.error(f"Cache set error for {video_id}: {e}")
            return False
    
    @staticmethod
    def clear_expired():
        """Remove all expired cache entries"""
        try:
            pool = get_pool()
            with pool.connection() as conn:
                conn.execute('DELETE FROM video_cache WHERE expires_at < ?', (time.time(),))
                
        except Exception as e:
            logger.error(f"Cache cleanup error: {e}")


class HistoryService:
    """Service for user video history"""
    
    @staticmethod
    def get_history(limit: int = 50) -> list:
        """Get watch history"""
        try:
            pool = get_pool()
            with pool.connection() as conn:
                rows = conn.execute(
                    'SELECT video_id as id, title, thumbnail FROM user_videos WHERE type = "history" ORDER BY timestamp DESC LIMIT ?',
                    (limit,)
                ).fetchall()
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"History get error: {e}")
            return []
    
    @staticmethod
    def add_to_history(video_id: str, title: str, thumbnail: str) -> bool:
        """Add a video to history"""
        try:
            pool = get_pool()
            with pool.connection() as conn:
                conn.execute(
                    'INSERT INTO user_videos (user_id, video_id, title, thumbnail, type) VALUES (?, ?, ?, ?, ?)',
                    (1, video_id, title, thumbnail, 'history')
                )
            return True
            
        except Exception as e:
            logger.error(f"History add error: {e}")
            return False
