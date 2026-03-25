'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

const DEFAULT_THUMBNAIL = 'https://i.ytimg.com/vi/default/hqdefault.jpg';

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    channel_id: string;
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

interface ChannelVideos {
    subscription: Subscription;
    videos: VideoData[];
}

const INITIAL_ROWS = 2;
const VIDEOS_PER_ROW = 5;
const MAX_ROWS = 5;

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

function ChannelSection({ channelVideos, defaultExpanded = false }: { channelVideos: ChannelVideos; defaultExpanded?: boolean }) {
    const { subscription, videos } = channelVideos;
    const [expanded, setExpanded] = useState(defaultExpanded);

    const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.target as HTMLImageElement;
        if (img.src !== DEFAULT_THUMBNAIL) {
            img.src = DEFAULT_THUMBNAIL;
        }
    }, []);

    if (videos.length === 0) return null;

    const initialCount = INITIAL_ROWS * VIDEOS_PER_ROW;
    const maxCount = MAX_ROWS * VIDEOS_PER_ROW;
    const displayedVideos = expanded ? videos.slice(0, maxCount) : videos.slice(0, initialCount);
    const hasMore = videos.length > initialCount;

    return (
        <section style={{ marginBottom: '32px' }}>
            <Link
                href={`/channel/${subscription.channel_id}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                    padding: '0 12px',
                }}
            >
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'var(--yt-avatar-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    color: '#fff',
                    fontWeight: '600',
                }}>
                    {subscription.channel_name ? subscription.channel_name[0].toUpperCase() : '?'}
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: '500', color: 'var(--yt-text-primary)' }}>
                    {subscription.channel_name || subscription.channel_id}
                </h2>
            </Link>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '16px',
                padding: '0 12px',
            }}>
                {displayedVideos.map((video) => {
                    const relativeTime = video.uploaded_date || getRelativeTime(video.id);
                    const destination = `/watch?v=${video.id}`;
                    const thumbnailSrc = video.thumbnail || DEFAULT_THUMBNAIL;

                    return (
                        <Link
                            key={video.id}
                            href={destination}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                borderRadius: '12px',
                                overflow: 'hidden',
                            }}
                            className="card-hover-lift"
                        >
                            <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden' }}>
                                <img
                                    src={thumbnailSrc}
                                    alt={video.title}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={handleImageError}
                                />
                                {video.duration && (
                                    <div className="duration-badge">{video.duration}</div>
                                )}
                            </div>
                            <h3 style={{
                                fontSize: '14px',
                                fontWeight: '500',
                                lineHeight: '20px',
                                color: 'var(--yt-text-primary)',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                margin: 0,
                            }}>
                                {video.title}
                            </h3>
                            <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>
                                {formatViews(video.view_count)} views • {relativeTime}
                            </p>
                        </Link>
                    );
                })}
            </div>

            {hasMore && (
                <div style={{ padding: '16px 12px 0', textAlign: 'left' }}>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            setExpanded(!expanded);
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--yt-text-secondary)',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            padding: '8px 16px',
                            borderRadius: '18px',
                            transition: 'background-color 0.2s',
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--yt-hover)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        {expanded ? 'Show less' : `Show more (${videos.length - initialCount} more)`}
                    </button>
                </div>
            )}
        </section>
    );
}

export default function SubscriptionsPage() {
    const [channelsVideos, setChannelsVideos] = useState<ChannelVideos[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const subsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/subscriptions`, { cache: 'no-store' });
                const subsData = await subsRes.json();
                const subs = Array.isArray(subsData) ? subsData : [];

                const channelVideos: ChannelVideos[] = [];
                for (const sub of subs) {
                    const videosRes = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/channel/videos?id=${sub.channel_id}&limit=${MAX_ROWS * VIDEOS_PER_ROW}`, 
                        { cache: 'no-store' }
                    );
                    const videosData = await videosRes.json();
                    const videos = Array.isArray(videosData) ? videosData : [];
                    if (videos.length > 0) {
                        channelVideos.push({
                            subscription: sub,
                            videos: videos.map((v: VideoData) => ({ ...v, uploader: sub.channel_name }))
                        });
                    }
                }

                setChannelsVideos(channelVideos);
            } catch (err) {
                console.error('Failed to fetch subscriptions:', err);
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

    if (channelsVideos.length === 0) {
        return (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                <h2 style={{ marginBottom: '16px', color: 'var(--yt-text-primary)' }}>No subscriptions yet</h2>
                <p>Subscribe to channels to see their latest videos here</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '12px', maxWidth: '1400px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '24px', padding: '0 12px' }}>Subscriptions</h1>

            {channelsVideos.map((channelData) => (
                <ChannelSection key={channelData.subscription.channel_id} channelVideos={channelData} />
            ))}
        </div>
    );
}
