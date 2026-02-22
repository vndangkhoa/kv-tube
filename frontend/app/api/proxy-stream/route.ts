import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    
    if (!url) {
        return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    try {
        const res = await fetch(decodeURIComponent(url), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.youtube.com/',
            },
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
        }

        const contentType = res.headers.get('content-type') || 'video/mp4';
        const contentLength = res.headers.get('content-length');
        
        const headers = new Headers({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600',
        });
        
        if (contentLength) {
            headers.set('Content-Length', contentLength);
        }

        return new NextResponse(res.body, {
            status: 200,
            headers,
        });
    } catch (error) {
        return NextResponse.json({ error: 'Proxy failed' }, { status: 500 });
    }
}
