/**
 * Shared Companion URL normalization and redirect-safe upstream stream helper.
 *
 * Ensures all media streams, manifests, redirects, single-stream downloads,
 * ffmpeg dual-stream muxing, and media-proxy fetches route through internal
 * Invidious Companion (COMPANION_URL -> WARP egress) so stream IPs always match
 * the IP that extracted the player response.
 */

export function normalizeCompanionBaseUrl(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/companion$/i, '')
    .replace(/\/+$/, '');
}

export function getCompanionRoot(rawEnv: string | null | undefined = process.env.COMPANION_URL): string {
  return normalizeCompanionBaseUrl(rawEnv) || 'http://companion:8282';
}

export function appendQueryParamRaw(rawSearch: string, key: string, value: string): string {
  const encoded = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  if (!rawSearch || rawSearch === '?') return `?${encoded}`;
  const prefix = rawSearch.startsWith('?') ? rawSearch : `?${rawSearch}`;
  return `${prefix}&${encoded}`;
}

export function shouldInjectLocalParam(pathname: string): boolean {
  const stripped = pathname.startsWith('/companion/')
    ? pathname.slice('/companion'.length)
    : pathname === '/companion'
      ? '/'
      : pathname;

  return (
    stripped.startsWith('/api/manifest/dash/') ||
    stripped.startsWith('/api/manifest/hls_variant/') ||
    stripped.startsWith('/api/manifest/hls_playlist/') ||
    /^\/latest_version(\/|$)/.test(stripped)
  );
}

function isInternalCompanionOrLoopbackHost(u: URL): boolean {
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const hostPort = u.host.toLowerCase();
  if (
    hostPort === '127.0.0.1:8282' ||
    hostPort === 'localhost:8282' ||
    hostPort === '[::1]:8282' ||
    hostPort === '0.0.0.0:8282' ||
    hostPort === 'companion:8282' ||
    hostPort === 'kvtube-companion:8282' ||
    hostPort === 'host.docker.internal:8282'
  ) {
    return true;
  }
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === 'companion' ||
    host === 'kvtube-companion' ||
    host === 'yt.khoavo.myds.me' ||
    host === 'youtube.khoavo.myds.me'
  );
}

function buildCompanionTargetFromPathAndSearch(
  rawPathname: string,
  u: URL,
  companionRoot: string
): string {
  let pathname = rawPathname || '/';
  if (pathname === '/api/invidious') {
    pathname = '/';
  } else if (pathname.startsWith('/api/invidious/')) {
    pathname = pathname.slice('/api/invidious'.length) || '/';
  }

  const targetPath =
    pathname === '/companion' || pathname.startsWith('/companion/')
      ? pathname
      : `/companion${pathname.startsWith('/') ? pathname : `/${pathname}`}`;

  let search = u.search;
  if (shouldInjectLocalParam(targetPath) && !u.searchParams.has('local')) {
    search = appendQueryParamRaw(search, 'local', 'true');
  }

  return `${companionRoot}${targetPath}${search}`;
}

/**
 * Normalize relative proxy paths (/api/invidious/companion/..., /companion/...),
 * loopback/internal Companion URLs (http://127.0.0.1:8282/companion/...), and
 * raw IP-bound *.googlevideo.com URLs to internal `${companionRoot}/companion/...`.
 */
export function normalizeStreamUrlToCompanion(
  rawUrl: string,
  companionRoot: string = getCompanionRoot()
): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';

  const root = normalizeCompanionBaseUrl(companionRoot) || 'http://companion:8282';

  if (trimmed.startsWith('/')) {
    try {
      const u = new URL(trimmed, 'http://companion.internal');
      return buildCompanionTargetFromPathAndSearch(u.pathname, u, root);
    } catch {
      return `${root}${trimmed.startsWith('/companion') ? trimmed : `/companion${trimmed}`}`;
    }
  }

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const host = u.hostname.toLowerCase();

  if (host === 'manifest.googlevideo.com') {
    return `${root}/companion${u.pathname}${u.search}`;
  }

  if (host === 'googlevideo.com' || host.endsWith('.googlevideo.com')) {
    const search = u.searchParams.has('host')
      ? u.search
      : appendQueryParamRaw(u.search, 'host', u.hostname);
    return `${root}/companion${u.pathname}${search}`;
  }

  if (
    isInternalCompanionOrLoopbackHost(u) ||
    u.pathname === '/api/invidious' ||
    u.pathname.startsWith('/api/invidious/') ||
    u.pathname === '/companion' ||
    u.pathname.startsWith('/companion/') ||
    /^\/(videoplayback|latest_version)(\/|$)/.test(u.pathname) ||
    u.pathname.startsWith('/api/manifest/')
  ) {
    return buildCompanionTargetFromPathAndSearch(u.pathname, u, root);
  }

  return trimmed;
}

/**
 * Rewrite an upstream 301/302/303/307/308 Location header safely so redirects to
 * 127.0.0.1:8282, localhost:8282, companion:8282, kvtube-companion:8282,
 * host.docker.internal:8282, /companion/..., or *.googlevideo.com route cleanly
 * to internal COMPANION_URL instead of failing with ECONNREFUSED.
 */
