import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080';

export async function GET(request: NextRequest) {
    const videoId = request.nextUrl.searchParams.get('v');
    const formatId = request.nextUrl.searchParams.get('f');

    if (!videoId) {
        return NextResponse.json({ error: 'No video ID' }, { status: 400 });
    }

    try {
        const url = `${API_BASE}/api/download-file?v=${encodeURIComponent(videoId)}${formatId ? `&f=${encodeURIComponent(formatId)}` : ''}`;
        const res = await fetch(url, {
            cache: 'no-store',
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return NextResponse.json({ error: data.error || 'Download failed' }, { status: res.status });
        }

        // Stream the file directly
        const headers = new Headers();
        const contentType = res.headers.get('content-type');
        const contentDisposition = res.headers.get('content-disposition');
        
        if (contentType) headers.set('content-type', contentType);
        if (contentDisposition) headers.set('content-disposition', contentDisposition);
        
        return new NextResponse(res.body, {
            status: res.status,
            headers,
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to get download link' }, { status: 500 });
    }
}
