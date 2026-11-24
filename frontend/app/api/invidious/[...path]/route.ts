import { NextRequest, NextResponse } from 'next/server';
import { tokenWantsBearer } from '../../../services/invidiousToken';
import {
  fetchWithCompanionRedirects,
  getCompanionRoot,
  shouldInjectLocalParam,
} from '../../../services/companionUrl';
import {
  fetchInnertubeSuggestions,
  searchInnertube,
} from '../../../services/innertubeSearch';

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

type CachedApiResponse = {
  body: ArrayBuffer;
  status: number;
  contentType: string;
  freshUntil: number;
  staleUntil: number;
};

// Server-side in-memory Stale-While-Revalidate (SWR) LRU cache + in-flight coalescing
const SERVER_API_CACHE = new Map<string, CachedApiResponse>();
const SERVER_INFLIGHT = new Map<string, Promise<CachedApiResponse | null>>();
const SERVER_BG_REFRESHING = new Set<string>();
const MAX_SERVER_CACHE_ENTRIES = 400;
const SEARCH_DEGRADED_COOLDOWN_MS = 2 * 60 * 1000;
let invidiousSearchDegradedUntil = 0;

// Direct videoplayback 302 redirect cache + initial stream prefix cache (Init + sidx + Segment #1)
const VIDEOPLAYBACK_REDIRECT_CACHE = new Map<string, { url: string; expiry: number }>();
const STREAM_PREFIX_CACHE = new Map<
  string,
  { buf: ArrayBuffer; contentType: string; clen: string; expiry: number }
>();
const STREAM_PREFIX_INFLIGHT = new Map<
  string,
  Promise<{ buf: ArrayBuffer; contentType: string; clen: string } | null>
>();
const VIDEOPLAYBACK_POST_BODY = new Uint8Array([0x78, 0]);
const MAX_PREFIX_CACHE_ENTRIES = 20;

function setRedirectCache(key: string, url: string) {
  if (VIDEOPLAYBACK_REDIRECT_CACHE.has(key)) {
    VIDEOPLAYBACK_REDIRECT_CACHE.delete(key);
  }
  VIDEOPLAYBACK_REDIRECT_CACHE.set(key, { url, expiry: Date.now() + 15 * 60 * 1000 });
  if (VIDEOPLAYBACK_REDIRECT_CACHE.size > 500) {
    const oldest = VIDEOPLAYBACK_REDIRECT_CACHE.keys().next().value;
    if (oldest) VIDEOPLAYBACK_REDIRECT_CACHE.delete(oldest);
  }
}

function getRedirectCache(key: string): string | null {
  const entry = VIDEOPLAYBACK_REDIRECT_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    VIDEOPLAYBACK_REDIRECT_CACHE.delete(key);
    return null;
  }
  return entry.url;
}

function setPrefixCache(
  key: string,
  val: { buf: ArrayBuffer; contentType: string; clen: string }
) {
  if (STREAM_PREFIX_CACHE.has(key)) {
    STREAM_PREFIX_CACHE.delete(key);
  }
  STREAM_PREFIX_CACHE.set(key, { ...val, expiry: Date.now() + 60 * 1000 });
  if (STREAM_PREFIX_CACHE.size > MAX_PREFIX_CACHE_ENTRIES) {
    const oldest = STREAM_PREFIX_CACHE.keys().next().value;
    if (oldest) STREAM_PREFIX_CACHE.delete(oldest);
  }
}

function getPrefixCache(
  key: string
): { buf: ArrayBuffer; contentType: string; clen: string } | null {
  const entry = STREAM_PREFIX_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    STREAM_PREFIX_CACHE.delete(key);
    return null;
  }
  return entry;
}

