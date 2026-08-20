import { NextRequest } from 'next/server';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

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

  // CASE 1: Video + Audio Muxing (e.g. 1080p, 720p adaptive formats)
  if (videoUrl && audioUrl) {
    try {
      const ffmpegArgs = [
        '-y',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', videoUrl,
        '-i', audioUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1',
      ];

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

      const stream = new ReadableStream({
        start(controller) {
          ffmpegProcess.stdout.on('data', (chunk) => {
            controller.enqueue(chunk);
          });

          ffmpegProcess.stdout.on('end', () => {
            controller.close();
          });

          ffmpegProcess.on('error', (err) => {
            console.error('[download:ffmpeg] Error:', err);
            controller.error(err);
          });

          ffmpegProcess.stderr.on('data', (data) => {
            // Uncomment for debugging if needed:
            // console.debug('[ffmpeg]:', data.toString());
          });
        },
        cancel() {
          ffmpegProcess.kill('SIGTERM');
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

  // CASE 2: Single Stream Proxy (audio or pre-combined video)
  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  return new Promise<Response>((resolve) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const rangeHeader = req.headers.get('range');
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Host': parsedUrl.host,
      };

      if (rangeHeader) {
        headers['Range'] = rangeHeader;
      }

      const options: https.RequestOptions = {
        method: 'GET',
        headers,
        agent: isHttps ? httpsAgent : undefined,
      };

      const proxyReq = client.request(targetUrl, options, (proxyRes) => {
        // Handle 301/302 Redirects
        if (
          proxyRes.statusCode &&
          [301, 302, 303, 307, 308].includes(proxyRes.statusCode) &&
          proxyRes.headers.location
        ) {
          let redirectUrl = proxyRes.headers.location;
          if (redirectUrl.startsWith('/')) {
            redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
          }

          const redirectParsed = new URL(redirectUrl);
          const redirectIsHttps = redirectParsed.protocol === 'https:';
          const redirectClient = redirectIsHttps ? https : http;

          const redirectReq = redirectClient.request(
            redirectUrl,
            {
              method: 'GET',
              headers: {
                ...headers,
                Host: redirectParsed.host,
              },
              agent: redirectIsHttps ? httpsAgent : undefined,
            },
            (redirectRes) => {
              const resHeaders = new Headers();
              resHeaders.set('Access-Control-Allow-Origin', '*');
              resHeaders.set('Accept-Ranges', 'bytes');
              resHeaders.set(
                'Content-Disposition',
                `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
              );

              if (redirectRes.headers['content-type']) {
                resHeaders.set('Content-Type', redirectRes.headers['content-type']);
              } else {
                resHeaders.set('Content-Type', 'application/octet-stream');
              }
              if (redirectRes.headers['content-length']) {
                resHeaders.set('Content-Length', redirectRes.headers['content-length']);
              }
              if (redirectRes.headers['content-range']) {
                resHeaders.set('Content-Range', redirectRes.headers['content-range']);
              }

              const stream = new ReadableStream({
                start(controller) {
                  redirectRes.on('data', (chunk) => controller.enqueue(chunk));
                  redirectRes.on('end', () => controller.close());
                  redirectRes.on('error', (err) => controller.error(err));
                },
                cancel() {
                  redirectRes.destroy();
                },
              });

              resolve(
                new Response(stream, {
                  status: redirectRes.statusCode || 200,
                  headers: resHeaders,
                })
              );
            }
          );

          redirectReq.on('error', (err) => {
            console.error('[download] Redirect error:', err);
            resolve(new Response(err?.message || 'Redirect fetch error', { status: 502 }));
          });

          redirectReq.end();
          return;
        }

        const resHeaders = new Headers();
        resHeaders.set('Access-Control-Allow-Origin', '*');
        resHeaders.set('Accept-Ranges', 'bytes');
        resHeaders.set(
          'Content-Disposition',
          `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
        );

        if (proxyRes.headers['content-type']) {
          resHeaders.set('Content-Type', proxyRes.headers['content-type']);
        } else {
          resHeaders.set('Content-Type', 'application/octet-stream');
        }
        if (proxyRes.headers['content-length']) {
          resHeaders.set('Content-Length', proxyRes.headers['content-length']);
        }
        if (proxyRes.headers['content-range']) {
          resHeaders.set('Content-Range', proxyRes.headers['content-range']);
        }

        const stream = new ReadableStream({
          start(controller) {
            proxyRes.on('data', (chunk) => controller.enqueue(chunk));
            proxyRes.on('end', () => controller.close());
            proxyRes.on('error', (err) => controller.error(err));
          },
          cancel() {
            proxyRes.destroy();
          },
        });

        resolve(
          new Response(stream, {
            status: proxyRes.statusCode || 200,
            headers: resHeaders,
          })
        );
      });

      proxyReq.on('error', (err) => {
        console.error('[download] Request error:', err);
        resolve(new Response(err?.message || 'Download request error', { status: 502 }));
      });

      proxyReq.end();
    } catch (e: any) {
      console.error('[download] Exception:', e);
      resolve(new Response(e?.message || 'Internal download error', { status: 500 }));
    }
  });
}
