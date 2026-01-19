
import sys
import os

# Add parent path (project root)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.summarizer import TextRankSummarizer

def test_summarization():
    print("\n--- Testing TextRank Summarizer Logic (Offline) ---")
    
    text = """
    The HTTP protocol is the foundation of data communication for the World Wide Web.
    Hypertext documents include hyperlinks to other resources that the user can easily access, for example, by a mouse click or by tapping the screen in a web browser.
    HTTP is an application layer protocol for distributed, collaborative, hypermedia information systems.
    Development of HTTP was initiated by Tim Berners-Lee at CERN in 1989.
    Standards development of HTTP was coordinated by the Internet Engineering Task Force (IETF) and the World Wide Web Consortium (W3C), culminating in the publication of a series of Requests for Comments (RFCs).
    The first definition of HTTP/1.1, the version of HTTP in common use, occurred in RFC 2068 in 1997, although this was deprecated by RFC 2616 in 1999 and then again by the RFC 7230 family of RFCs in 2014.
    A later version, the successor HTTP/2, was standardized in 2015, and is now supported by major web servers and browsers over TLS using an ALPN extension.
    HTTP/3 is the proposed successor to HTTP/2, which is already in use on the web, using QUIC instead of TCP for the underlying transport protocol.
    """
    
    summarizer = TextRankSummarizer()
    summary = summarizer.summarize(text, num_sentences=2)
    
    print(f"Original Length: {len(text)} chars")
    print(f"Summary Length: {len(summary)} chars")
    print(f"Summary:\n{summary}")
    
    if len(summary) > 0 and len(summary) < len(text):
        print("✓ Logic Verification Passed")
    else:
        print("✗ Logic Verification Failed")

if __name__ == "__main__":
    test_summarization()
