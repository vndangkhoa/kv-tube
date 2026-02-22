import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const fileUrl = request.nextUrl.searchParams.get('url');
    
    if (!fileUrl) {
        return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    try {
        const res = await fetch(fileUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch file' }, { status: res.status });
        }
        
        const contentType = res.headers.get('content-type') || 'application/octet-stream';
        const contentLength = res.headers.get('content-length');
        
        const headers: HeadersInit = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
        };
        
        if (contentLength) {
            headers['Content-Length'] = contentLength;
        }
        
        return new NextResponse(res.body, {
            status: 200,
            headers,
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 });
    }
}