function getGooglevideoHeaders(clientName: string | null): Record<string, string> {
  const h: Record<string, string> = {
    accept: '*/*',
    'accept-encoding': 'identity',
    'accept-language': 'en-us,en;q=0.5',
    origin: 'https://www.youtube.com',
    referer: 'https://www.youtube.com',
  };
  if (clientName === 'ANDROID') {
    h['user-agent'] =
      'com.google.android.youtube/1537338816 (Linux; U; Android 13; en_US; ; Build/TQ2A.230505.002; Cronet/113.0.5672.24)';
  } else if (clientName === 'IOS') {
    h['user-agent'] =
      'com.google.ios.youtube/19.32.8 (iPhone14,5; U; CPU iOS 17_6 like Mac OS X;)';
  } else {
    h['user-agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  }
  return h;
}

async function fetchDirectGooglevideoRange(
  params: URLSearchParams,
  rangeBytes: string | null,
  signal?: AbortSignal
): Promise<Response | null> {
  const host = params.get('host');
  const clientName = params.get('c');
  const expire = params.get('expire');
  if (!host || !/^[\w.-]+\.googlevideo\.com$/i.test(host) || !clientName || !expire) {
    return null;
  }
  if (params.get('enc') === 'true') {
    return null;
  }

  const id = params.get('id') || '';
  const itag = params.get('itag') || '';
  const cacheKey = `${id}:${itag}`;
  const cachedRedirectBase = id && itag ? getRedirectCache(cacheKey) : null;

  let targetUrl: string;
  if (cachedRedirectBase) {
    const cu = new URL(cachedRedirectBase);
    if (rangeBytes) {
      cu.searchParams.set('range', rangeBytes);
    } else {
      cu.searchParams.delete('range');
    }
    targetUrl = cu.toString();
  } else {
    const qp = new URLSearchParams(params);
    qp.delete('host');
    qp.delete('title');
    qp.delete('local');
    if (rangeBytes) {
      qp.set('range', rangeBytes);
    }
    targetUrl = `https://${host}/videoplayback?${qp.toString()}`;
  }

  const headersToSend = getGooglevideoHeaders(clientName);

  for (let hop = 0; hop < 4; hop++) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), 14_000);
    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: 'POST',
        body: VIDEOPLAYBACK_POST_BODY,
        redirect: 'manual',
        headers: headersToSend,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    const isRedirect =
      res.status === 301 ||
      res.status === 302 ||
      res.status === 303 ||
      res.status === 307 ||
      res.status === 308;
    const loc = res.headers.get('location');
    if (isRedirect && loc && hop < 3) {
      res.body?.cancel().catch(() => {});
      const locUrl = new URL(loc, targetUrl);
      if (id && itag) {
        const baseForCache = new URL(locUrl.toString());
        baseForCache.searchParams.delete('range');
        setRedirectCache(cacheKey, baseForCache.toString());
      }
      if (rangeBytes) {
        locUrl.searchParams.set('range', rangeBytes);
      }
      targetUrl = locUrl.toString();
      continue;
    }

    if (res.status === 200 || res.status === 206) {
      return res;
    }
    res.body?.cancel().catch(() => {});
    // If cached redirect expired or failed, clear it and retry once from original host
    if (cachedRedirectBase && hop === 0 && id && itag) {
      VIDEOPLAYBACK_REDIRECT_CACHE.delete(cacheKey);
      const qp = new URLSearchParams(params);
      qp.delete('host');
      qp.delete('title');
      qp.delete('local');
      if (rangeBytes) qp.set('range', rangeBytes);
      targetUrl = `https://${host}/videoplayback?${qp.toString()}`;
      continue;
    }
    return null;
  }
  return null;
}

function ensureStreamPrefix(
  params: URLSearchParams,
  prefixBytes: number
): Promise<{ buf: ArrayBuffer; contentType: string; clen: string } | null> {
  const id = params.get('id') || '';
  const itag = params.get('itag') || '';
  if (!id || !itag) return Promise.resolve(null);
  const cacheKey = `${id}:${itag}`;
  const cached = getPrefixCache(cacheKey);
  if (cached) return Promise.resolve(cached);
  const inflight = STREAM_PREFIX_INFLIGHT.get(cacheKey);
  if (inflight) return inflight;

  const clenNum = parseInt(params.get('clen') || '0', 10);
  const maxEnd = clenNum > 0 ? Math.min(prefixBytes - 1, clenNum - 1) : prefixBytes - 1;
  const p = (async () => {
    try {
      const res = await fetchDirectGooglevideoRange(params, `0-${maxEnd}`);
      if (!res) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) return null;
      const entry = {
        buf,
        contentType:
          res.headers.get('content-type') ||
          params.get('mime') ||
          (itag === '140' ? 'audio/mp4' : 'video/mp4'),
        clen: params.get('clen') || String(buf.byteLength),
      };
      setPrefixCache(cacheKey, entry);
      return entry;
    } catch {
      return null;
    } finally {
      STREAM_PREFIX_INFLIGHT.delete(cacheKey);
    }
  })();
  STREAM_PREFIX_INFLIGHT.set(cacheKey, p);
  return p;
}

