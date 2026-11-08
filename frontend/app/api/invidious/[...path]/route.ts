import { NextRequest, NextResponse } from 'next/server';
import { tokenWantsBearer } from '../../../services/invidiousToken';
import {
  fetchWithCompanionRedirects,
  getCompanionRoot,
  shouldInjectLocalParam,
} from '../../../services/companionUrl';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return handleProxy(req, path);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return handleProxy(req, path);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return handleProxy(req, path);
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  return handleProxy(req, path);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

const PUBLIC_FALLBACK_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://yewtu.be',
];

type ProxyCandidate = {
  baseUrl: string;
  kind: 'invidious' | 'companion' | 'public';
};

function isLoopback(urlStr?: string | null): boolean {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1'
    );
  } catch {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(urlStr);
  }
}

function isStaleDomain(urlStr?: string | null): boolean {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    const host = u.hostname.toLowerCase();
    return host === 'yt.khoavo.myds.me' || host === 'youtube.khoavo.myds.me';
  } catch {
    return /(^|\/\/)(yt|youtube)\.khoavo\.myds\.me(\/|:|$)/i.test(urlStr);
  }
}

function isFrontendHost(urlStr?: string | null, req?: NextRequest): boolean {
  if (!urlStr) return true;
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    const targetHost = u.hostname.toLowerCase();
    if (req) {
      const hostHeader = (
        req.headers.get('x-forwarded-host') ||
        req.headers.get('host') ||
        req.nextUrl.host ||
        ''
      )
        .toLowerCase()
        .split(',')[0]
        .trim()
        .split(':')[0];
      if (hostHeader && targetHost === hostHeader) return true;
      if (req.nextUrl.hostname && targetHost === req.nextUrl.hostname.toLowerCase()) return true;
    }
    if (targetHost.startsWith('ut.') || targetHost.startsWith('u.')) return true;
  } catch {
    return true;
  }
  return false;
}

function isValidCustomInstance(raw?: string | null, req?: NextRequest): boolean {
  if (!raw || !raw.trim()) return false;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (isLoopback(trimmed)) return false;
  if (isStaleDomain(trimmed)) return false;
  if (isFrontendHost(trimmed, req)) return false;
  return true;
}

