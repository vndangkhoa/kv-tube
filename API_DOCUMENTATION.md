# KV-Tube API Documentation

## Base URL
```
http://127.0.0.1:5002
```

## Endpoints Overview

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/` | GET | ✅ 200 | Homepage |
| `/watch?v={video_id}` | GET | ✅ 200 | Video player page |
| `/api/search?q={query}` | GET | ✅ 200 | Search videos |
| `/api/trending` | GET | ✅ 200 | Trending videos |
| `/api/get_stream_info?v={video_id}` | GET | ✅ 200 | Get video stream URL |
| `/api/transcript?v={video_id}` | GET | ✅ 200* | Get video transcript (rate limited) |
| `/api/summarize?v={video_id}` | GET | ✅ 200* | AI summary (rate limited) |
| `/api/history` | GET | ✅ 200 | Get watch history |
| `/api/suggested` | GET | ✅ 200 | Get suggested videos |
| `/api/related?v={video_id}` | GET | ✅ 200 | Get related videos |
| `/api/channel/videos?id={channel_id}` | GET | ✅ 200 | Get channel videos |
| `/api/download?v={video_id}` | GET | ✅ 200 | Get download URL |
| `/api/download/formats?v={video_id}` | GET | ✅ 200 | Get available formats |
| `/video_proxy?url={stream_url}` | GET | ✅ 200 | Proxy video stream |
| `/api/save_video` | POST | ✅ 200 | Save video to history |
| `/settings` | GET | ✅ 200 | Settings page |
| `/my-videos` | GET | ✅ 200 | User videos page |

*Rate limited by YouTube (429 errors expected)

---

## Detailed Endpoint Documentation

### 1. Search Videos
**Endpoint**: `GET /api/search?q={query}`  
**Status**: ✅ Working

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/search?q=python%20tutorial"
```

**Example Response**:
```json
[
  {
    "id": "K5KVEU3aaeQ",
    "title": "Python Full Course for Beginners",
    "uploader": "Programming with Mosh",
    "thumbnail": "https://i.ytimg.com/vi/K5KVEU3aaeQ/hqdefault.jpg",
    "view_count": 4932307,
    "duration": "2:02:21",
    "upload_date": ""
  }
]
```

---

### 2. Get Stream Info
**Endpoint**: `GET /api/get_stream_info?v={video_id}`  
**Status**: ✅ Working

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/get_stream_info?v=dQw4w9WgXcQ"
```

**Example Response**:
```json
{
  "original_url": "https://manifest.googlevideo.com/api/manifest/hls_playlist/...",
  "stream_url": "/video_proxy?url=...",
  "title": "Rick Astley - Never Gonna Give You Up (Official Video)",
  "description": "The official video for Never Gonna Give You Up...",
  "uploader": "Rick Astley",
  "channel_id": "UCuAXFkgsw1L7xaCfnd5JJOw",
  "view_count": 1730702525,
  "related": [
    {
      "id": "dQw4w9WgXcQ",
      "title": "Rick Astley - Never Gonna Give You Up...",
      "view_count": 1730702525
    }
  ],
  "subtitle_url": null
}
```

---

### 3. Get Trending Videos
**Endpoint**: `GET /api/trending`  
**Status**: ✅ Working

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/trending"
```

**Example Response**:
```json
{
  "data": [
    {
      "id": "discovery",
      "title": "You Might Like",
      "icon": "compass",
      "videos": [
        {
          "id": "GKWrOLrp80c",
          "title": "Best of: Space Exploration",
          "uploader": "The History Guy",
          "view_count": 205552,
          "duration": "1:02:29"
        }
      ]
    }
  ]
}
```

---

### 4. Get Channel Videos
**Endpoint**: `GET /api/channel/videos?id={channel_id}`  
**Status**: ✅ Working

**Supports**:
- Channel ID: `UCuAXFkgsw1L7xaCfnd5JJOw`
- Channel URL: `https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw`
- Channel Handle: `@ProgrammingWithMosh`

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/channel/videos?id=@ProgrammingWithMosh&limit=5"
```

**Example Response**:
```json
[
  {
    "id": "naNcmnKskUE",
    "title": "Top 5 Programming Languages to Learn in 2026",
    "uploader": "",
    "channel_id": "@ProgrammingWithMosh",
    "view_count": 149264,
    "duration": "11:31",
    "thumbnail": "https://i.ytimg.com/vi/naNcmnKskUE/mqdefault.jpg"
  }
]
```

---

### 5. Get Download URL
**Endpoint**: `GET /api/download?v={video_id}`  
**Status**: ✅ Working

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/download?v=dQw4w9WgXcQ"
```

**Example Response**:
```json
{
  "url": "https://rr2---sn-8qj-nbo66.googlevideo.com/videoplayback?...",
  "title": "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
  "ext": "mp4"
}
```

---