function prewarmDashInitialStreams(dashXml: string) {
  try {
    const matches = [...dashXml.matchAll(/<BaseURL>([^<]+)<\/BaseURL>/g)].map((m) =>
      m[1].replace(/&amp;/g, '&')
    );
    if (matches.length === 0) return;
    const audioUrl = matches.find((b) => b.includes('itag=140&'));
    const videoUrl =
      matches.find((b) => b.includes('itag=135&')) ||
      matches.find((b) => b.includes('itag=136&')) ||
      matches.find((b) => b.includes('itag=134&'));

    if (audioUrl) {
      const u = new URL(audioUrl, 'http://companion.internal');
      void ensureStreamPrefix(u.searchParams, 163840);
    }
    if (videoUrl) {
      const u = new URL(videoUrl, 'http://companion.internal');
      void ensureStreamPrefix(u.searchParams, 294912);
    }
  } catch {}
}

async function handleDirectVideoPlayback(req: NextRequest): Promise<NextResponse | null> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const params = req.nextUrl.searchParams;
  if (params.get('enc') === 'true' || !params.get('host')) return null;

  const rangeHeader = req.headers.get('range');
  const requestBytes = rangeHeader ? rangeHeader.replace(/^bytes=/i, '').trim() : params.get('range');
  const [firstStr, lastStr] = (requestBytes || '').split('-');
  const start = firstStr ? parseInt(firstStr, 10) : NaN;
  const end = lastStr ? parseInt(lastStr, 10) : NaN;

  const id = params.get('id') || '';
  const itag = params.get('itag') || '';
  const clen = params.get('clen') || '*';
  const isAudio = itag === '140' || (params.get('mime') || '').startsWith('audio/');
  const prefixBytes = isAudio ? 163840 : 294912;
  const cacheKey = `${id}:${itag}`;

  // 1. Coalesce initial SegmentBase Init (0-722) + sidx Index (723-1246) + first 3-4s segment into one prefix fetch
  if (
    req.method === 'GET' &&
    id &&
    itag &&
    !isNaN(start) &&
    !isNaN(end) &&
    start >= 0 &&
    end >= start &&
    end < prefixBytes
  ) {
    let prefix = getPrefixCache(cacheKey);
    if (!prefix) {
      if ((start === 0 && end <= 4096) || STREAM_PREFIX_INFLIGHT.has(cacheKey)) {
        prefix = await ensureStreamPrefix(params, prefixBytes);
      }
    }
    if (prefix && end < prefix.buf.byteLength) {
      const slice = prefix.buf.slice(start, end + 1);
      const totalLen = prefix.clen || clen || '*';
      return new NextResponse(slice, {
        status: 206,
        headers: {
          'content-type': prefix.contentType,
          'content-length': String(slice.byteLength),
          'content-range': `bytes ${start}-${start + slice.byteLength - 1}/${totalLen}`,
          'accept-ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'x-kv-stream': 'PREFIX-HIT',
        },
      });
    }
  }

  // 2. Direct single-POST upstream fetch over WARP (skipping Companion's double HEAD+POST loop)
  const upstreamRes = await fetchDirectGooglevideoRange(
    params,
    requestBytes || null,
    req.signal
  );
  if (!upstreamRes) return null;

  const contentType =
    upstreamRes.headers.get('content-type') ||
    params.get('mime') ||
    (isAudio ? 'audio/mp4' : 'video/mp4');
  const upstreamLen = upstreamRes.headers.get('content-length') || '';

  const responseHeaders = new Headers();
  responseHeaders.set('content-type', contentType);
  responseHeaders.set('accept-ranges', 'bytes');
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD');
  responseHeaders.set('Access-Control-Allow-Headers', '*');
  responseHeaders.set('x-kv-stream', 'DIRECT-POST');
  if (upstreamLen) {
    responseHeaders.set('content-length', upstreamLen);
  }

  let status = upstreamRes.status;
  if (requestBytes && status === 200) {
    if (!isNaN(start) && !isNaN(end)) {
      status = 206;
      responseHeaders.set('content-range', `bytes ${start}-${end}/${clen || '*'}`);
    } else if (!isNaN(start) && upstreamLen) {
      const total = start + parseInt(upstreamLen, 10);
      if (start > 0) status = 206;
      responseHeaders.set('content-range', `bytes ${start}-${total - 1}/${clen !== '*' ? clen : total}`);
    }
  } else {
    const cr = upstreamRes.headers.get('content-range');
    if (cr) responseHeaders.set('content-range', cr);
  }

  if (req.method === 'HEAD') {
    upstreamRes.body?.cancel().catch(() => {});
    return new NextResponse(null, { status, headers: responseHeaders });
  }

  return new NextResponse(upstreamRes.body, {
    status,
    headers: responseHeaders,
  });
}

