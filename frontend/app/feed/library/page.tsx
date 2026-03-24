import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface VideoData {
    id: string;
    title: string;
    uploader: string;
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

async function getHistory() {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/history?limit=20`, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
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

function formatViews(views: number): string {
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

export default async function LibraryPage() {
    const [history, subscriptions] = await Promise.all([getHistory(), getSubscriptions()]);

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Subscriptions Section */}
            {subscriptions.length > 0 && (
                <section style={{ marginBottom: '40px' }}>
                    <h2 className="section-heading" style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>
                        Subscriptions
                    </h2>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {subscriptions.map((sub) => (
                            <Link
                                key={sub.channel_id}
                                href={`/channel/${sub.channel_id}`}
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
                                    {sub.channel_avatar || (sub.channel_name ? sub.channel_name[0].toUpperCase() : '?')}
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
                                    {sub.channel_name || sub.channel_id}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Watch History Section */}
            <section>
                <h2 className="section-heading" style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>
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
                            <Link
                                key={video.id}
                                href={`/watch?v=${video.id}`}
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
                                         src={video.thumbnail}
                                         alt={video.title}
                                         className="videocard-thumb"
                                         style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                         onError={(e) => {
                                             e.target.onError = null; // Prevent infinite loop
                                             e.target.src = 'https://i.ytimg.com/vi/default/hqdefault.jpg'; // Fallback to YouTube's default thumbnail
                                         }}
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
                                    <p style={{
                                        fontSize: '12px',
                                        color: 'var(--yt-text-secondary)',
                                    }}>
                                        {video.uploader}
                                    </p>
                                    {video.view_count > 0 && (
                                        <p style={{
                                            fontSize: '12px',
                                            color: 'var(--yt-text-secondary)',
                                        }}>
                                            {formatViews(video.view_count)} views
                                        </p>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
