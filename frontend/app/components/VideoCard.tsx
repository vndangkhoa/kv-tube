'use client';

import Link from 'next/link';
import { useState } from 'react';

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    channel_id?: string;
    thumbnail: string;
    view_count: number;
    duration: string;
    uploaded_date?: string;
}

function formatViews(views: number): string {
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

function getRelativeTime(id: string): string {
    const times = ['2 hours ago', '5 hours ago', '1 day ago', '3 days ago', '1 week ago', '2 weeks ago', '1 month ago'];
    const index = (id.charCodeAt(0) || 0) % times.length;
    return times[index];
}

export default function VideoCard({ video, hideChannelAvatar }: { video: VideoData; hideChannelAvatar?: boolean }) {
    const relativeTime = video.uploaded_date || getRelativeTime(video.id);
    const [isNavigating, setIsNavigating] = useState(false);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginBottom: '12px' }} className="videocard-container">
            <Link
                href={`/watch?v=${video.id}`}
                onClick={() => setIsNavigating(true)}
                style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '12px' }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={video.thumbnail}
                    alt={video.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: 'var(--yt-hover)' }}
                    className="videocard-thumb"
                />
                {video.duration && (
                    <div className="duration-badge" style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
                        {video.duration}
                    </div>
                )}

                {isNavigating && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 10
                    }}>
                        <div style={{
                            width: '40px', height: '40px',
                            border: '3px solid rgba(255,255,255,0.3)',
                            borderTopColor: '#fff',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }} />
                    </div>
                )}
            </Link>

            <div style={{ display: 'flex', gap: '12px', padding: '0 12px' }} className="videocard-info">
                {/* Video Info */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <Link href={`/watch?v=${video.id}`} style={{ textDecoration: 'none' }}>
                        <h3 className="truncate-2-lines" style={{ fontSize: '16px', fontWeight: 500, lineHeight: '22px', margin: 0, color: 'var(--yt-text-primary)', transition: 'color 0.2s' }}>
                            {video.title}
                        </h3>
                    </Link>
                    <div style={{ marginTop: '4px' }}>
                        {video.channel_id ? (
                            <Link href={`/channel/${video.channel_id}`} style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', display: 'block', textDecoration: 'none', transition: 'color 0.2s' }} className="channel-link-hover">
                                {video.uploader}
                            </Link>
                        ) : (
                            <div style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', display: 'block' }}>
                                {video.uploader}
                            </div>
                        )}
                        <div style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', marginTop: '2px' }}>
                            {formatViews(video.view_count)} views • {relativeTime}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
