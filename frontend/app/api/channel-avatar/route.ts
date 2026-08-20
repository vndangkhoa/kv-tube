import { NextRequest, NextResponse } from 'next/server';

const avatarCache = new Map<string, { buffer: ArrayBuffer; contentType: string; timestamp: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in memory

const INVIDIOUS_FALLBACKS = [
  process.env.INVIDIOUS_URL,
  'https://yt.khoavo.myds.me',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.privacydev.net',
].filter(Boolean) as string[];

async function resolveAvatarUrl(channelId: string): Promise<string | null> {
  const cleanId = channelId.trim();
  if (!cleanId) return null;

  // 1. Try direct YouTube channel page (extract official yt3.googleusercontent.com / yt3.ggpht.com avatar)
  try {
    const ytUrl = cleanId.startsWith('UC')
      ? `https://www.youtube.com/channel/${encodeURIComponent(cleanId)}`
      : `https://www.youtube.com/@${encodeURIComponent(cleanId.replace(/^@/, ''))}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(ytUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const m =
        html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
        html.match(/<link\s+rel="image_src"\s+href="([^"]+)"/i) ||
        html.match(/https:\/\/yt3\.(?:googleusercontent\.com|ggpht\.com)\/[^"'\s\\<>]+/);

      if (m) {
        let raw = m[1] || m[0];
        if (raw && raw.startsWith('http')) {
          // Normalize to s176 for crisp, fast avatar
          if (raw.includes('=s')) {
            raw = raw.replace(/=s\d+-/, '=s176-');
          }
          return raw;
        }
      }
    }
  } catch {}

  // 2. Try Invidious channel API with multi-node resilient fallback
  for (const base of INVIDIOUS_FALLBACKS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${base}/api/v1/channels/${encodeURIComponent(cleanId)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KV-Tube',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const thumbs = data.authorThumbnails;
        if (Array.isArray(thumbs) && thumbs.length > 0) {
          const medium = thumbs.find((t: any) => t.width >= 76 && t.width <= 176);
          const u = medium?.url || thumbs[thumbs.length - 1]?.url || thumbs[0]?.url;
          if (u) return u.startsWith('//') ? 'https:' + u : u;
        } else if (data.authorThumbnail) {
          const u = data.authorThumbnail;
          return u.startsWith('//') ? 'https:' + u : u;
        }
      }
    } catch {}
  }

  return null;
}

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get('id') || req.nextUrl.searchParams.get('channelId');

  if (!channelId) {
    return new NextResponse('Missing id parameter', { status: 400 });
  }

  // 1. Check in-memory cache
  const cached = avatarCache.get(channelId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return new NextResponse(cached.buffer, {
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=5184000',
      },
    });
  }

  try {
    const targetUrl = await resolveAvatarUrl(channelId);

    if (targetUrl) {
      const imgRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

        avatarCache.set(channelId, {
          buffer,
          contentType,
          timestamp: Date.now(),
        });

        return new NextResponse(buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=5184000',
          },
        });
      }
    }
  } catch {}

  // Fallback to SVG letter avatar
  return fallbackSvg(channelId);
}

function fallbackSvg(channelId: string, authorName?: string) {
  const initial = (authorName || channelId).replace(/^UC/, '').charAt(0).toUpperCase() || 'C';
  const colors = ['#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab', '#1e88e5', '#039be5', '#00acc1', '#00897b', '#43a047'];
  const charCode = initial.charCodeAt(0) || 0;
  const color = colors[charCode % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <circle cx="40" cy="40" r="40" fill="${color}"/>
    <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${initial}</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
