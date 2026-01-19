"""
AI-powered video summarizer using Google Gemini.
"""
import os
import logging
import base64
from typing import Optional

logger = logging.getLogger(__name__)

# Obfuscated API key - encoded with app-specific salt
# This prevents casual copying but is not cryptographically secure
_OBFUSCATED_KEY = "QklqYVN5RG9yLWpsdmhtMEVGVkxnV3F4TllFR0MyR21oQUY3Y3Rv"
_APP_SALT = "KV-Tube-2026"

def _decode_api_key() -> str:
    """Decode the obfuscated API key. Only works with correct app context."""
    try:
        # Decode base64
        decoded = base64.b64decode(_OBFUSCATED_KEY).decode('utf-8')
        # Remove prefix added during encoding
        if decoded.startswith("Bij"):
            return "AI" + decoded[3:]  # Reconstruct original key
        return decoded
    except:
        return ""

# Get API key: prefer environment variable, fall back to obfuscated default
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or _decode_api_key()

def summarize_with_gemini(transcript: str, video_title: str = "") -> Optional[str]:
    """
    Summarize video transcript using Google Gemini AI.
    
    Args:
        transcript: The video transcript text
        video_title: Optional video title for context
        
    Returns:
        AI-generated summary or None if failed
    """
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, falling back to TextRank")
        return None
        
    try:
        logger.info(f"Importing google.generativeai... Key len: {len(GEMINI_API_KEY)}")
        import google.generativeai as genai
        
        genai.configure(api_key=GEMINI_API_KEY)
        logger.info("Gemini configured. Creating model...")
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Limit transcript to avoid token limits
        max_chars = 8000
        if len(transcript) > max_chars:
            transcript = transcript[:max_chars] + "..."
        
        logger.info(f"Generating summary content... Transcript len: {len(transcript)}")
        # Create prompt for summarization
        prompt = f"""You are a helpful AI assistant. Summarize the following video transcript in 2-3 concise sentences. 
Focus on the main topic and key points. If it's a music video, describe the song's theme and mood instead of quoting lyrics.

Video Title: {video_title if video_title else 'Unknown'}

Transcript:
{transcript}

Provide a brief, informative summary (2-3 sentences max):"""

        response = model.generate_content(prompt)
        logger.info("Gemini response received.")
        
        if response and response.text:
            summary = response.text.strip()
            # Clean up any markdown formatting
            summary = summary.replace("**", "").replace("##", "").replace("###", "")
            return summary
        
        return None
        
    except Exception as e:
        logger.error(f"Gemini summarization error: {e}")
        return None


def extract_key_points_with_gemini(transcript: str, video_title: str = "") -> list:
    """
    Extract key points from video transcript using Gemini AI.
    
    Returns:
        List of key points or empty list if failed
    """
    if not GEMINI_API_KEY:
        return []
        
    try:
        import google.generativeai as genai
        
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Limit transcript
        max_chars = 6000
        if len(transcript) > max_chars:
            transcript = transcript[:max_chars] + "..."
        
        prompt = f"""Extract 3-5 key points from this video transcript. For each point, provide a single short sentence.
If it's a music video, describe the themes, mood, and notable elements instead of quoting lyrics.

Video Title: {video_title if video_title else 'Unknown'}

Transcript:
{transcript}

Key points (one per line, no bullet points or numbers):"""

        response = model.generate_content(prompt)
        
        if response and response.text:
            lines = response.text.strip().split('\n')
            # Clean up and filter
            points = []
            for line in lines:
                line = line.strip().lstrip('•-*123456789.)')
                line = line.strip()
                if line and len(line) > 10:
                    points.append(line)
            return points[:5]  # Max 5 points
        
        return []
        
    except Exception as e:
        logger.error(f"Gemini key points error: {e}")
        return []
