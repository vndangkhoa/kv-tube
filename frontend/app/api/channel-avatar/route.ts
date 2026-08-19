import { NextRequest, NextResponse } from 'next/server';

const avatarCache = new Map<string, { buffer: ArrayBuffer; contentType: string; timestamp: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

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
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      },
    });
  }

  const instance = process.env.INVIDIOUS_URL || 'https://yt.khoavo.myds.me';

  try {
    // 2. Fetch channel metadata from Invidious
    const channelRes = await fetch(`${instance}/api/v1/channels/${encodeURIComponent(channelId)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KV-Tube',
        Accept: 'application/json',
      },
      next: { revalidate: 86400 },
    });

    if (!channelRes.ok) {
      return fallbackSvg(channelId);
    }

    const data = await channelRes.json();
    const thumbs = data.authorThumbnails;
    let targetUrl: string | undefined = undefined;

    if (Array.isArray(thumbs) && thumbs.length > 0) {
      // Find ~100px or ~176px thumbnail or the highest resolution available
      const medium = thumbs.find((t: any) => t.width >= 76 && t.width <= 176);
      targetUrl = medium?.url || thumbs[thumbs.length - 1]?.url || thumbs[0]?.url;
    } else if (data.authorThumbnail) {
      targetUrl = data.authorThumbnail;
    }

    if (!targetUrl) {
      return fallbackSvg(channelId, data.author);
    }

    if (targetUrl.startsWith('//')) {
      targetUrl = 'https:' + targetUrl;
    }

    // 3. Fetch avatar image
    const imgRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!imgRes.ok) {
      return fallbackSvg(channelId, data.author);
    }

    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

    // Store in memory cache
    avatarCache.set(channelId, {
      buffer,
      contentType,
      timestamp: Date.now(),
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      },
    });
  } catch (err) {
    return fallbackSvg(channelId);
  }
}

function fallbackSvg(channelId: string, authorName?: string) {
  const initial = (authorName || channelId).charAt(0).toUpperCase() || 'C';
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
