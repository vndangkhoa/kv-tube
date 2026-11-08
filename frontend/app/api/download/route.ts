import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import {
  fetchWithCompanionRedirects,
  getCompanionRoot,
  normalizeStreamUrlToCompanion,
} from '../../services/companionUrl';

export const dynamic = 'force-dynamic';

function sanitizeFilename(name: string, ext: string): { ascii: string; utf8: string } {
  const base = name.trim().replace(/[\\/:*?"<>|]/g, '_') || 'video';
  const ascii = base.replace(/[^\x20-\x7E]/g, '').trim() || 'video';
  const cleanExt = ext.replace(/^\./, '') || 'mp4';
  return {
    ascii: `${ascii}.${cleanExt}`,
    utf8: encodeURIComponent(`${base}.${cleanExt}`),
  };
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');
  const videoUrl = req.nextUrl.searchParams.get('videoUrl');
  const audioUrl = req.nextUrl.searchParams.get('audioUrl');
  const title = req.nextUrl.searchParams.get('title') || 'video';
  const ext = req.nextUrl.searchParams.get('ext') || 'mp4';

  const { ascii, utf8 } = sanitizeFilename(title, ext);
  const companionRoot = getCompanionRoot(process.env.COMPANION_URL);

  // CASE 1: Video + Audio Muxing (e.g. 1080p, 720p adaptive formats)
  if (videoUrl && audioUrl) {
    try {
      const normalizedVideoUrl = normalizeStreamUrlToCompanion(videoUrl, companionRoot);
      const normalizedAudioUrl = normalizeStreamUrlToCompanion(audioUrl, companionRoot);

      const ffmpegArgs = [
        '-y',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', normalizedVideoUrl,
        '-i', normalizedAudioUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1',
      ];

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

      const killFfmpeg = () => {
        if (!ffmpegProcess.killed) {
          ffmpegProcess.kill('SIGTERM');
        }
      };
      req.signal.addEventListener('abort', killFfmpeg, { once: true });

      const stream = new ReadableStream({
        start(controller) {
          let settled = false;

          ffmpegProcess.stdout.on('data', (chunk) => {
            if (!settled) {
              controller.enqueue(chunk);
            }
          });

          ffmpegProcess.stdout.on('end', () => {
            if (!settled) {
              settled = true;
              req.signal.removeEventListener('abort', killFfmpeg);
              controller.close();
            }
          });

          ffmpegProcess.on('error', (err) => {
            console.error('[download:ffmpeg] Error:', err);
            if (!settled) {
              settled = true;
              req.signal.removeEventListener('abort', killFfmpeg);
              controller.error(err);
            }
          });

          ffmpegProcess.stderr.on('data', () => {
            // Drain stderr so ffmpeg pipe buffer never blocks on long remuxes
          });
        },
        cancel() {
          req.signal.removeEventListener('abort', killFfmpeg);
          killFfmpeg();
        },
      });

      const resHeaders = new Headers();
      resHeaders.set('Access-Control-Allow-Origin', '*');
      resHeaders.set('Accept-Ranges', 'bytes');
      resHeaders.set('Content-Type', 'video/mp4');
      resHeaders.set(
        'Content-Disposition',
        `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
      );

      return new Response(stream, {
        status: 200,
        headers: resHeaders,
      });
    } catch (e: any) {
      console.error('[download:mux] Exception:', e);
      return new Response(e?.message || 'Muxing error', { status: 500 });
    }
  }

  // CASE 2: Single Stream Proxy (audio or pre-combined video) via Companion -> WARP
  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const normalizedTargetUrl = normalizeStreamUrlToCompanion(targetUrl, companionRoot);
    if (!normalizedTargetUrl) {
      return new Response('Invalid url parameter', { status: 400 });
    }

    const rangeHeader = req.headers.get('range');
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Encoding': 'identity',
    };

    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const upstream = await fetchWithCompanionRedirects(normalizedTargetUrl, {
      method: 'GET',
      headers,
      headerTimeoutMs: 20_000,
      maxRedirects: 4,
      clientSignal: req.signal,
      companionRoot,
    });

    const resHeaders = new Headers();
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    resHeaders.set(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
    );
    resHeaders.set(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/octet-stream'
    );

    const contentEncoding = (upstream.headers.get('content-encoding') || '').toLowerCase();
    const hasIdentityLength = !contentEncoding || contentEncoding === 'identity';
    const contentLength = upstream.headers.get('content-length');
    if (contentLength && hasIdentityLength) {
      resHeaders.set('Content-Length', contentLength);
    }

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      resHeaders.set('Content-Range', contentRange);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (e: any) {
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error('[download] Request error:', e);
    return new Response(e?.message || 'Download request error', { status: 502 });
  }
}
