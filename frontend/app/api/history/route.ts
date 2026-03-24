import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { video_id, title, thumbnail } = body;

        if (!video_id) {
            return NextResponse.json({ error: 'No video ID' }, { status: 400 });
        }

        const res = await fetch(`${API_BASE}/api/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id,
                title: title || `Video ${video_id}`,
                thumbnail: thumbnail || `https://i.ytimg.com/vi/${video_id}/maxresdefault.jpg`,
            }),
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to record history' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('API /api/history POST error:', error);
        return NextResponse.json({ error: 'Failed to record history' }, { status: 500 });
    }
}
