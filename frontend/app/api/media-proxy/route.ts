import { NextRequest } from 'next/server';
import {
  fetchWithCompanionRedirects,
  getCompanionRoot,
  normalizeStreamUrlToCompanion,
} from '../../services/companionUrl';

export const dynamic = 'force-dynamic';

async function handleMediaProxy(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const companionRoot = getCompanionRoot(process.env.COMPANION_URL);
    const normalizedTargetUrl = normalizeStreamUrlToCompanion(targetUrl, companionRoot);
    if (!normalizedTargetUrl) {
      return new Response('Invalid url parameter', { status: 400 });
    }

    const rangeHeader = req.headers.get('range');
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: req.headers.get('accept') || '*/*',
      'Accept-Encoding': 'identity',
    };

    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const upstream = await fetchWithCompanionRedirects(normalizedTargetUrl, {
      method: req.method,
      headers,
      headerTimeoutMs: 20_000,
      maxRedirects: 4,
      clientSignal: req.signal,
      companionRoot,
    });

    const resHeaders = new Headers();
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    resHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    resHeaders.set('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');

    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      resHeaders.set('Content-Type', contentType);
    }

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

    return new Response(req.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (e: any) {
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error('[media-proxy] Request error:', e);
    return new Response(e?.message || 'Proxy request error', { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return handleMediaProxy(req);
}

export async function HEAD(req: NextRequest) {
  return handleMediaProxy(req);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
    },
  });
}