### 6. Get Download Formats
**Endpoint**: `GET /api/download/formats?v={video_id}`  
**Status**: ✅ Working

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/download/formats?v=dQw4w9WgXcQ"
```

**Example Response**:
```json
{
  "success": true,
  "video_id": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "duration": 213,
  "formats": {
    "video": [
      {
        "quality": "1080p",
        "ext": "mp4",
        "size": "226.1 MB",
        "url": "...",
        "type": "video"
      }
    ],
    "audio": [
      {
        "quality": "128kbps",
        "ext": "mp3",
        "size": "3.2 MB",
        "url": "...",
        "type": "audio"
      }
    ]
  }
}
```

---

### 7. Get Related Videos
**Endpoint**: `GET /api/related?v={video_id}&limit={count}`  
**Status**: ✅ Working

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/related?v=dQw4w9WgXcQ&limit=5"
```

---

### 8. Get Suggested Videos
**Endpoint**: `GET /api/suggested`  
**Status**: ✅ Working

Based on user's watch history.

---

### 9. Get Watch History
**Endpoint**: `GET /api/history`  
**Status**: ✅ Working

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/history"
```

**Example Response**:
```json
[
  {
    "id": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up",
    "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg"
  }
]
```

---

### 10. Video Proxy
**Endpoint**: `GET /video_proxy?url={stream_url}`  
**Status**: ✅ Working

Proxies video streams to bypass CORS and enable seeking.

**Example Request**:
```bash
curl "http://127.0.0.1:5002/video_proxy?url=https://manifest.googlevideo.com/api/manifest/hls_playlist/..."
```

---

### 11. Get Transcript ⚠️ RATE LIMITED
**Endpoint**: `GET /api/transcript?v={video_id}`  
**Status**: ⚠️ Working but YouTube rate limits (429)

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/transcript?v=dQw4w9WgXcQ"
```

**Example Response (Success)**:
```json
{
  "success": true,
  "video_id": "dQw4w9WgXcQ",
  "transcript": [
    {
      "text": "Never gonna give you up",
      "start": 0.0,
      "duration": 2.5
    }
  ],
  "language": "en",
  "is_generated": true,
  "full_text": "Never gonna give you up..."
}
```

**Example Response (Rate Limited)**:
```json
{
  "success": false,
  "error": "Could not load transcript: 429 Client Error: Too Many Requests"
}
```

---

### 12. AI Summary ⚠️ RATE LIMITED
**Endpoint**: `GET /api/summarize?v={video_id}`  
**Status**: ⚠️ Working but YouTube rate limits (429)

**Example Request**:
```bash
curl "http://127.0.0.1:5002/api/summarize?v=dQw4w9WgXcQ"
```

**Example Response**:
```json
{
  "success": true,
  "summary": "Rick Astley's official music video for Never Gonna Give You Up..."
}
```

---

## Rate Limiting

**Current Limits**:
- Search: 30 requests/minute
- Transcript: 10 requests/minute
- Channel Videos: 60 requests/minute
- Download: 20 requests/minute

**Note**: YouTube also imposes its own rate limits on transcript/summary requests.

---

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | Success | - |
| 400 | Bad Request | Check parameters |
| 404 | Not Found | Verify video ID |
| 429 | Rate Limited | Wait before retrying |
| 500 | Server Error | Check server logs |

---

## Testing Commands

```bash
# Homepage
curl http://127.0.0.1:5002/

# Search
curl "http://127.0.0.1:5002/api/search?q=python"

# Get stream
curl "http://127.0.0.1:5002/api/get_stream_info?v=dQw4w9WgXcQ"

# Get download URL
curl "http://127.0.0.1:5002/api/download?v=dQw4w9WgXcQ"

# Get channel videos
curl "http://127.0.0.1:5002/api/channel/videos?id=UCuAXFkgsw1L7xaCfnd5JJOw"

# Get trending
curl http://127.0.0.1:5002/api/trending

# Get history
curl http://127.0.0.1:5002/api/history
```

---

## Server Information

- **URL**: http://127.0.0.1:5002
- **Port**: 5002
- **Mode**: Development (Debug enabled)
- **Python**: 3.12.9
- **Framework**: Flask 3.0.2
- **Rate Limiting**: Flask-Limiter enabled

---

## Known Issues

1. **Transcript API (429)**: YouTube rate limits transcript requests
   - Status: Expected behavior
   - Resolution: Wait 1-24 hours or use VPN
   - Frontend handles gracefully with user messages

2. **CORS Errors**: Direct YouTube API calls blocked
   - Status: Expected browser security
   - Resolution: Use KV-Tube proxy endpoints

3. **PWA Install Banner**: Chrome requires user interaction
   - Status: Expected behavior
   - Resolution: Manual install via browser menu

---

*Generated: 2026-01-10*
*Version: KV-Tube 2.0*