function getCacheTtls(subPath: string): { freshMs: number; staleMs: number } | null {
  if (
    subPath.startsWith('/api/v1/trending') ||
    subPath.startsWith('/api/v1/popular') ||
    subPath.startsWith('/api/v1/search') ||
    subPath.startsWith('/api/v1/channels') ||
    subPath.startsWith('/api/v1/comments') ||
    subPath.startsWith('/api/v1/playlists') ||
    subPath.startsWith('/api/v1/mixes')
  ) {
    return { freshMs: 3 * 60 * 1000, staleMs: 30 * 60 * 1000 };
  }
  if (subPath === '/api/v1/videos' || subPath.startsWith('/api/v1/videos/')) {
    return { freshMs: 5 * 60 * 1000, staleMs: 20 * 60 * 1000 };
  }
  if (subPath.startsWith('/api/manifest/dash/')) {
    return { freshMs: 2 * 60 * 1000, staleMs: 8 * 60 * 1000 };
  }
  return null;
}

function setServerCache(key: string, entry: CachedApiResponse) {
  if (SERVER_API_CACHE.has(key)) {
    SERVER_API_CACHE.delete(key);
  }
  SERVER_API_CACHE.set(key, entry);
  if (SERVER_API_CACHE.size > MAX_SERVER_CACHE_ENTRIES) {
    const oldestKey = SERVER_API_CACHE.keys().next().value;
    if (oldestKey) SERVER_API_CACHE.delete(oldestKey);
  }
}

let prewarmTriggered = false;
function triggerServerCachePrewarm(origin: string) {
  if (prewarmTriggered) return;
  prewarmTriggered = true;
  setTimeout(() => {
    const warmPaths = [
      '/api/invidious/api/v1/trending?region=VN',
      '/api/invidious/api/v1/search?q=nh%E1%BA%A1c+tr%E1%BA%BB+th%E1%BB%8Bnh+h%C3%A0nh+vi%E1%BB%87t+nam&page=1&type=video&region=VN&date=month&sort_by=upload_date',
      '/api/invidious/api/v1/search?q=nh%E1%BA%A1c+tr%E1%BA%BB+th%E1%BB%8Bnh+h%C3%A0nh+vi%E1%BB%87t+nam&page=1&type=video&region=VN&date=month&sort_by=view_count',
    ];
    for (const p of warmPaths) {
      fetch(`${origin}${p}`, {
        headers: { 'x-kv-prewarm': '1', Accept: 'application/json' },
      }).catch(() => {});
    }
  }, 300);
}

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

// ---- Thumbnail fast path ---------------------------------------------------
// Invidious proxies /vi/... through the same WARP tunnel as video traffic,
// which times out after ~5 s and returns an empty 200 — so poster images never
// loaded in the Android apps. i.ytimg.com / yt3.ggpht.com are reachable
// directly from the server, so serve them straight from there and cache.
type ThumbEntry = { body: Uint8Array; contentType: string; expires: number };
const THUMB_CACHE = new Map<string, ThumbEntry>();
const THUMB_INFLIGHT = new Map<string, Promise<ThumbEntry | null>>();
const THUMB_TTL_MS = 24 * 60 * 60 * 1000;
const THUMB_MAX_ENTRIES = 1500;
const THUMB_VIDEO_RE = /^\/vi(?:_webp)?\/([A-Za-z0-9_-]{6,15})\/([a-z0-9_]{3,24})\.(jpg|webp)$/;
const THUMB_GGPHT_RE = /^\/ggpht\/([A-Za-z0-9_\-=./]{3,300})$/;

function thumbUpstreamUrl(subPath: string): string | null {
  const v = THUMB_VIDEO_RE.exec(subPath);
  if (v) {
    const dir = subPath.startsWith('/vi_webp/') ? 'vi_webp' : 'vi';
    return `https://i.ytimg.com/${dir}/${v[1]}/${v[2]}.${v[3]}`;
  }
  const g = THUMB_GGPHT_RE.exec(subPath);
  if (g && !g[1].includes('..')) return `https://yt3.ggpht.com/${g[1]}`;
  return null;
}

