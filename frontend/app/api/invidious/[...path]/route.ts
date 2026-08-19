import { NextRequest, NextResponse } from 'next/server';

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

async function handleProxy(req: NextRequest, pathParts: string[]) {
  const instance = process.env.INVIDIOUS_URL || 'https://yt.khoavo.myds.me';
  const subPath = '/' + (pathParts || []).join('/');
  const targetUrl = new URL(subPath, instance);

  req.nextUrl.searchParams.forEach((val, key) => {
    targetUrl.searchParams.set(key, val);
  });

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KV-Tube',
    Accept: 'application/json',
  };

  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const customCookie = req.headers.get('x-invidious-cookie');
  const customToken = req.headers.get('x-invidious-token');

  if (customCookie) {
    headers['Cookie'] = customCookie;
  } else if (customToken) {
    if (customToken.startsWith('{')) {
      headers['Authorization'] = `Bearer ${customToken}`;
    } else {
      headers['Cookie'] = `SID=${customToken}`;
    }
  }

  let body: string | undefined = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await req.text();
      headers['Content-Type'] = req.headers.get('content-type') || 'application/json';
    } catch {}
  }

  try {
    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Proxy request failed' }, { status: 502 });
  }
}
