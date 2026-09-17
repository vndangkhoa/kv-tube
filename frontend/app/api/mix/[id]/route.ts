import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT_VERSION = '2.20260811.07.00';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const listParam = req.nextUrl.searchParams.get('list') || '';
  let videoId = id || req.nextUrl.searchParams.get('v') || '';
  let playlistId = listParam;

  if (!playlistId && videoId) {
    playlistId = `RD${videoId}`;
  }
  if (!videoId && playlistId.startsWith('RD')) {
    videoId = playlistId.replace(/^RD/, '');
  }

  if (!videoId && !playlistId) {
    return NextResponse.json({ error: 'Video ID or playlist ID is required' }, { status: 400 });
  }

  // 1. Try Go backend first if running locally or configured via BACKEND_URL
  const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8080';
  try {
    const backendRes = await fetch(`${backendUrl}/api/mix/${encodeURIComponent(videoId)}?list=${encodeURIComponent(playlistId)}`, {
      headers: { 'User-Agent': 'KV-Tube-Frontend' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000),
    });
    if (backendRes.ok) {
      const data = await backendRes.json();
      if (data && Array.isArray(data.videos) && data.videos.length > 0) {
        return NextResponse.json(data);
      }
    }
  } catch {
    // Go backend not running or timed out; proceed to direct Innertube extraction
  }

  // 2. Direct InnerTube Extraction
  try {
    const payload = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: INNERTUBE_CLIENT_VERSION,
          hl: 'en',
          gl: 'US',
        },
      },
      videoId: videoId,
      playlistId: playlistId,
    };

    const ytRes = await fetch(`https://www.youtube.com/youtubei/v1/next?prettyPrint=false&key=${INNERTUBE_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify(payload),
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6000),
    });

    if (ytRes.ok) {
      const json = await ytRes.json();
      const playlist = json?.contents?.twoColumnWatchNextResults?.playlist?.playlist;
      if (playlist && Array.isArray(playlist.contents) && playlist.contents.length > 0) {
        const title = playlist.title || playlist.titleText?.simpleText || 'Mix Playlist';
        let author = playlist.shortBylineText?.simpleText || 'YouTube';
        if (!author && playlist.shortBylineText?.runs?.[0]?.text) {
          author = playlist.shortBylineText.runs[0].text;
        }

        const videos = playlist.contents
          .map((item: any) => {
            const v = item.playlistPanelVideoRenderer;
            if (!v || !v.videoId) return null;

            const vTitle = v.title?.simpleText || v.title?.runs?.[0]?.text || 'Untitled Video';
            const uploader = v.shortBylineText?.runs?.[0]?.text || 'Unknown';
            const channelId = v.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
            const duration = v.lengthText?.simpleText || v.lengthText?.runs?.[0]?.text || '';
            const thumbs = v.thumbnail?.thumbnails;
            const thumb = thumbs?.[thumbs.length - 1]?.url || (v.videoId ? `https://i.ytimg.com/vi_webp/${v.videoId}/hq720.webp` : '');

            return {
              id: v.videoId,
              title: vTitle,
              uploader,
              channelTitle: uploader,
              channel_id: channelId,
              channelId,
              thumbnail: thumb,
              duration,
            };
          })
          .filter(Boolean);

        if (videos.length > 0) {
          return NextResponse.json({
            title,
            author,
            playlistId: playlist.playlistId || playlistId,
            videos,
          });
        }
      }
    }
  } catch (ytErr) {
    console.warn('[api/mix] InnerTube fetch error:', ytErr);
  }

  // 3. Fallback: Query Invidious related videos to synthesize a radio
  try {
    const invidiousUrl = process.env.INVIDIOUS_URL || 'http://invidious:3000';
    const invRes = await fetch(`${invidiousUrl}/api/v1/videos/${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (invRes.ok) {
      const invData = await invRes.json();
      const recs = invData.recommendedVideos || [];
      const videos = [
        {
          id: invData.videoId || videoId,
          title: invData.title || 'Seed Video',
          uploader: invData.author || 'Creator',
          channelTitle: invData.author || 'Creator',
          channel_id: invData.authorId || '',
          thumbnail: (invData.videoId || videoId) ? `https://i.ytimg.com/vi_webp/${invData.videoId || videoId}/hq720.webp` : (invData.videoThumbnails?.[0]?.url || ''),
          duration: invData.lengthSeconds ? `${Math.floor(invData.lengthSeconds / 60)}:${(invData.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
        },
        ...recs.map((r: any) => ({
          id: r.videoId,
          title: r.title,
          uploader: r.author,
          channelTitle: r.author,
          channel_id: r.authorId || '',
          thumbnail: r.videoId ? `https://i.ytimg.com/vi_webp/${r.videoId}/hq720.webp` : (r.videoThumbnails?.[0]?.url || ''),
          duration: r.lengthSeconds ? `${Math.floor(r.lengthSeconds / 60)}:${(r.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
        })).filter((v: any) => v.id !== videoId),
      ];

      return NextResponse.json({
        title: `Mix - ${invData.title || 'Playlist'}`,
        author: invData.author || 'KV-Tube',
        playlistId,
        videos,
      });
    }
  } catch (fallbackErr) {
    console.warn('[api/mix] Fallback error:', fallbackErr);
  }

  return NextResponse.json({ error: 'Mix playlist unavailable' }, { status: 404 });
}
