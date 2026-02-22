import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080';

export async function GET(request: NextRequest) {
    const channelId = request.nextUrl.searchParams.get('channel_id');
    
    if (!channelId) {
        return NextResponse.json({ error: 'No channel ID' }, { status: 400 });
    }

    try {
        const res = await fetch(`${API_BASE}/api/subscribe?channel_id=${encodeURIComponent(channelId)}`, {
            cache: 'no-store',
        });
        
        if (!res.ok) {
            return NextResponse.json({ subscribed: false });
        }
        
        const data = await res.json();
        return NextResponse.json({ subscribed: data.subscribed || false });
    } catch (error) {
        return NextResponse.json({ subscribed: false });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { channel_id, channel_name } = body;
        
        if (!channel_id) {
            return NextResponse.json({ error: 'No channel ID' }, { status: 400 });
        }

        const res = await fetch(`${API_BASE}/api/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channel_id,
                channel_name: channel_name || channel_id,
            }),
            cache: 'no-store',
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
        }
        
        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const channelId = request.nextUrl.searchParams.get('channel_id');
    
    if (!channelId) {
        return NextResponse.json({ error: 'No channel ID' }, { status: 400 });
    }

    try {
        const res = await fetch(`${API_BASE}/api/subscribe?channel_id=${encodeURIComponent(channelId)}`, {
            method: 'DELETE',
            cache: 'no-store',
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
    }
}
