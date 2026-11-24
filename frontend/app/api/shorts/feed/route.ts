import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

const REGION_HL_MAP: Record<string, { hl: string; gl: string; acceptLang: string }> = {
  VN: { hl: 'vi', gl: 'VN', acceptLang: 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' },
  US: { hl: 'en', gl: 'US', acceptLang: 'en-US,en;q=0.9' },
  JP: { hl: 'ja', gl: 'JP', acceptLang: 'ja-JP,ja;q=0.9,en-US;q=0.8' },
  KR: { hl: 'ko', gl: 'KR', acceptLang: 'ko-KR,ko;q=0.9,en-US;q=0.8' },
  GLOBAL: { hl: 'en', gl: 'US', acceptLang: 'en-US,en;q=0.9' },
};

const FEED_FRESH_MS = 3 * 60_000;
const FEED_STALE_MS = 15 * 60_000;

interface CachedFeedEntry {
  payload: { shorts: any[]; continuation: string | null };
  freshUntil: number;
  staleUntil: number;
}

const SHORTS_FEED_CACHE = new Map<string, CachedFeedEntry>();
const SHORTS_FEED_INFLIGHT = new Map<string, Promise<CachedFeedEntry['payload']>>();
const SHORTS_FEED_BG_REFRESHING = new Set<string>();

interface SequenceResult {
  ids: string[];
  thumbs: Map<string, string>;
  nextContinuation: string | null;
}

async function fetchSequenceBatch(
  sequenceParams: string,
  config: { hl: string; gl: string },
  userAgent: string
): Promise<SequenceResult> {
  const ids: string[] = [];
  const thumbs = new Map<string, string>();
  let nextContinuation: string | null = null;

  const seqRes = await fetch(
    `https://www.youtube.com/youtubei/v1/reel/reel_watch_sequence?prettyPrint=false&key=${INNERTUBE_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20260916.01.00',
            hl: config.hl,
            gl: config.gl,
          },
        },
        sequenceParams,
      }),
    }
  );

  if (seqRes.ok) {
    const seqData = await seqRes.json();
    const entries = seqData.entries || [];
    for (const entry of entries) {
      const ep = entry?.command?.reelWatchEndpoint;
      const vid = ep?.videoId;
      if (!vid) continue;
      ids.push(vid);
      const thumbUrl = ep?.thumbnail?.thumbnails?.[0]?.url;
      if (thumbUrl && !thumbs.has(vid)) {
        thumbs.set(vid, thumbUrl);
      }
    }
    nextContinuation =
      seqData.continuationEndpoint?.continuationCommand?.token || null;
  }

  return { ids, thumbs, nextContinuation };
}

async function fetchFeedBatchPayload(
  regionKey: string,
  continuation: string | null,
  config: { hl: string; gl: string; acceptLang: string },
  userAgent: string
): Promise<CachedFeedEntry['payload']> {
  const videoIds: string[] = [];
  const nativeThumbMap = new Map<string, string>();
  let nextContinuation: string | null = null;

  if (continuation) {
    const batch = await fetchSequenceBatch(continuation, config, userAgent);
    videoIds.push(...batch.ids);
    batch.thumbs.forEach((url, id) => nativeThumbMap.set(id, url));
    nextContinuation = batch.nextContinuation;
  } else {
    // First page: fetch initial shorts page and extract sequence continuation
    const initRes = await fetch('https://www.youtube.com/shorts', {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': config.acceptLang,
      },
    });

    if (initRes.ok) {
      const html = await initRes.text();
      const match = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/);
      if (match) {
        const data = JSON.parse(match[1]);
        const firstEp = data.replacementEndpoint?.reelWatchEndpoint;
        const firstVideoId = firstEp?.videoId;
        const firstThumb = firstEp?.thumbnail?.thumbnails?.[0]?.url;
        const seqContinuation = data.sequenceContinuation;

        if (firstVideoId) {
          videoIds.push(firstVideoId);
          if (firstThumb) nativeThumbMap.set(firstVideoId, firstThumb);
        }

        if (seqContinuation) {
          const batch = await fetchSequenceBatch(seqContinuation, config, userAgent);
          videoIds.push(...batch.ids);
          batch.thumbs.forEach((url, id) => {
            if (!nativeThumbMap.has(id)) nativeThumbMap.set(id, url);
          });
          nextContinuation = batch.nextContinuation;
        }
      }
    }

    // Ensure at least 10 unique Shorts so the Home Shorts Shelf has a full expanded row
    if (new Set(videoIds).size < 10 && nextContinuation) {
      const extra = await fetchSequenceBatch(nextContinuation, config, userAgent);
      videoIds.push(...extra.ids);
      extra.thumbs.forEach((url, id) => {
        if (!nativeThumbMap.has(id)) nativeThumbMap.set(id, url);
      });
      nextContinuation = extra.nextContinuation;
    }
  }

  const uniqueIds = Array.from(new Set(videoIds));
  if (uniqueIds.length === 0) {
    return { shorts: [], continuation: null };
  }

  const shortsMetadata = await Promise.all(
    uniqueIds.map(async (id) => {
      const nativeThumb = nativeThumbMap.get(id);
      const primaryThumb = nativeThumb || `https://i.ytimg.com/vi/${id}/frame0.jpg`;
      const fallbackThumb = nativeThumb
        ? `https://i.ytimg.com/vi/${id}/frame0.jpg`
        : `https://i.ytimg.com/vi/${id}/hq720.jpg`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);

        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/${id}&format=json`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);

        let title = 'YouTube Short';
        let uploader = '';
        let channelId = '';

        if (oembedRes.ok) {
          const data = await oembedRes.json();
          title = data.title || title;
          uploader = data.author_name || uploader;
          if (data.author_url) {
            const matchHandle = data.author_url.match(/@([^/?#]+)/);
            if (matchHandle) {
              channelId = `@${matchHandle[1]}`;
            }
          }
        }

        const avatarUrl = channelId
          ? `/api/channel-avatar?id=${encodeURIComponent(channelId)}`
          : uploader
          ? `/api/channel-avatar?id=@${encodeURIComponent(uploader)}`
          : undefined;

        return {
          id,
          title,
          uploader,
          channelId,
          channelAvatar: avatarUrl,
          thumbnail: primaryThumb,
          fallbackThumbnail: fallbackThumb,
          view_count: undefined,
          lengthSeconds: 30,
          commentCount: undefined,
        };
      } catch {
        return {
          id,
          title: 'YouTube Short',
          uploader: '',
          channelId: '',
          channelAvatar: undefined,
          thumbnail: primaryThumb,
          fallbackThumbnail: fallbackThumb,
          view_count: undefined,
          lengthSeconds: 30,
          commentCount: undefined,
        };
      }
    })
  );

  const payload = { shorts: shortsMetadata, continuation: nextContinuation };
  if (!continuation && payload.shorts.length > 0) {
    const now = Date.now();
    SHORTS_FEED_CACHE.set(regionKey, {
      payload,
      freshUntil: now + FEED_FRESH_MS,
      staleUntil: now + FEED_STALE_MS,
    });
  }
  return payload;
}

function getOrLoadInitialFeed(
  regionKey: string,
  config: { hl: string; gl: string; acceptLang: string },
  userAgent: string
): Promise<CachedFeedEntry['payload']> {
  const existing = SHORTS_FEED_INFLIGHT.get(regionKey);
  if (existing) return existing;
  const promise = fetchFeedBatchPayload(regionKey, null, config, userAgent).finally(() => {
    SHORTS_FEED_INFLIGHT.delete(regionKey);
  });
  SHORTS_FEED_INFLIGHT.set(regionKey, promise);
  return promise;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const regionKey = (searchParams.get('region') || 'VN').toUpperCase();
  const continuation = searchParams.get('continuation');
  const config = REGION_HL_MAP[regionKey] || REGION_HL_MAP.VN;

  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

  try {
    if (!continuation) {
      const cached = SHORTS_FEED_CACHE.get(regionKey);
      const now = Date.now();
      if (cached && now < cached.staleUntil) {
        const isFresh = now < cached.freshUntil;
        if (!isFresh && !SHORTS_FEED_BG_REFRESHING.has(regionKey)) {
          SHORTS_FEED_BG_REFRESHING.add(regionKey);
          getOrLoadInitialFeed(regionKey, config, userAgent)
            .catch(() => {})
            .finally(() => SHORTS_FEED_BG_REFRESHING.delete(regionKey));
        }
        return NextResponse.json(cached.payload, {
          headers: {
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
            'x-kv-cache': isFresh ? 'HIT' : 'STALE',
          },
        });
      }

      const payload = await getOrLoadInitialFeed(regionKey, config, userAgent);
      return NextResponse.json(payload, {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
          'x-kv-cache': 'MISS',
        },
      });
    }

    const payload = await fetchFeedBatchPayload(regionKey, continuation, config, userAgent);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[Shorts Feed API Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch shorts feed', shorts: [], continuation: null },
      { status: 500 }
    );
  }
}