async function fetchThumb(url: string): Promise<ThumbEntry | null> {
  const now = Date.now();
  const hit = THUMB_CACHE.get(url);
  if (hit && hit.expires > now) return hit;
  const running = THUMB_INFLIGHT.get(url);
  if (running) return running;
  const job = (async () => {
    // Direct first (fast); fall back to hqdefault when a size does not exist.
    const candidates = [url];
    const m = /\/(maxresdefault|sddefault|hq720)\.(jpg|webp)$/.exec(url);
    if (m) candidates.push(url.replace(m[0], `/hqdefault.${m[2]}`));
    for (const u of candidates) {
      try {
        const res = await fetch(u, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(6000),
        });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.startsWith('image/')) continue;
        const body = new Uint8Array(await res.arrayBuffer());
        if (body.byteLength === 0) continue;
        const entry: ThumbEntry = { body, contentType: ct, expires: Date.now() + THUMB_TTL_MS };
        if (THUMB_CACHE.size >= THUMB_MAX_ENTRIES) {
          const first = THUMB_CACHE.keys().next().value;
          if (first) THUMB_CACHE.delete(first);
        }
        THUMB_CACHE.set(url, entry);
        return entry;
      } catch {
        // try next candidate
      }
    }
    return null;
  })().finally(() => THUMB_INFLIGHT.delete(url));
  THUMB_INFLIGHT.set(url, job);
  return job;
}

