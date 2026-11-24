/**
 * YouTube Innertube Search & Autocomplete fallback.
 * Returns payloads shaped identically to Invidious /api/v1/search and
 * /api/v1/search/suggestions so both the Webapp and Android clients work
 * seamlessly whenever the upstream Invidious search pool degrades.
 */

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT_VERSION = '2.20260916.01.00';
const INNERTUBE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export interface InnertubeSearchOptions {
  q: string;
  page?: number;
  sort_by?: string;
  date?: string;
  duration?: string;
  type?: string;
  features?: string;
  region?: string;
  hl?: string;
}

const SORT_MAP: Record<string, number> = {
  rating: 1,
  upload_date: 2,
  view_count: 3,
};

const DATE_MAP: Record<string, number> = {
  hour: 1,
  today: 2,
  week: 3,
  month: 4,
  year: 5,
};

const TYPE_MAP: Record<string, number> = {
  video: 1,
  channel: 2,
  playlist: 3,
  movie: 4,
};

const DURATION_MAP: Record<string, number> = {
  short: 1,
  long: 2,
  medium: 3,
};

const FEATURE_MAP: Record<string, number> = {
  hd: 4,
  subtitles: 5,
  creative_commons: 6,
  '3d': 7,
  live: 8,
  '4k': 14,
  '360': 15,
  location: 23,
  hdr: 25,
};

function encodeVarint(field: number, val: number): number[] {
  const out = [(field << 3) | 0];
  let v = val >>> 0;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

export function encodeSearchParams({
  sort_by,
  date,
  type,
  duration,
  features,
}: Pick<InnertubeSearchOptions, 'sort_by' | 'date' | 'type' | 'duration' | 'features'>): string | undefined {
  const top: number[] = [];
  if (sort_by && SORT_MAP[sort_by]) {
    top.push(...encodeVarint(1, SORT_MAP[sort_by]));
  }

  const sub: number[] = [];
  if (date && DATE_MAP[date]) sub.push(...encodeVarint(1, DATE_MAP[date]));
  if (type && type !== 'all' && TYPE_MAP[type]) sub.push(...encodeVarint(2, TYPE_MAP[type]));
  if (duration && DURATION_MAP[duration]) sub.push(...encodeVarint(3, DURATION_MAP[duration]));
  if (features) {
    for (const f of String(features).split(',').map((s) => s.trim())) {
      if (FEATURE_MAP[f]) sub.push(...encodeVarint(FEATURE_MAP[f], 1));
    }
  }

  if (sub.length > 0) {
    top.push((2 << 3) | 2, ...encodeVarintLength(sub.length), ...sub);
  }
  return top.length > 0 ? Buffer.from(top).toString('base64') : undefined;
}

function encodeVarintLength(len: number): number[] {
  const out: number[] = [];
  let v = len >>> 0;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

const CONT_CACHE = new Map<string, { token: string; expires: number }>();
const CONT_CACHE_MAX = 200;
const CONT_TTL_MS = 15 * 60 * 1000;

function getCachedCont(key: string): string | null {
  const hit = CONT_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    CONT_CACHE.delete(key);
    return null;
  }
  return hit.token;
}

function setCachedCont(key: string, token: string) {
  if (!token) return;
  if (CONT_CACHE.has(key)) CONT_CACHE.delete(key);
  CONT_CACHE.set(key, { token, expires: Date.now() + CONT_TTL_MS });
  if (CONT_CACHE.size > CONT_CACHE_MAX) {
    const oldest = CONT_CACHE.keys().next().value;
    if (oldest) CONT_CACHE.delete(oldest);
  }
}

function normalizeUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function joinRuns(node: any): string {
  if (!node) return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r: any) => r?.text || '').join('');
  return '';
}

