'use client';

import Link from 'next/link';
import Image from 'next/image';
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
    list_id?: string;
    is_mix?: boolean;
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

import { memo } from 'react';

function VideoCard({ video, hideChannelAvatar }: { video: VideoData; hideChannelAvatar?: boolean }) {
    const relativeTime = video.uploaded_date || getRelativeTime(video.id);
    const [isNavigating, setIsNavigating] = useState(false);
    const destination = video.list_id ? `/watch?v=${video.id}&list=${video.list_id}` : `/watch?v=${video.id}`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginBottom: '12px' }} className="videocard-container">
            <Link
                href={destination}
                onClick={() => setIsNavigating(true)}
                style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '12px' }}
            >
                <Image
                    src={video.thumbnail}
                    alt={video.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    style={{ objectFit: 'cover', backgroundColor: 'var(--yt-hover)' }}
                    className="videocard-thumb"
                    priority={false}
                    onError={(e) => {
                        e.target.onError = null; // Prevent infinite loop
                        e.target.src = 'https://i.ytimg.com/vi/default/hqdefault.jpg'; // Fallback to YouTube's default thumbnail
                    }}
                />
                {video.duration && !video.is_mix && (
                    <div className="duration-badge" style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
                        {video.duration}
                    </div>
                )}
                
                {video.is_mix && (
                    <div style={{
                        position: 'absolute', bottom: 0, right: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white',
                        padding: '4px 8px', fontSize: '12px', fontWeight: 500,
                        borderTopLeftRadius: '8px', zIndex: 5,
                        display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 7H2v1h20V7zm-9 5H2v-1h11v1zm0 4H2v-1h11v1zm2 3v-8l7 4-7 4z"></path></svg>
                        Mix
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
                    <Link href={destination} style={{ textDecoration: 'none' }}>
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

export default memo(VideoCard);