async function handleProxy(req: NextRequest, pathParts: string[]) {
  const subPath = '/' + (pathParts || []).join('/');
  const isApiV1 = subPath.startsWith('/api/v1/');
  const isAuthApi = subPath.startsWith('/api/v1/auth');
  const isVideosApi = subPath === '/api/v1/videos' || subPath.startsWith('/api/v1/videos/');
  const isSearchApi = subPath === '/api/v1/search';
  const isSuggestionsApi = subPath === '/api/v1/search/suggestions';

  if (!req.headers.get('x-kv-prewarm') && !req.headers.get('x-kv-bg-revalidate')) {
    triggerServerCachePrewarm(req.nextUrl.origin);
  }

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

  // Thumbnail fast path (direct to YouTube's image CDN, cached 24 h).
  if (req.method === 'GET' || req.method === 'HEAD') {
    const thumbUrl = thumbUpstreamUrl(subPath);
    if (thumbUrl) {
      const entry = await fetchThumb(thumbUrl);
      if (entry) {
        return new NextResponse(req.method === 'HEAD' ? null : (entry.body as unknown as BodyInit), {
          status: 200,
          headers: {
            'content-type': entry.contentType,
            'content-length': String(entry.body.byteLength),
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800, immutable',
          },
        });
      }
      // else: fall through to the Invidious proxy path
    }
  }

  // Fast path: single direct POST to googlevideo (cached 302 edge + coalesced init/sidx/segment-1 prefix)
  if (
    /^\/(companion\/)?videoplayback\/?$/.test(subPath) &&
    (req.method === 'GET' || req.method === 'HEAD')
  ) {
    try {
      const fast = await handleDirectVideoPlayback(req);
      if (fast) return fast;
    } catch (e) {
      if (req.signal.aborted) return new NextResponse(null, { status: 499 });
      // fall through to Companion proxy path
    }
  }

  const customInstance = req.headers.get('x-invidious-instance');
  const validCustomInstance = isValidCustomInstance(customInstance, req)
    ? customInstance!.trim().replace(/\/+$/, '')
    : null;

  const cacheTtls =
    req.method === 'GET' && !isAuthApi && !isStreamOrMediaPath && !req.headers.get('range')
      ? getCacheTtls(subPath)
      : null;
  const cacheKey = cacheTtls
    ? `${validCustomInstance || 'default'}:${subPath}?${req.nextUrl.searchParams.toString()}`
    : null;
  const isBgRevalidate = req.headers.get('x-kv-bg-revalidate') === '1';

  if (cacheKey && !isBgRevalidate) {
    const cached = SERVER_API_CACHE.get(cacheKey);
    const now = Date.now();
    if (cached && now < cached.staleUntil) {
      if (subPath.startsWith('/api/manifest/dash/')) {
        prewarmDashInitialStreams(new TextDecoder().decode(cached.body));
      }
      if (now >= cached.freshUntil && !SERVER_BG_REFRESHING.has(cacheKey)) {
        SERVER_BG_REFRESHING.add(cacheKey);
        fetch(req.url, {
          headers: {
            'x-kv-bg-revalidate': '1',
            ...(validCustomInstance ? { 'x-invidious-instance': validCustomInstance } : {}),
          },
        })
          .catch(() => {})
          .finally(() => {
            SERVER_BG_REFRESHING.delete(cacheKey);
          });
      }
      return new NextResponse(cached.body, {
        status: cached.status,
        headers: {
          'content-type': cached.contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
          'x-kv-cache': now < cached.freshUntil ? 'HIT' : 'STALE',
        },
      });
    }

    const inflight = SERVER_INFLIGHT.get(cacheKey);
    if (inflight) {
      try {
        const shared = await inflight;
        if (shared) {
          return new NextResponse(shared.body, {
            status: shared.status,
            headers: {
              'content-type': shared.contentType,
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
              'x-kv-cache': 'COALESCED',
            },
          });
        }
      } catch {}
    }
  }

  let resolveInflight: ((val: CachedApiResponse | null) => void) | null = null;
  if (cacheKey && !SERVER_INFLIGHT.has(cacheKey)) {
    const p = new Promise<CachedApiResponse | null>((resolve) => {
      resolveInflight = resolve;
    });
    SERVER_INFLIGHT.set(cacheKey, p);
  }
  const finishInflight = (val: CachedApiResponse | null) => {
    if (cacheKey && resolveInflight) {
      SERVER_INFLIGHT.delete(cacheKey);
      resolveInflight(val);
      resolveInflight = null;
    }
  };

  const respondWithFallbackJson = (
    payload: unknown,
    shouldCache: boolean,
    reason?: string
  ): NextResponse => {
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const buf = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
    if (shouldCache && cacheKey && cacheTtls && buf.byteLength > 0) {
      const now = Date.now();
      const entry: CachedApiResponse = {
        body: buf,
        status: 200,
        contentType: 'application/json',
        freshUntil: now + cacheTtls.freshMs,
        staleUntil: now + cacheTtls.staleMs,
      };
      setServerCache(cacheKey, entry);
      finishInflight(entry);
    } else {
      finishInflight(null);
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
        'x-kv-source': 'innertube-fallback',
        ...(reason ? { 'x-kv-fallback-reason': reason } : {}),
      },
    });
  };

  const trySearchFallback = async (reason: string): Promise<NextResponse | null> => {
    try {
      const sp = req.nextUrl.searchParams;
      const q = (sp.get('q') || '').trim();
      if (!q) return null;
      const page = parseInt(sp.get('page') || '1', 10) || 1;
      const items = await searchInnertube({
        q,
        page,
        sort_by: sp.get('sort_by') || undefined,
        date: sp.get('date') || undefined,
        duration: sp.get('duration') || undefined,
        type: sp.get('type') || undefined,
        features: sp.get('features') || undefined,
        region: sp.get('region') || undefined,
        hl: sp.get('hl') || undefined,
      });
      if (!Array.isArray(items) || (items.length === 0 && page === 1)) return null;
      return respondWithFallbackJson(items, items.length > 0, reason);
    } catch {
      return null;
    }
  };

  const trySuggestionsFallback = async (): Promise<NextResponse | null> => {
    try {
      const sp = req.nextUrl.searchParams;
      const q = (sp.get('q') || '').trim();
      if (!q) return null;
      const region = (sp.get('region') || 'VN').trim().toUpperCase();
      const gl = region === 'GLOBAL' || region.length !== 2 ? 'US' : region;
      const hl = sp.get('hl') || (gl === 'VN' ? 'vi' : 'en');
      const data = await fetchInnertubeSuggestions(q, hl, gl);
      return respondWithFallbackJson(data, data.suggestions.length > 0);
    } catch {
      return null;
    }
  };

  if (
    req.method === 'GET' &&
    isSearchApi &&
    !validCustomInstance &&
    Date.now() < invidiousSearchDegradedUntil
  ) {
    const fastFallback = await trySearchFallback('degraded-cooldown');
    if (fastFallback) return fastFallback;
  }

  const companionRoot = getCompanionRoot(process.env.COMPANION_URL);

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

  // Response-header-only timeout: 20_000ms for streams/manifests, 15_000ms for /api/v1/videos/, 3_500ms for search, 8_000ms for other API calls
  const headerTimeoutMs =
    isMediaOrManifestRoute || !!range
      ? 20_000
      : isVideosApi
        ? 15_000
        : isSearchApi || isSuggestionsApi
          ? 3_500
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
        let isUpstreamFailure =
          res.status >= 500 ||
          res.status === 401 ||
          res.status === 403 ||
          res.status === 404 ||
          res.status === 429 ||
          (res.status === 400 && (isSearchApi || isSuggestionsApi)) ||
          ((isApiV1 || isMediaOrManifestRoute) && isHtmlResponse) ||
          isEmptyMediaOrManifest ||
          isEmptyApiJsonHeader;

        let inspected400Buf: ArrayBuffer | null = null;
        let inspected400Error: string | null = null;
        if (
          !isUpstreamFailure &&
          res.status === 400 &&
          isApiV1 &&
          upstreamContentType.includes('application/json')
        ) {
          try {
            inspected400Buf = await res.arrayBuffer();
            const parsed = JSON.parse(new TextDecoder().decode(inspected400Buf));
            const errText = `${parsed?.error || ''} ${parsed?.errorBacktrace || ''}`;
            if (/DB::PoolTimeout|Could not check out a connection/i.test(errText)) {
              isUpstreamFailure = true;
              inspected400Error = parsed?.error || 'DB::PoolTimeout';
            }
          } catch {}
        }

        if (isUpstreamFailure) {
          let detail = isEmptyApiJsonHeader
            ? `Instance ${instance} returned empty 200 OK response (content-length: 0) for ${subPath}`
            : inspected400Error
              ? `Instance ${instance} returned status ${res.status}: ${inspected400Error}`
              : `Instance ${instance} returned status ${res.status}`;
          if (!isEmptyApiJsonHeader && !inspected400Buf && upstreamContentType.includes('application/json')) {
            try {
              const errJson = await res.json();
              if (errJson?.error) detail = `${detail}: ${errJson.error}`;
              if (!primaryErrorStatus && res.status === 404) primaryErrorStatus = 404;
            } catch {}
          } else if (!inspected400Buf) {
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

        if (inspected400Buf) {
          finishInflight(null);
          return new NextResponse(inspected400Buf, {
            status: res.status,
            headers: {
              'content-type': res.headers.get('content-type') || 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'private, no-cache',
            },
          });
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

      if (subPath.startsWith('/api/manifest/dash/') && res.status === 200 && buf.byteLength > 0) {
        prewarmDashInitialStreams(new TextDecoder().decode(buf));
      }

      if (cacheKey && cacheTtls && res.status === 200 && buf.byteLength > 0) {
        const now = Date.now();
        const entry: CachedApiResponse = {
          body: buf,
          status: res.status,
          contentType: res.headers.get('content-type') || 'application/json',
          freshUntil: now + cacheTtls.freshMs,
          staleUntil: now + cacheTtls.staleMs,
        };
        setServerCache(cacheKey, entry);
        finishInflight(entry);
        responseHeaders.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
        responseHeaders.set('x-kv-cache', 'MISS');
      } else {
        finishInflight(null);
        responseHeaders.set('Cache-Control', 'private, no-cache');
      }

      return new NextResponse(buf, {
        status: res.status,
        headers: responseHeaders,
      });
    } catch (e: any) {
      if (req.signal.aborted) {
        finishInflight(null);
        return new NextResponse(null, { status: 499 });
      }
      lastError = e;
      continue;
    }
  }

  if (req.method === 'GET' && isSearchApi && !req.signal.aborted) {
    if (!validCustomInstance) {
      invidiousSearchDegradedUntil = Date.now() + SEARCH_DEGRADED_COOLDOWN_MS;
    }
    const fallbackRes = await trySearchFallback('upstream-failed');
    if (fallbackRes) return fallbackRes;
  }

  if (req.method === 'GET' && isSuggestionsApi && !req.signal.aborted) {
    const fallbackRes = await trySuggestionsFallback();
    if (fallbackRes) return fallbackRes;
  }

  finishInflight(null);
  return NextResponse.json(
    { error: (firstHttpError || lastError)?.message || 'Proxy request failed' },
    {
      status: primaryErrorStatus || 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'private, no-cache',
      },
    }
  );
}