async function handleProxy(req: NextRequest, pathParts: string[]) {
  const subPath = '/' + (pathParts || []).join('/');
  const isApiV1 = subPath.startsWith('/api/v1/');
  const isAuthApi = subPath.startsWith('/api/v1/auth');
  const isVideosApi = subPath === '/api/v1/videos' || subPath.startsWith('/api/v1/videos/');

  const isDirectCompanionStream =
    subPath === '/companion' ||
    subPath.startsWith('/companion/') ||
    /^\/videoplayback(\/|$)/.test(subPath);
  const isManifestOrLatestVersion =
    subPath.startsWith('/api/manifest/') || /^\/latest_version(\/|$)/.test(subPath);
  const isStreamOrMediaPath =
    /^\/(videoplayback|latest_version)(\/|$)/.test(subPath) ||
    /^\/companion\/(videoplayback|latest_version)(\/|$)/.test(subPath);
  const isMediaOrManifestRoute = isDirectCompanionStream || isManifestOrLatestVersion;

  const companionRoot = getCompanionRoot(process.env.COMPANION_URL);

  const customInstance = req.headers.get('x-invidious-instance');
  const validCustomInstance = isValidCustomInstance(customInstance, req)
    ? customInstance!.trim().replace(/\/+$/, '')
    : null;

  const configuredInvidiousEnv =
    process.env.INVIDIOUS_URL &&
    !isStaleDomain(process.env.INVIDIOUS_URL) &&
    !isFrontendHost(process.env.INVIDIOUS_URL, req)
      ? process.env.INVIDIOUS_URL.trim().replace(/\/+$/, '')
      : null;

  const rawCandidates: ProxyCandidate[] = [];

  const buildLocalInvidiousCandidates = (): ProxyCandidate[] => {
    const list: ProxyCandidate[] = [];
    if (validCustomInstance) {
      list.push({ baseUrl: validCustomInstance, kind: 'invidious' });
    }
    if (configuredInvidiousEnv) {
      list.push({ baseUrl: configuredInvidiousEnv, kind: 'invidious' });
    }
    list.push({ baseUrl: 'http://invidious:3000', kind: 'invidious' });
    list.push({ baseUrl: 'http://kvtube-invidious:3000', kind: 'invidious' });
    if (
      process.env.NEXT_PUBLIC_INVIDIOUS_URL &&
      !isStaleDomain(process.env.NEXT_PUBLIC_INVIDIOUS_URL) &&
      !isFrontendHost(process.env.NEXT_PUBLIC_INVIDIOUS_URL, req) &&
      !isLoopback(process.env.NEXT_PUBLIC_INVIDIOUS_URL)
    ) {
      list.push({
        baseUrl: process.env.NEXT_PUBLIC_INVIDIOUS_URL.trim().replace(/\/+$/, ''),
        kind: 'invidious',
      });
    }
    if (!configuredInvidiousEnv) {
      list.push({ baseUrl: 'http://127.0.0.1:7601', kind: 'invidious' });
    }
    return list;
  };

  if (isDirectCompanionStream) {
    // Attempt companionRoot once — never loop multiple times against Companion or fall back to Invidious/public
    rawCandidates.push({ baseUrl: companionRoot, kind: 'companion' });
  } else if (isManifestOrLatestVersion) {
    // Attempt companionRoot once first; allow a single primary Invidious fallback only if Companion 404s
    rawCandidates.push({ baseUrl: companionRoot, kind: 'companion' });
    const primaryInvidious = buildLocalInvidiousCandidates()[0];
    if (primaryInvidious) {
      rawCandidates.push(primaryInvidious);
    }
  } else {
    rawCandidates.push(...buildLocalInvidiousCandidates());

    // Never fall back to public Invidious instances on /api/v1/videos/*, auth routes,
    // media/manifest routes, or when a local INVIDIOUS_URL is configured.
    if (!isAuthApi && !isVideosApi && !isMediaOrManifestRoute && !configuredInvidiousEnv) {
      for (const pub of PUBLIC_FALLBACK_INSTANCES) {
        rawCandidates.push({ baseUrl: pub, kind: 'public' });
      }
    }
  }

  // Deduplicate candidates preserving priority order
  const seenCandidateKeys = new Set<string>();
  const uniqueCandidates: ProxyCandidate[] = [];
  for (const c of rawCandidates) {
    if (!c.baseUrl) continue;
    const key = `${c.kind}:${c.baseUrl}`;
    if (!seenCandidateKeys.has(key)) {
      seenCandidateKeys.add(key);
      uniqueCandidates.push(c);
    }
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KV-Tube',
    'Accept-Language': req.headers.get('accept-language') || 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  const range = req.headers.get('range');
  if (range) headers['Range'] = range;

  // Prevent upstream gzip compression on Range / media stream requests so Content-Length and Content-Range stay exact
  if (range || isStreamOrMediaPath || isMediaOrManifestRoute) {
    headers['Accept-Encoding'] = 'identity';
  }

  const accept = req.headers.get('accept');
  if (accept) headers['Accept'] = accept;

  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const customCookie = req.headers.get('x-invidious-cookie');
  const customToken = req.headers.get('x-invidious-token');
  const defaultToken = process.env.INVIDIOUS_TOKEN || process.env.NEXT_PUBLIC_INVIDIOUS_TOKEN;

  if (customCookie) {
    headers['Cookie'] = customCookie;
  } else if (customToken) {
    const t = customToken.trim();
    if (tokenWantsBearer(t)) {
      headers['Authorization'] = `Bearer ${t}`;
    } else {
      headers['Cookie'] = `SID=${t}`;
    }
  } else if (defaultToken) {
    const t = defaultToken.trim();
    if (tokenWantsBearer(t)) {
      headers['Authorization'] = `Bearer ${t}`;
    } else {
      headers['Cookie'] = `SID=${t}`;
    }
  }

  let body: BodyInit | undefined = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await req.arrayBuffer();
      const contentType = req.headers.get('content-type');
      if (contentType) headers['Content-Type'] = contentType;
    } catch {}
  }

  // Response-header-only timeout: 20_000ms for streams/manifests, 15_000ms for /api/v1/videos/, 8_000ms for other API calls
  const headerTimeoutMs =
    isMediaOrManifestRoute || !!range
      ? 20_000
      : isVideosApi
        ? 15_000
        : 8_000;

  let lastError: any = null;
  let firstHttpError: Error | null = null;
  let primaryErrorStatus: number | null = null;

  for (const candidate of uniqueCandidates) {
    if (req.signal.aborted) {
      break;
    }

    const instance = candidate.baseUrl;
    try {
      const effectivePath =
        candidate.kind === 'companion' && subPath !== '/companion' && !subPath.startsWith('/companion/')
          ? `/companion${subPath.startsWith('/') ? subPath : `/${subPath}`}`
          : candidate.kind === 'invidious' && subPath.startsWith('/companion/')
            ? subPath.replace(/^\/companion/, '') || '/'
            : subPath;

      const targetUrl = new URL(effectivePath, instance);
      req.nextUrl.searchParams.forEach((val, key) => {
        targetUrl.searchParams.set(key, val);
      });

      if (
        (candidate.kind === 'companion' || candidate.kind === 'invidious') &&
        shouldInjectLocalParam(effectivePath)
      ) {
        targetUrl.searchParams.set('local', 'true');
      }

      const attemptHeaders: Record<string, string> = { ...headers };
      if (!isAuthApi && (candidate.kind === 'public' || candidate.kind === 'companion')) {
        delete attemptHeaders['Authorization'];
        delete attemptHeaders['Cookie'];
      }

      const candidateTimeoutMs = candidate.kind === 'public' ? 3_000 : headerTimeoutMs;
      const res = await fetchWithCompanionRedirects(targetUrl.toString(), {
        method: req.method,
        headers: attemptHeaders,
        body,
        headerTimeoutMs: candidateTimeoutMs,
        maxRedirects: 4,
        clientSignal: req.signal,
        companionRoot,
      });

      const upstreamContentType = (res.headers.get('content-type') || '').toLowerCase();
      const isHtmlResponse = upstreamContentType.includes('text/html');
      const isExpectedJsonApi =
        (isApiV1 && !subPath.startsWith('/api/v1/captions') && req.method === 'GET') ||
        upstreamContentType.includes('application/json');
      const isEmptyMediaOrManifest =
        isMediaOrManifestRoute &&
        req.method !== 'HEAD' &&
        res.headers.get('content-length') === '0';
      const isEmptyApiJsonHeader =
        isExpectedJsonApi &&
        req.method !== 'HEAD' &&
        res.status === 200 &&
        res.headers.get('content-length') === '0';

      if (isAuthApi) {
        if (res.status >= 500 || isHtmlResponse || isEmptyApiJsonHeader) {
          res.body?.cancel().catch(() => {});
          lastError = new Error(
            isEmptyApiJsonHeader
              ? `Instance ${instance} returned empty 200 OK response for ${subPath}`
              : `Instance ${instance} returned status ${res.status}`
          );
          if (!firstHttpError) firstHttpError = lastError;
          continue;
        }
      } else {
        const isUpstreamFailure =
          res.status >= 500 ||
          res.status === 401 ||
          res.status === 403 ||
          res.status === 404 ||
          res.status === 429 ||
          ((isApiV1 || isMediaOrManifestRoute) && isHtmlResponse) ||
          isEmptyMediaOrManifest ||
          isEmptyApiJsonHeader;

        if (isUpstreamFailure) {
          let detail = isEmptyApiJsonHeader
            ? `Instance ${instance} returned empty 200 OK response (content-length: 0) for ${subPath}`
            : `Instance ${instance} returned status ${res.status}`;
          if (!isEmptyApiJsonHeader && upstreamContentType.includes('application/json')) {
            try {
              const errJson = await res.json();
              if (errJson?.error) detail = `${detail}: ${errJson.error}`;
              if (!primaryErrorStatus && res.status === 404) primaryErrorStatus = 404;
            } catch {}
          } else {
            res.body?.cancel().catch(() => {});
          }
          lastError = new Error(detail);
          if (!firstHttpError) firstHttpError = lastError;

          // If Companion returned a non-404 error on a manifest/latest_version route, do not retry Invidious
          if (isManifestOrLatestVersion && candidate.kind === 'companion' && res.status !== 404) {
            break;
          }
          continue;
        }
      }

      const isMedia =
        isStreamOrMediaPath ||
        upstreamContentType.startsWith('video/') ||
        upstreamContentType.startsWith('audio/') ||
        upstreamContentType.startsWith('application/octet-stream') ||
        res.status === 206 ||
        !!range;

      const responseHeaders = new Headers();
      const headersToForward = [
        'content-type',
        'content-range',
        'accept-ranges',
        'location',
      ];
      headersToForward.forEach((h) => {
        const val = res.headers.get(h);
        if (val) responseHeaders.set(h, val);
      });

      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD');
      responseHeaders.set('Access-Control-Allow-Headers', '*');

      const contentEncoding = (res.headers.get('content-encoding') || '').toLowerCase();
      const hasIdentityLength = !contentEncoding || contentEncoding === 'identity';

      if (req.method === 'HEAD') {
        const len = res.headers.get('content-length');
        if (len && hasIdentityLength) responseHeaders.set('content-length', len);
        return new NextResponse(null, {
          status: res.status,
          headers: responseHeaders,
        });
      }

      // Media streams must be streamed through untouched (range support, 206 Partial Content, low memory).
      if (isMedia) {
        const len = res.headers.get('content-length');
        if (len && hasIdentityLength) responseHeaders.set('content-length', len);
        return new NextResponse(res.body, {
          status: res.status,
          headers: responseHeaders,
        });
      }

      // JSON / other small payloads are buffered so the client always receives a
      // complete body with a correct content-length (and 0-byte 200 OK bodies on
      // /api/v1/* are rejected as 502 instead of crashing res.json() in browser).
      const buf = await res.arrayBuffer();
      if (isExpectedJsonApi && res.status === 200) {
        if (buf.byteLength === 0 || new TextDecoder().decode(buf).trim().length === 0) {
          lastError = new Error(`Instance ${instance} returned empty 200 OK JSON body for ${subPath}`);
          if (!firstHttpError) firstHttpError = lastError;
          continue;
        }
      }

      responseHeaders.set('Cache-Control', 'no-store');
      return new NextResponse(buf, {
        status: res.status,
        headers: responseHeaders,
      });
    } catch (e: any) {
      if (req.signal.aborted) {
        return new NextResponse(null, { status: 499 });
      }
      lastError = e;
      continue;
    }
  }

  return NextResponse.json(
    { error: (firstHttpError || lastError)?.message || 'Proxy request failed' },
    {
      status: primaryErrorStatus || 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    }
  );
}
