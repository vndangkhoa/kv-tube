import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    channel_id: string;
    thumbnail: string;
    view_count: number;
    duration: string;
}

interface Subscription {
    id: number;
    channel_id: string;
    channel_name: string;
    channel_avatar: string;
}

async function getSubscriptions() {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/subscriptions`, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function getChannelVideos(channelId: string, limit: number = 5) {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/channel/videos?id=${channelId}&limit=${limit}`, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function formatViews(views: number): string {
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

export default async function SubscriptionsPage() {
    const subscriptions = await getSubscriptions();

    if (subscriptions.length === 0) {
        return (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                <h2 style={{ marginBottom: '16px', color: 'var(--yt-text-primary)' }}>No subscriptions yet</h2>
                <p>Subscribe to channels to see their latest videos here</p>
            </div>
        );
    }

    const videosPerChannel = await Promise.all(
        subscriptions.map(async (sub) => ({
            subscription: sub,
            videos: await getChannelVideos(sub.channel_id, 5),
        }))
    );

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '24px' }}>Subscriptions</h1>

            {videosPerChannel.map(({ subscription, videos }) => (
                <section key={subscription.channel_id} style={{ marginBottom: '32px' }}>
                    <Link
                        href={`/channel/${subscription.channel_id}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            marginBottom: '16px',
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
                        <h2 style={{ fontSize: '18px', fontWeight: '500' }}>{subscription.channel_name || subscription.channel_id}</h2>
                    </Link>

                    {videos.length > 0 ? (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                            gap: '16px',
                        }}>
                            {videos.map((video) => (
                                <Link
                                    key={video.id}
                                    href={`/watch?v=${video.id}`}
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
                                             src={video.thumbnail}
                                             alt={video.title}
                                             style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                             onError={(e) => {
                                                 const img = e.target as HTMLImageElement;
                                                 if (img.src !== 'https://i.ytimg.com/vi/default/hqdefault.jpg') {
                                                     img.src = 'https://i.ytimg.com/vi/default/hqdefault.jpg';
                                                 }
                                             }}
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
                                    }}>
                                        {video.title}
                                    </h3>
                                    <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                                        {formatViews(video.view_count)} views
                                    </p>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--yt-text-secondary)', fontSize: '14px' }}>No videos available</p>
                    )}
                </section>
            ))}
        </div>
    );
}
