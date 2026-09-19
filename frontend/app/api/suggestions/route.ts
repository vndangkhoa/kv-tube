import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface VideoSuggestionItem {
  id: string;
  title: string;
  thumbnail: string;
  uploader?: string;
  channelTitle?: string;
  channel_id?: string;
  channelId?: string;
  duration?: string;
  view_count?: number;
  viewCount?: number;
  upload_date?: string;
  publishedAt?: string;
}

export async function GET(req: NextRequest) {
  const seedsParam = req.nextUrl.searchParams.get('seeds') || '';
  const excludeParam = req.nextUrl.searchParams.get('exclude') || '';
  const limitParam = req.nextUrl.searchParams.get('limit') || '12';

  const seeds = seedsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const exclude = excludeParam
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const limit = Math.min(Math.max(parseInt(limitParam, 10) || 12, 1), 30);

  return handleSuggestions(seeds, exclude, limit);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const seeds: string[] = Array.isArray(body.seeds) ? body.seeds.filter(Boolean) : [];
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude.filter(Boolean) : [];
    const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 30);

    return handleSuggestions(seeds, exclude, limit);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

async function handleSuggestions(seeds: string[], exclude: string[], limit: number) {
  const excludeSet = new Set<string>([...exclude, ...seeds]);

  // 1. Try Go backend first
  const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8080';
  try {
    const query = new URLSearchParams();
    if (seeds.length > 0) query.set('seeds', seeds.join(','));
    if (exclude.length > 0) query.set('exclude', exclude.join(','));
    query.set('limit', String(limit));

    const backendRes = await fetch(`${backendUrl}/api/suggestions?${query.toString()}`, {
      headers: { 'User-Agent': 'KV-Tube-Frontend' },
      signal: AbortSignal.timeout(3500),
    });

    if (backendRes.ok) {
      const data = await backendRes.json();
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json({
          suggestions: data,
          source: 'backend',
        });
      }
    }
  } catch {
    // Backend unavailable or timed out; proceed to fallback
  }

  // 2. Fallback: Query Invidious API for related videos across seeds
  if (seeds.length === 0) {
    return NextResponse.json({ suggestions: [], source: 'empty' });
  }

  const invidiousUrl = process.env.INVIDIOUS_URL || 'http://invidious:3000';
  const effectiveSeeds = seeds.slice(0, 3);

  try {
    const pools: VideoSuggestionItem[][] = await Promise.all(
      effectiveSeeds.map(async (seedId) => {
        try {
          const res = await fetch(`${invidiousUrl}/api/v1/videos/${encodeURIComponent(seedId)}`, {
            signal: AbortSignal.timeout(3000),
          });
          if (!res.ok) return [];
          const videoData = await res.json();
          const recommended = videoData.recommendedVideos || [];
          return recommended.map((r: any) => ({
            id: r.videoId,
            title: r.title || 'Untitled',
            thumbnail: r.videoId
              ? `https://i.ytimg.com/vi_webp/${r.videoId}/hq720.webp`
              : r.videoThumbnails?.[0]?.url || '',
            uploader: r.author || 'Creator',
            channelTitle: r.author || 'Creator',
            channel_id: r.authorId || '',
            channelId: r.authorId || '',
            duration: r.lengthSeconds
              ? `${Math.floor(r.lengthSeconds / 60)}:${(r.lengthSeconds % 60).toString().padStart(2, '0')}`
              : '',
            view_count: r.viewCount ?? 0,
            viewCount: r.viewCount ?? 0,
          }));
        } catch {
          return [];
        }
      })
    );

    // Round-robin interleaving
    const seen = new Set<string>(excludeSet);
    const interleaved: VideoSuggestionItem[] = [];
    const maxDepth = 12;

    for (let depth = 0; depth < maxDepth; depth++) {
      for (const pool of pools) {
        if (depth < pool.length) {
          const item = pool[depth];
          if (item?.id && !seen.has(item.id)) {
            seen.add(item.id);
            interleaved.push(item);
            if (interleaved.length >= limit) {
              return NextResponse.json({
                suggestions: interleaved,
                source: 'invidious-fallback',
              });
            }
          }
        }
      }
    }

    return NextResponse.json({
      suggestions: interleaved,
      source: 'invidious-fallback',
    });
  } catch (err) {
    console.warn('[api/suggestions] Fallback failed:', err);
    return NextResponse.json({ suggestions: [], source: 'error' }, { status: 500 });
  }
}
