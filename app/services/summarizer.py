"""
Summarizer Service Module
Extractive text summarization for video transcripts
"""
import re
import heapq
import logging
from typing import List

logger = logging.getLogger(__name__)

# Stop words for summarization
STOP_WORDS = frozenset([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
    'to', 'of', 'in', 'on', 'at', 'for', 'with', 'that', 'this', 'it', 
    'you', 'i', 'we', 'they', 'he', 'she', 'be', 'have', 'has', 'do',
    'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'not', 'no', 'so', 'as', 'if', 'then', 'than',
    'when', 'where', 'what', 'which', 'who', 'how', 'why', 'all',
    'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'any', 'only', 'own', 'same', 'just', 'now', 'also', 'very'
])


def extractive_summary(text: str, num_sentences: int = 5) -> str:
    """
    Generate an extractive summary of text
    
    Args:
        text: Input text to summarize
        num_sentences: Number of sentences to extract
    
    Returns:
        Summary string with top-ranked sentences
    """
    if not text or not text.strip():
        return "Not enough content to summarize."
    
    # Clean text - remove metadata like [Music] common in auto-captions
    clean_text = re.sub(r'\[.*?\]', '', text)
    clean_text = clean_text.replace('\n', ' ')
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    
    if len(clean_text) < 100:
        return clean_text
    
    # Split into sentences
    sentences = _split_sentences(clean_text)
    
    if len(sentences) <= num_sentences:
        return clean_text
    
    # Calculate word frequencies
    word_frequencies = _calculate_word_frequencies(clean_text)
    
    if not word_frequencies:
        return "Not enough content to summarize."
    
    # Score sentences
    sentence_scores = _score_sentences(sentences, word_frequencies)
    
    # Extract top N sentences
    top_sentences = heapq.nlargest(num_sentences, sentence_scores, key=sentence_scores.get)
    
    # Return in original order
    ordered = [s for s in sentences if s in top_sentences]
    
    return ' '.join(ordered)


def _split_sentences(text: str) -> List[str]:
    """Split text into sentences"""
    # Regex for sentence splitting - handles abbreviations
    pattern = r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s'
    sentences = re.split(pattern, text)
    
    # Filter out very short sentences
    return [s.strip() for s in sentences if len(s.strip()) > 20]


def _calculate_word_frequencies(text: str) -> dict:
    """Calculate normalized word frequencies"""
    word_frequencies = {}
    
    words = re.findall(r'\w+', text.lower())
    
    for word in words:
        if word not in STOP_WORDS and len(word) > 2:
            word_frequencies[word] = word_frequencies.get(word, 0) + 1
    
    if not word_frequencies:
        return {}
    
    # Normalize by max frequency
    max_freq = max(word_frequencies.values())
    for word in word_frequencies:
        word_frequencies[word] = word_frequencies[word] / max_freq
    
    return word_frequencies


def _score_sentences(sentences: List[str], word_frequencies: dict) -> dict:
    """Score sentences based on word frequencies"""
    sentence_scores = {}
    
    for sentence in sentences:
        words = re.findall(r'\w+', sentence.lower())
        score = sum(word_frequencies.get(word, 0) for word in words)
        
        # Normalize by sentence length to avoid bias toward long sentences
        if len(words) > 0:
            score = score / (len(words) ** 0.5)  # Square root normalization
        
        sentence_scores[sentence] = score
    
    return sentence_scores
