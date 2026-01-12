"""
KV-Tube App Package
Flask application factory pattern
"""
from flask import Flask
import os
import sqlite3
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration
DATA_DIR = os.environ.get("KVTUBE_DATA_DIR", "data")
DB_NAME = os.path.join(DATA_DIR, "kvtube.db")


def init_db():
    """Initialize the database with required tables."""
    # Ensure data directory exists
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    
    # Users Table
    c.execute("""CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL
                )""")
    
    # User Videos (history/saved)
    c.execute("""CREATE TABLE IF NOT EXISTS user_videos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    video_id TEXT,
                    title TEXT,
                    thumbnail TEXT,
                    type TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )""")
    
    # Video Cache
    c.execute("""CREATE TABLE IF NOT EXISTS video_cache (
                    video_id TEXT PRIMARY KEY,
                    data TEXT,
                    expires_at DATETIME
                )""")
    
    conn.commit()
    conn.close()
    logger.info("Database initialized")


def create_app(config_name=None):
    """
    Application factory for creating Flask app instances.
    
    Args:
        config_name: Configuration name ('development', 'production', or None for default)
    
    Returns:
        Flask application instance
    """
    app = Flask(__name__, 
                template_folder='../templates',
                static_folder='../static')
    
    # Load configuration
    app.secret_key = "super_secret_key_change_this"  # Required for sessions
    
    # Fix for OMP: Error #15
    os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
    
    # Initialize database
    init_db()
    
    # Register Jinja filters
    register_filters(app)
    
    # Register Blueprints
    register_blueprints(app)
    
    logger.info("KV-Tube app created successfully")
    return app


def register_filters(app):
    """Register custom Jinja2 template filters."""
    
    @app.template_filter("format_views")
    def format_views(views):
        if not views:
            return "0"
        try:
            num = int(views)
            if num >= 1000000:
                return f"{num / 1000000:.1f}M"
            if num >= 1000:
                return f"{num / 1000:.0f}K"
            return f"{num:,}"
        except (ValueError, TypeError) as e:
            logger.debug(f"View formatting failed: {e}")
            return str(views)

    @app.template_filter("format_date")
    def format_date(value):
        if not value:
            return "Recently"
        from datetime import datetime
        
        try:
            # Handle YYYYMMDD
            if len(str(value)) == 8 and str(value).isdigit():
                dt = datetime.strptime(str(value), "%Y%m%d")
            # Handle Timestamp
            elif isinstance(value, (int, float)):
                dt = datetime.fromtimestamp(value)
            # Handle YYYY-MM-DD
            else:
                try:
                    dt = datetime.strptime(str(value), "%Y-%m-%d")
                except ValueError:
                    return str(value)

            now = datetime.now()
            diff = now - dt

            if diff.days > 365:
                return f"{diff.days // 365} years ago"
            if diff.days > 30:
                return f"{diff.days // 30} months ago"
            if diff.days > 0:
                return f"{diff.days} days ago"
            if diff.seconds > 3600:
                return f"{diff.seconds // 3600} hours ago"
            return "Just now"
        except Exception as e:
            logger.debug(f"Date formatting failed: {e}")
            return str(value)


def register_blueprints(app):
    """Register all application blueprints."""
    from app.routes import pages_bp, api_bp, streaming_bp
    
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(streaming_bp)
    
    logger.info("Blueprints registered: pages, api, streaming")
