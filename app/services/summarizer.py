
import re
import math
import logging
from typing import List

logger = logging.getLogger(__name__)

class TextRankSummarizer:
    """
    Summarizes text using a TextRank-like graph algorithm.
    This creates more coherent "whole idea" summaries than random extraction.
    """

    def __init__(self):
        self.stop_words = set([
            "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
            "to", "of", "in", "on", "at", "for", "width", "that", "this", "it",
            "you", "i", "we", "they", "he", "she", "have", "has", "had", "do",
            "does", "did", "with", "as", "by", "from", "at", "but", "not", "what",
            "all", "were", "when", "can", "said", "there", "use", "an", "each",
            "which", "she", "do", "how", "their", "if", "will", "up", "other",
            "about", "out", "many", "then", "them", "these", "so", "some", "her",
            "would", "make", "like", "him", "into", "time", "has", "look", "two",
            "more", "write", "go", "see", "number", "no", "way", "could", "people",
            "my", "than", "first", "water", "been", "call", "who", "oil", "its",
            "now", "find", "long", "down", "day", "did", "get", "come", "made",
            "may", "part"
        ])

    def summarize(self, text: str, num_sentences: int = 5) -> str:
        """
        Generate a summary of the text.
        
        Args:
            text: Input text
            num_sentences: Number of sentences in the summary
            
        Returns:
            Summarized text string
        """
        if not text:
            return ""
            
        # 1. Split into sentences
        # Use regex to look for periods/questions/exclamations followed by space or end of string
        sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s', text)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 20] # Filter very short fragments
        
        if not sentences:
            return text[:500] + "..." if len(text) > 500 else text
            
        if len(sentences) <= num_sentences:
            return " ".join(sentences)

        # 2. Build Similarity Graph
        # We calculate cosine similarity between all pairs of sentences
        # graph[i][j] = similarity score
        n = len(sentences)
        scores = [0.0] * n
        
        # Pre-process sentences for efficiency
        # Convert to sets of words
        sent_words = []
        for s in sentences:
            words = re.findall(r'\w+', s.lower())
            words = [w for w in words if w not in self.stop_words]
            sent_words.append(words)
            
        # Adjacency matrix (conceptual) - we'll just sum weights for "centrality"
        # TextRank logic: a sentence is important if it is similar to other important sentences.
        # Simplified: weighted degree centrality often works well enough for simple tasks without full iterative convergence
        
        for i in range(n):
            for j in range(i + 1, n):
                sim = self._cosine_similarity(sent_words[i], sent_words[j])
                if sim > 0:
                    scores[i] += sim
                    scores[j] += sim
                    
        # 3. Rank and Select
        # Sort by score descending
        ranked_sentences = sorted(((scores[i], i) for i in range(n)), reverse=True)
        
        # Pick top N
        top_indices = [idx for score, idx in ranked_sentences[:num_sentences]]
        
        # 4. Reorder by appearance in original text for coherence
        top_indices.sort()
        
        summary = " ".join([sentences[i] for i in top_indices])
        return summary

    def _cosine_similarity(self, words1: List[str], words2: List[str]) -> float:
        """Calculate cosine similarity between two word lists."""
        if not words1 or not words2:
            return 0.0
            
        # Unique words in both
        all_words = set(words1) | set(words2)
        
        # Frequency vectors
        vec1 = {w: 0 for w in all_words}
        vec2 = {w: 0 for w in all_words}
        
        for w in words1: vec1[w] += 1
        for w in words2: vec2[w] += 1
        
        # Dot product
        dot_product = sum(vec1[w] * vec2[w] for w in all_words)
        
        # Magnitudes
        mag1 = math.sqrt(sum(v*v for v in vec1.values()))
        mag2 = math.sqrt(sum(v*v for v in vec2.values()))
        
        if mag1 == 0 or mag2 == 0:
            return 0.0
            
        return dot_product / (mag1 * mag2)
