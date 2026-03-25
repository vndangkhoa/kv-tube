'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

const DEFAULT_THUMBNAIL = 'https://i.ytimg.com/vi/default/hqdefault.jpg';

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    thumbnail: string;
    view_count: number;
    duration: string;
    uploaded_date?: string;
}

interface Subscription {
    id: number;
    channel_id: string;
    channel_name: string;
    channel_avatar: string;
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

function HistoryVideoCard({ video }: { video: VideoData }) {
    const relativeTime = video.uploaded_date || getRelativeTime(video.id);
    const destination = `/watch?v=${video.id}`;
    const thumbnailSrc = video.thumbnail || DEFAULT_THUMBNAIL;

    const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.target as HTMLImageElement;
        if (img.src !== DEFAULT_THUMBNAIL) {
            img.src = DEFAULT_THUMBNAIL;
        }
    }, []);

    return (
        <Link
            href={destination}
            className="videocard-container card-hover-lift"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                borderRadius: '12px',
                overflow: 'hidden',
            }}
        >
            <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden' }}>
                <img
                    src={thumbnailSrc}
                    alt={video.title}
                    className="videocard-thumb"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={handleImageError}
                />
                {video.duration && (
                    <div className="duration-badge">{video.duration}</div>
                )}
            </div>
            <div className="videocard-info" style={{ padding: '0 4px' }}>
                <h3 style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    lineHeight: '20px',
                    color: 'var(--yt-text-primary)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    marginBottom: '4px',
                }}>
                    {video.title}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                    {video.uploader}
                </p>
                {video.view_count > 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                        {formatViews(video.view_count)} views
                    </p>
                )}
            </div>
        </Link>
    );
}

function SubscriptionCard({ subscription }: { subscription: Subscription }) {
    return (
        <Link
            href={`/channel/${subscription.channel_id}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: 'var(--yt-hover)',
                minWidth: '120px',
                transition: 'background-color 0.2s',
                textDecoration: 'none',
            }}
            className="card-hover-lift"
        >
            <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--yt-avatar-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                color: '#fff',
                fontWeight: '600',
            }}>
                {subscription.channel_avatar || (subscription.channel_name ? subscription.channel_name[0].toUpperCase() : '?')}
            </div>
            <span style={{
                fontSize: '14px',
                fontWeight: '500',
                color: 'var(--yt-text-primary)',
                textAlign: 'center',
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {subscription.channel_name || subscription.channel_id}
            </span>
        </Link>
    );
}

export default function LibraryPage() {
    const [history, setHistory] = useState<VideoData[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [historyRes, subsRes] = await Promise.all([
                    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/history?limit=20`, { cache: 'no-store' }),
                    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/subscriptions`, { cache: 'no-store' })
                ]);

                const historyData = await historyRes.json();
                const subsData = await subsRes.json();

                setHistory(Array.isArray(historyData) ? historyData : []);
                setSubscriptions(Array.isArray(subsData) ? subsData : []);
            } catch (err) {
                console.error('Failed to fetch library data:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading) {
        return (
            <div style={{ padding: '48px', textAlign: 'center' }}>
                <div style={{ 
                    width: '40px', height: '40px', 
                    border: '3px solid var(--yt-border)', 
                    borderTopColor: 'var(--yt-brand-red)', 
                    borderRadius: '50%', 
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto'
                }}></div>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
            {subscriptions.length > 0 && (
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>
                        Subscriptions
                    </h2>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {subscriptions.map((sub) => (
                            <SubscriptionCard key={sub.channel_id} subscription={sub} />
                        ))}
                    </div>
                </section>
            )}

            <section>
                <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>
                    Watch History
                </h2>
                {history.length === 0 ? (
                    <div style={{
                        padding: '48px',
                        textAlign: 'center',
                        color: 'var(--yt-text-secondary)',
                        backgroundColor: 'var(--yt-hover)',
                        borderRadius: '12px',
                    }}>
                        <p style={{ fontSize: '16px', marginBottom: '8px' }}>No videos watched yet</p>
                        <p style={{ fontSize: '14px' }}>Videos you watch will appear here</p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '16px',
                    }}>
                        {history.map((video) => (
                            <HistoryVideoCard key={video.id} video={video} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
