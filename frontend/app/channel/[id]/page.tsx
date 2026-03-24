import VideoCard from '../../components/VideoCard';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';

interface ChannelInfo {
    id: string;
    title: string;
    subscriber_count: number;
    avatar: string;
}

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    thumbnail: string;
    view_count: number;
    duration: string;
}

// Helper to format subscribers
function formatSubscribers(count: number): string {
    if (count >= 1000000) return (count / 1000000).toFixed(2) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(0) + 'K';
    return count.toString();
}

// We no longer need getAvatarColor as we now use the global --yt-avatar-bg

async function getChannelInfo(id: string) {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/channel/info?id=${id}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return res.json() as Promise<ChannelInfo>;
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function getChannelVideos(id: string) {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/api/channel/videos?id=${id}&limit=30`, { cache: 'no-store' });
        if (!res.ok) return [];
        return res.json() as Promise<VideoData[]>;
    } catch (e) {
        console.error(e);
        return [];
    }
}

export default async function ChannelPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const awaitParams = await params;
    let channelId = awaitParams.id;

    // Clean up URL encoding issues if any
    channelId = decodeURIComponent(channelId);

    const [info, videos] = await Promise.all([
        getChannelInfo(channelId),
        getChannelVideos(channelId)
    ]);

    if (!info) {
        return notFound();
    }

    return (
        <div style={{ paddingBottom: '48px' }}>
            {/* Channel Header */}
            <div className="channel-header">
                <div
                    className="channel-avatar"
                    style={{ backgroundColor: 'var(--yt-avatar-bg)' }}
                >
                    {info.avatar}
                </div>

                <div className="channel-meta">
                    <h1 className="channel-name">
                        {info.title}
                    </h1>
                    <div className="channel-stats">
                        <span style={{ opacity: 0.7 }}>{info.id}</span>
                        <span style={{ opacity: 0.5 }}>•</span>
                        <span>{formatSubscribers(info.subscriber_count)} subscribers</span>
                        <span style={{ opacity: 0.5 }}>•</span>
                        <span>{videos.length} videos</span>
                    </div>
                    <button className="channel-subscribe-btn">
                        Subscribe
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="channel-tabs">
                <div className="channel-tabs-inner">
                    <div className="channel-tab active">
                        Videos
                        <span className="channel-video-count">{videos.length}</span>
                    </div>
                </div>
            </div>

            {/* Video Grid */}
            <div className="channel-video-grid">
                {videos.map((v, i) => {
                    // Enforce correct channel name
                    v.uploader = info.title;
                    const stagger = `stagger-${Math.min(i + 1, 6)}`;
                    return (
                        <div key={v.id} className={`fade-in-up ${stagger}`} style={{ opacity: 0 }}>
                            <VideoCard video={v} hideChannelAvatar={true} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
