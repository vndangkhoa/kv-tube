"""
KV-Tube Routes Package
Exports all Blueprints for registration
"""
from app.routes.pages import pages_bp
from app.routes.api import api_bp
from app.routes.streaming import streaming_bp

__all__ = ['pages_bp', 'api_bp', 'streaming_bp']
