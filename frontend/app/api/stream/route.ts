import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get('v');
    
    if (!videoId) {
        return NextResponse.json({ error: 'No video ID' }, { status: 400 });
    }

    try {
        const res = await fetch(`http://127.0.0.1:8080/api/get_stream_info?v=${videoId}`, {
            cache: 'no-store',
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
        }
        
        const data = await res.json();
        const streamUrl = data.original_url || data.stream_url;
        const proxyUrl = streamUrl ? `/api/proxy-stream?url=${encodeURIComponent(streamUrl)}` : null;
        
        return NextResponse.json({ 
            streamUrl: proxyUrl,
            title: data.title,
            thumbnail: data.thumbnail
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch stream' }, { status: 500 });
    }
}
