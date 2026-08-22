import { NextRequest, NextResponse } from 'next/server';

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

async function handleProxy(req: NextRequest, pathParts: string[]) {
  const instance =
    process.env.INVIDIOUS_URL ||
    process.env.NEXT_PUBLIC_INVIDIOUS_URL ||
    'http://kvtube-invidious:3000';
  const subPath = '/' + (pathParts || []).join('/');
  const targetUrl = new URL(subPath, instance);

  req.nextUrl.searchParams.forEach((val, key) => {
    targetUrl.searchParams.set(key, val);
  });

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KV-Tube',
  };

  const range = req.headers.get('range');
  if (range) headers['Range'] = range;

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
    if (customToken.startsWith('{')) {
      headers['Authorization'] = `Bearer ${customToken}`;
    } else {
      headers['Cookie'] = `SID=${customToken}`;
    }
  } else if (defaultToken) {
    if (defaultToken.startsWith('{')) {
      headers['Authorization'] = `Bearer ${defaultToken}`;
    } else {
      headers['Cookie'] = `SID=${defaultToken}`;
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

  try {
    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
      // @ts-ignore
      duplex: 'half',
    });

    const upstreamContentType = res.headers.get('content-type') || '';
    const isMedia =
      upstreamContentType.startsWith('video/') ||
      upstreamContentType.startsWith('audio/') ||
      !!req.headers.get('range');

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

    // Media streams must be streamed through untouched (range support, low memory).
    if (isMedia) {
      const len = res.headers.get('content-length');
      if (len) responseHeaders.set('content-length', len);
      return new NextResponse(res.body, {
        status: res.status,
        headers: responseHeaders,
      });
    }

    // JSON / other small payloads are buffered so the client always receives a
    // complete body with a correct content-length (blind streaming can drop
    // trailing bytes, producing truncated JSON in the browser).
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Proxy request failed' }, { status: 502 });
  }
}