function parseDurationSeconds(text: string): number {
  if (!text) return 0;
  const parts = text
    .trim()
    .split(':')
    .map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

function parseHumanNumber(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/\u00a0/g, ' ').trim();
  // Abbreviated counts (English K/M/B, Vietnamese N/nghìn/Tr/triệu/T/tỷ)
  const abbrMatch = /([\d.,]+)\s*(K|M|B|N|Tr|T|nghìn|ngàn|triệu|tỷ)\b/i.exec(cleaned);
  if (abbrMatch) {
    let numStr = abbrMatch[1];
    // Handle comma decimal vs thousands separator (e.g. "8,5 Tr" -> "8.5")
    if (numStr.includes(',') && !numStr.includes('.')) {
      numStr = numStr.replace(',', '.');
    } else if (numStr.includes(',') && numStr.includes('.')) {
      numStr = numStr.replace(/,/g, '');
    }
    const base = parseFloat(numStr);
    if (Number.isNaN(base)) return 0;
    const unit = abbrMatch[2].toLowerCase();
    const mult =
      unit === 'k' || unit === 'n' || unit === 'nghìn' || unit === 'ngàn'
        ? 1_000
        : unit === 'm' || unit === 'tr' || unit === 'triệu'
          ? 1_000_000
          : 1_000_000_000;
    return Math.round(base * mult);
  }
  const digits = cleaned.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) || 0 : 0;
}

function parseRelativeTimestamp(text: string): number {
  if (!text) return 0;
  const m = /(\d+)\s+(second|minute|hour|day|week|month|year|giây|phút|giờ|ngày|tuần|tháng|năm)/i.exec(text);
  if (!m) return 0;
  const amount = parseInt(m[1], 10);
  if (!amount || Number.isNaN(amount)) return 0;
  const unit = m[2].toLowerCase();
  const unitSec =
    unit === 'second' || unit === 'giây'
      ? 1
      : unit === 'minute' || unit === 'phút'
        ? 60
        : unit === 'hour' || unit === 'giờ'
          ? 3600
          : unit === 'day' || unit === 'ngày'
            ? 86400
            : unit === 'week' || unit === 'tuần'
              ? 7 * 86400
              : unit === 'month' || unit === 'tháng'
                ? 30 * 86400
                : 365 * 86400;
  return Math.max(0, Math.floor(Date.now() / 1000) - amount * unitSec);
}

function mapVideoRenderer(v: any): any | null {
  const videoId = v?.videoId;
  if (!videoId) return null;

  const ownerRun = v.ownerText?.runs?.[0] || v.longBylineText?.runs?.[0];
  const authorId = ownerRun?.navigationEndpoint?.browseEndpoint?.browseId || '';
  const authorUrl =
    ownerRun?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ||
    (authorId ? `/channel/${authorId}` : '');

  const thumbSources = Array.isArray(v.thumbnail?.thumbnails) ? v.thumbnail.thumbnails : [];
  const videoThumbnails =
    thumbSources.length > 0
      ? thumbSources.map((t: any) => ({
          url: normalizeUrl(t.url),
          width: t.width || 0,
          height: t.height || 0,
        }))
      : [
          {
            quality: 'high',
            url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            width: 480,
            height: 360,
          },
        ];

  const rawAvatarThumbs =
    v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails || [];
  const authorThumbnails = rawAvatarThumbs.map((t: any) => ({
    url: normalizeUrl(t.url),
    width: t.width || 0,
    height: t.height || 0,
  }));

  const lengthText = joinRuns(v.lengthText);
  const viewText = joinRuns(v.viewCountText) || joinRuns(v.shortViewCountText);
  const badges = Array.isArray(v.badges) ? v.badges : [];
  const hasLiveBadge = badges.some((b: any) => {
    const label = b?.metadataBadgeRenderer?.label || '';
    const style = b?.metadataBadgeRenderer?.style || '';
    return /^live$/i.test(label) || style.includes('LIVE_NOW');
  });
  const liveNow = hasLiveBadge || (!lengthText && /watching|đang xem/i.test(viewText));

  const publishedText = joinRuns(v.publishedTimeText);
  const snippet =
    joinRuns(v.detailedMetadataSnippets?.[0]?.snippetText) || joinRuns(v.descriptionSnippet);

  return {
    type: 'video',
    videoId,
    title: joinRuns(v.title) || 'Untitled',
    author: ownerRun?.text || joinRuns(v.ownerText) || '',
    authorId,
    authorUrl,
    authorThumbnails,
    videoThumbnails,
    lengthSeconds: liveNow ? 0 : parseDurationSeconds(lengthText),
    liveNow,
    viewCount: parseHumanNumber(viewText),
    viewCountText: viewText,
    published: parseRelativeTimestamp(publishedText),
    publishedText,
    description: snippet,
  };
}