export function rewriteRedirectLocationToCompanion(
  location: string,
  currentUrl: string,
  companionRoot: string = getCompanionRoot()
): { url: string; routedToCompanion: boolean } {
  const trimmed = (location || '').trim();
  const root = normalizeCompanionBaseUrl(companionRoot) || 'http://companion:8282';

  if (trimmed === '/companion' || trimmed.startsWith('/companion/')) {
    return { url: `${root}${trimmed}`, routedToCompanion: true };
  }

  let resolved: URL;
  try {
    resolved = new URL(trimmed, currentUrl);
  } catch {
    return { url: trimmed, routedToCompanion: false };
  }

  const host = resolved.hostname.toLowerCase();
  const hostPort = resolved.host.toLowerCase();

  if (host === 'manifest.googlevideo.com') {
    return {
      url: `${root}/companion${resolved.pathname}${resolved.search}`,
      routedToCompanion: true,
    };
  }

  if (host === 'googlevideo.com' || host.endsWith('.googlevideo.com')) {
    const search = resolved.searchParams.has('host')
      ? resolved.search
      : appendQueryParamRaw(resolved.search, 'host', resolved.hostname);
    return {
      url: `${root}/companion${resolved.pathname}${search}`,
      routedToCompanion: true,
    };
  }

  const isCompanionPortOrHost =
    hostPort === '127.0.0.1:8282' ||
    hostPort === 'localhost:8282' ||
    hostPort === '[::1]:8282' ||
    hostPort === '0.0.0.0:8282' ||
    hostPort === 'companion:8282' ||
    hostPort === 'kvtube-companion:8282' ||
    hostPort === 'host.docker.internal:8282' ||
    host === 'companion' ||
    host === 'kvtube-companion';

  if (
    isCompanionPortOrHost ||
    resolved.pathname === '/companion' ||
    resolved.pathname.startsWith('/companion/')
  ) {
    return {
      url: buildCompanionTargetFromPathAndSearch(resolved.pathname, resolved, root),
      routedToCompanion: true,
    };
  }

  return { url: resolved.toString(), routedToCompanion: false };
}

export interface UpstreamFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  headerTimeoutMs?: number;
  maxRedirects?: number;
  clientSignal?: AbortSignal;
  companionRoot?: string;
}

/**
 * Perform an upstream fetch with:
 * - response-header-only timeout (cleared immediately once fetch resolves headers,
 *   never cutting off active streams after 30s)
 * - client disconnect forwarding (aborts upstream stream when req.signal aborts)
 * - manual redirect handling (up to maxRedirects hops) rewriting Companion /
 *   loopback:8282 / googlevideo.com redirects to internal companionRoot.
 */
export async function fetchWithCompanionRedirects(
  initialUrl: string,
  options: UpstreamFetchOptions = {}
): Promise<Response> {
  const {
    headerTimeoutMs = 20_000,
    maxRedirects = 4,
    clientSignal,
    companionRoot = getCompanionRoot(),
  } = options;

  let currentUrl = initialUrl;
  let currentMethod = options.method || 'GET';
  let currentBody = options.body;
  const currentHeaders: Record<string, string> = { ...(options.headers || {}) };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (clientSignal?.aborted) {
      throw clientSignal.reason || new DOMException('Client disconnected', 'AbortError');
    }

    const controller = new AbortController();
    const onClientAbort = () => {
      controller.abort(clientSignal?.reason);
    };
    if (clientSignal) {
      clientSignal.addEventListener('abort', onClientAbort, { once: true });
    }

    const timer = setTimeout(() => {
      controller.abort(new DOMException(`Upstream header timeout after ${headerTimeoutMs}ms`, 'TimeoutError'));
    }, headerTimeoutMs);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: currentMethod,
        headers: currentHeaders,
        body: currentBody,
        redirect: 'manual',
        // @ts-ignore - required by Node undici when forwarding request body
        duplex: currentBody ? 'half' : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (clientSignal) {
        clientSignal.removeEventListener('abort', onClientAbort);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const isRedirect =
      res.status === 301 ||
      res.status === 302 ||
      res.status === 303 ||
      res.status === 307 ||
      res.status === 308;
    const location = res.headers.get('location');

    if (isRedirect && location && hop < maxRedirects) {
      if (clientSignal) {
        clientSignal.removeEventListener('abort', onClientAbort);
      }
      res.body?.cancel().catch(() => {});

      const rewritten = rewriteRedirectLocationToCompanion(location, currentUrl, companionRoot);
      currentUrl = rewritten.url;

      if (
        res.status === 303 ||
        ((res.status === 301 || res.status === 302) &&
          currentMethod !== 'GET' &&
          currentMethod !== 'HEAD')
      ) {
        currentMethod = 'GET';
        currentBody = undefined;
        delete currentHeaders['Content-Type'];
      }

      if (rewritten.routedToCompanion) {
        delete currentHeaders['Authorization'];
        delete currentHeaders['Cookie'];
      }

      continue;
    }

    return res;
  }

  throw new Error(`Exceeded maximum redirect hops (${maxRedirects}) for ${initialUrl}`);
}
