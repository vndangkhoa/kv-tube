# KV-Tube v3.0

> A lightweight, privacy-focused YouTube frontend web application with AI-powered features.

KV-Tube removes distractions, tracking, and ads from the YouTube watching experience. It provides a clean interface to search, watch, and discover related content without needing a Google account.

## 🚀 Key Features (v3)

- **Privacy First**: No tracking, no ads.
- **Clean Interface**: Distraction-free watching experience.
- **Efficient Streaming**: Direct video stream extraction using `yt-dlp`.
- **AI Summary (Experimental)**: Generate concise summaries of videos (Currently disabled due to upstream rate limits).
- **Multi-Language**: Support for English and Vietnamese (UI & Content).
- **Auto-Update**: Includes `update_deps.py` to easily keep core fetching tools up-to-date.

## 🛠️ Architecture Data Flow

![Architecture Data Flow](https://mermaid.ink/img/Z3JhcGggVEQKICAgIHN1YmdyYXBoIENsaWVudCBbIkNsaWVudCBTaWRlIl0KICAgICAgICBVc2VyWyJVc2VyIEJyb3dzZXIiXQogICAgZW5kCgogICAgc3ViZ3JhcGggQmFja2VuZCBbIktWVHViZSBCYWNrZW5kIFN5c3RlbSJdCiAgICAgICAgU2VydmVyWyJLVlR1YmUgU2VydmVyIl0KICAgICAgICBZVERMUFsieXRkbHAgQ29yZSJdCiAgICAgICAgWVRGZXRjaGVyWyJZVEZldGNoZXIgTGliIl0KICAgIGVuZAoKICAgIHN1YmdyYXBoIEV4dGVybmFsIFsiRXh0ZXJuYWwgU2VydmljZXMiXQogICAgICAgIFlvdVR1YmVbIllvdVR1YmUgVjMgQVBJIl0KICAgIGVuZAoKICAgICUlIE1haW4gRmxvdwogICAgVXNlciAtLSAiMS4gU2VhcmNoL1dhdGNoIFJlcXVlc3QiIC0tPiBTZXJ2ZXIKICAgIFNlcnZlciAtLSAiMi4gRXh0cmFjdCBNZXRhZGF0YSIgLS0+IFlURExQCiAgICBZVERMUCAtLSAiMy4gTmV0d29yayBSZXEgKENvb2tpZXMpIiAtLT4gWW91VHViZQogICAgWW91VHViZSAtLSAiNC4gUmF3IFN0cmVhbXMiIC0tPiBZVERMUAogICAgWVRETFAgLS0gIjUuIFN0cmVhbSBVUkwiIC0tPiBTZXJ2ZXIKICAgIFNlcnZlciAtLSAiNi4gUmVuZGVyL1Byb3h5IiAtLT4gVXNlcgogICAgCiAgICAlJSBGYWxsYmFjay9TZWNvbmRhcnkgRmxvdwogICAgU2VydmVyIC0uLT4gWVRGZXRjaGVyCiAgICBZVEZldGNoZXIgLS4tPiBZb3VUdWJlCiAgICBZVEZldGNoZXIgLS4gIkVycm9yIC8gTm8gVHJhbnNjcmlwdCIgLi0+IFNlcnZlcgoKICAgICUlIFN0eWxpbmcgdG8gbWFrZSBpdCBwb3AKICAgIHN0eWxlIEJhY2tlbmQgZmlsbDojZjlmOWY5LHN0cm9rZTojMzMzLHN0cm9rZS13aWR0aDoycHgKICAgIHN0eWxlIEV4dGVybmFsIGZpbGw6I2ZmZWJlZSxzdHJva2U6I2YwMCxzdHJva2Utd2lkdGg6MnB4)

## 🔧 Installation & Usage

### Prerequisites
- Python 3.10+
- Git
- Valid `cookies.txt` (Optional, for bypassing age-restrictions or rate limits)

### Local Setup
1. Clone the repository:
   ```bash
   git clone https://git.khoavo.myds.me/vndangkhoa/kv-tube.git
   cd kv-tube
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the application:
   ```bash
   python wsgi.py
   ```
4. Access at `http://localhost:5002`

### Docker Deployment (Linux/AMD64)

Built for stability and ease of use.

```bash
docker pull vndangkhoa/kv-tube:latest
docker run -d -p 5002:5002 -v $(pwd)/cookies.txt:/app/cookies.txt vndangkhoa/kv-tube:latest
```

## 📦 Updates

- **v3.0**: Major release. 
    - Full modularization of backend routes.
    - Integrated `ytfetcher` for specialized fetching.
    - Added manual dependency update script (`update_deps.py`).
    - Enhanced error handling for upstream rate limits.
    - Docker `linux/amd64` support verified.

---
*Developed by Khoa Vo*