function mapChannelRenderer(c: any): any | null {
  const authorId = c?.channelId;
  if (!authorId) return null;

  const rawThumbs = Array.isArray(c.thumbnail?.thumbnails) ? c.thumbnail.thumbnails : [];
  const authorThumbnails = rawThumbs.map((t: any) => ({
    url: normalizeUrl(t.url),
    width: t.width || 0,
    height: t.height || 0,
  }));

  const fieldA = joinRuns(c.subscriberCountText);
  const fieldB = joinRuns(c.videoCountText);
  const isSubStr = (s: string) =>
    Boolean(s) && !s.startsWith('@') && /subscriber|người đăng ký/i.test(s);
  const subStr = isSubStr(fieldB)
    ? fieldB
    : isSubStr(fieldA)
      ? fieldA
      : !fieldB.startsWith('@')
        ? fieldB
        : !fieldA.startsWith('@')
          ? fieldA
          : '';
  const vidStr = [fieldA, fieldB].find((s) => s && !s.startsWith('@') && /video/i.test(s)) || '';

  return {
    type: 'channel',
    author: joinRuns(c.title) || c.channelId,
    authorId,
    authorUrl: `/channel/${authorId}`,
    authorThumbnails,
    subCount: parseHumanNumber(subStr),
    videoCount: vidStr ? parseHumanNumber(vidStr) : 0,
    description: joinRuns(c.descriptionSnippet),
  };
}

