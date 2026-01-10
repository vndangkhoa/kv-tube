"""
Template Formatters Module
Jinja2 template filters for formatting views and dates
"""
from datetime import datetime, timedelta


def format_views(views) -> str:
    """Format view count (YouTube style: 1.2M, 3.5K)"""
    if not views:
        return '0'
    try:
        num = int(views)
        if num >= 1_000_000_000:
            return f"{num / 1_000_000_000:.1f}B"
        if num >= 1_000_000:
            return f"{num / 1_000_000:.1f}M"
        if num >= 1_000:
            return f"{num / 1_000:.0f}K"
        return f"{num:,}"
    except (ValueError, TypeError):
        return str(views)


def format_date(value) -> str:
    """Format date to relative time (YouTube style: 2 hours ago, 3 days ago)"""
    if not value:
        return 'Recently'
    
    try:
        # Handle YYYYMMDD format
        if len(str(value)) == 8 and str(value).isdigit():
            dt = datetime.strptime(str(value), '%Y%m%d')
        # Handle timestamp
        elif isinstance(value, (int, float)):
            dt = datetime.fromtimestamp(value)
        # Handle datetime object
        elif isinstance(value, datetime):
            dt = value
        # Handle YYYY-MM-DD string
        else:
            try:
                dt = datetime.strptime(str(value), '%Y-%m-%d')
            except ValueError:
                return str(value)
        
        now = datetime.now()
        diff = now - dt
        
        if diff.days > 365:
            years = diff.days // 365
            return f"{years} year{'s' if years > 1 else ''} ago"
        if diff.days > 30:
            months = diff.days // 30
            return f"{months} month{'s' if months > 1 else ''} ago"
        if diff.days > 7:
            weeks = diff.days // 7
            return f"{weeks} week{'s' if weeks > 1 else ''} ago"
        if diff.days > 0:
            return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
        if diff.seconds > 3600:
            hours = diff.seconds // 3600
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        if diff.seconds > 60:
            minutes = diff.seconds // 60
            return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
        return "Just now"
        
    except Exception:
        return str(value)


def format_duration(seconds) -> str:
    """Format duration in seconds to HH:MM:SS or MM:SS"""
    if not seconds:
        return ''
    
    try:
        secs = int(seconds)
        mins, secs = divmod(secs, 60)
        hours, mins = divmod(mins, 60)
        
        if hours:
            return f"{hours}:{mins:02d}:{secs:02d}"
        return f"{mins}:{secs:02d}"
        
    except (ValueError, TypeError):
        return ''


def register_filters(app):
    """Register all template filters with Flask app"""
    app.template_filter('format_views')(format_views)
    app.template_filter('format_date')(format_date)
    app.template_filter('format_duration')(format_duration)
