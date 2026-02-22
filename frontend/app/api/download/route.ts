import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080';

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get('v');
    const formatId = request.nextUrl.searchParams.get('f');

    if (!videoId) {
        return NextResponse.json({ error: 'No video ID' }, { status: 400 });
    }

    try {
        const url = `${API_BASE}/api/download?v=${encodeURIComponent(videoId)}${formatId ? `&f=${encodeURIComponent(formatId)}` : ''}`;
        const res = await fetch(url, {
            cache: 'no-store',
        });

        const data = await res.json();

        if (!res.ok) {
            return NextResponse.json({ error: data.error || 'Download failed' }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to get download link' }, { status: 500 });
    }
}