function mapLockupPlaylist(l: any): any | null {
  if (!l || l.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST' || !l.contentId) return null;
  const meta = l.metadata?.lockupMetadataViewModel;
  const title = meta?.title?.content || '';
  const firstPart = meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text;
  const author = firstPart?.content || '';
  const authorId = firstPart?.commandRuns?.[0]?.onTap?.innertubeCommand?.browseEndpoint?.browseId || '';

  const sources =
    l.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources || [];
  const playlistThumbnail = normalizeUrl(sources[sources.length - 1]?.url || sources[0]?.url || '');

  const overlays = l.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays || [];
  let videoCount = 0;
  for (const ov of overlays) {
    const badgeText = ov?.thumbnailOverlayBadgeViewModel?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel?.text;
    if (badgeText) {
      videoCount = parseHumanNumber(badgeText);
      if (videoCount > 0) break;
    }
  }

  return {
    type: 'playlist',
    playlistId: l.contentId,
    title: title || 'Playlist',
    author,
    authorId,
    playlistThumbnail,
    videoCount,
  };
}

function mapLegacyPlaylist(p: any): any | null {
  const playlistId = p?.playlistId;
  if (!playlistId) return null;
  const ownerRun = p.shortBylineText?.runs?.[0] || p.longBylineText?.runs?.[0];
  const thumbs = Array.isArray(p.thumbnails?.[0]?.thumbnails)
    ? p.thumbnails[0].thumbnails
    : Array.isArray(p.thumbnails)
      ? p.thumbnails
      : [];
  return {
    type: 'playlist',
    playlistId,
    title: joinRuns(p.title) || 'Playlist',
    author: ownerRun?.text || '',
    authorId: ownerRun?.navigationEndpoint?.browseEndpoint?.browseId || '',
    playlistThumbnail: normalizeUrl(thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || ''),
    videoCount: parseInt(String(p.videoCount || '0'), 10) || 0,
  };
}

function extractSections(
  sections: any[],
  desiredType?: string
): { items: any[]; continuation: string | null } {
  const items: any[] = [];
  let continuation: string | null = null;
  const seen = new Set<string>();

  const pushUnique = (mapped: any | null) => {
    if (!mapped) return;
    if (desiredType && desiredType !== 'all' && mapped.type !== desiredType) return;
    const key = `${mapped.type}:${mapped.videoId || mapped.playlistId || mapped.authorId}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(mapped);
  };

  for (const sec of sections) {
    if (sec?.continuationItemRenderer) {
      const tok = sec.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      if (tok) continuation = tok;
      continue;
    }
    const contents = sec?.itemSectionRenderer?.contents || [];
    for (const entry of contents) {
      if (entry?.videoRenderer) pushUnique(mapVideoRenderer(entry.videoRenderer));
      else if (entry?.channelRenderer) pushUnique(mapChannelRenderer(entry.channelRenderer));
      else if (entry?.lockupViewModel) pushUnique(mapLockupPlaylist(entry.lockupViewModel));
      else if (entry?.playlistRenderer) pushUnique(mapLegacyPlaylist(entry.playlistRenderer));
    }
  }
  return { items, continuation };
}

function resolveLocale(region?: string, explicitHl?: string): { gl: string; hl: string } {
  const raw = (region || 'VN').trim().toUpperCase();
  const gl = raw === 'GLOBAL' || raw.length !== 2 ? 'US' : raw;
  const defaultHl = gl === 'VN' ? 'vi' : gl === 'JP' ? 'ja' : gl === 'KR' ? 'ko' : 'en';
  return { gl, hl: explicitHl || defaultHl };
}

async function postInnertubeSearch(
  body: Record<string, any>,
  desiredType?: string
): Promise<{ items: any[]; continuation: string | null }> {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/search?prettyPrint=false&key=${INNERTUBE_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': INNERTUBE_UA,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) {
    throw new Error(`Innertube search failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  const initialSections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
  if (Array.isArray(initialSections)) {
    return extractSections(initialSections, desiredType);
  }
  const contSections =
    data?.onResponseReceivedCommands?.[0]?.appendContinuationItemsAction?.continuationItems;
  if (Array.isArray(contSections)) {
    return extractSections(contSections, desiredType);
  }
  return { items: [], continuation: null };
}

export async function searchInnertube(options: InnertubeSearchOptions): Promise<any[]> {
  const query = (options.q || '').trim();
  if (!query) return [];

  const targetPage = Math.max(1, Math.min(options.page || 1, 5));
  const { gl, hl } = resolveLocale(options.region, options.hl);
  const encodedParams = encodeSearchParams(options);
  const desiredType = options.type && options.type !== 'all' ? options.type : undefined;

  const baseKey = [
    query,
    options.sort_by || '',
    options.date || '',
    options.duration || '',
    desiredType || 'all',
    options.features || '',
    gl,
    hl,
  ].join('|');

  const clientCtx = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: INNERTUBE_CLIENT_VERSION,
        hl,
        gl,
      },
    },
  };

  if (targetPage === 1) {
    const reqBody: Record<string, any> = { ...clientCtx, query };
    if (encodedParams) reqBody.params = encodedParams;
    const { items, continuation } = await postInnertubeSearch(reqBody, desiredType);
    if (continuation) setCachedCont(`${baseKey}|p1`, continuation);
    return items;
  }

  // Find highest cached continuation below targetPage
  let currentPage = 0;
  let token: string | null = null;
  for (let p = targetPage - 1; p >= 1; p--) {
    const cached = getCachedCont(`${baseKey}|p${p}`);
    if (cached) {
      currentPage = p;
      token = cached;
      break;
    }
  }

  let items: any[] = [];
  if (!token) {
    const reqBody: Record<string, any> = { ...clientCtx, query };
    if (encodedParams) reqBody.params = encodedParams;
    const first = await postInnertubeSearch(reqBody, desiredType);
    currentPage = 1;
    token = first.continuation;
    if (token) setCachedCont(`${baseKey}|p1`, token);
    if (!token) return [];
  }

  while (currentPage < targetPage && token) {
    const reqBody: Record<string, any> = { ...clientCtx, continuation: token };
    const next = await postInnertubeSearch(reqBody, desiredType);
    currentPage += 1;
    items = next.items;
    token = next.continuation;
    if (token) setCachedCont(`${baseKey}|p${currentPage}`, token);
  }

  return currentPage === targetPage ? items : [];
}

export async function fetchInnertubeSuggestions(
  query: string,
  hl?: string,
  gl?: string
): Promise<{ query: string; suggestions: string[] }> {
  const q = query.trim();
  if (!q) return { query, suggestions: [] };

  const url = new URL('https://suggestqueries.google.com/complete/search');
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('ds', 'yt');
  url.searchParams.set('q', q);
  if (hl) url.searchParams.set('hl', hl);
  if (gl) url.searchParams.set('gl', gl);

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': INNERTUBE_UA },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    throw new Error(`Suggest failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  const list = Array.isArray(data?.[1]) ? data[1].filter((s: unknown) => typeof s === 'string') : [];
  return { query: q, suggestions: list };
}
