import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080';

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get('v');
    
    if (!videoId) {
        return NextResponse.json({ error: 'No video ID' }, { status: 400 });
    }

    try {
        const res = await fetch(`${API_BASE}/api/formats?v=${encodeURIComponent(videoId)}`, {
            cache: 'no-store',
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch formats' }, { status: 500 });
        }
        
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch formats' }, { status: 500 });
    }
}
