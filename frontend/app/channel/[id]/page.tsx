import ChannelSubscribeButton from '../../components/ChannelSubscribeButton';
import ChannelVideosLoader from './ChannelVideosLoader';
import ChannelAvatar from './ChannelAvatar';
import ChannelDescription from './ChannelDescription';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';

interface ChannelInfo {
    id: string;
    title: string;
    subscriber_count: number;
    avatar: string;
    avatar_url?: string;
    banner_url?: string;
    description?: string;
    video_count?: number;
}

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    thumbnail: string;
    view_count: number;
    duration: string;
    channel_id?: string;
}

interface ChannelPageData {
    info: ChannelInfo | null;
    videos: VideoData[];
}

function formatSubscribers(count: number): string {
    if (count >= 1000000) return (count / 1000000).toFixed(2) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(0) + 'K';
    return count.toString();
}

const API_BASE = 'http://localhost:8080/api';
const INITIAL_LIMIT = 48;

async function getChannelPage(id: string): Promise<ChannelPageData | null> {
    try {
        const res = await fetch(`${API_BASE}/channel/page?id=${encodeURIComponent(id)}&limit=${INITIAL_LIMIT}`, {
            cache: 'no-store',
        });
        if (!res.ok) return null;
        return (await res.json()) as ChannelPageData;
    } catch (e) {
        console.error(e);
        return null;
    }
}

export default async function ChannelPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const awaitParams = await params;
    const channelId = decodeURIComponent(awaitParams.id);

    const data = await getChannelPage(channelId);
    if (!data || !data.info) {
        return notFound();
    }

    const { info, videos } = data;
    const videoCountLabel = info.video_count && info.video_count > 0
        ? `${info.video_count} videos`
        : `${videos.length}+ videos`;

    return (
        <div style={{ paddingBottom: '48px' }}>
            {/* Banner */}
            {info.banner_url && (
                <div className="channel-banner">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={info.banner_url} alt={`${info.title} banner`} />
                </div>
            )}

            {/* Channel Header */}
            <div className="channel-header">
                <ChannelAvatar
                    avatarUrl={info.avatar_url}
                    letter={info.avatar}
                    title={info.title}
                />

                <div className="channel-meta">
                    <h1 className="channel-name">{info.title}</h1>
                    <div className="channel-stats">
                        <span>{formatSubscribers(info.subscriber_count)} subscribers</span>
                        <span style={{ opacity: 0.5 }}>•</span>
                        <span>{videoCountLabel}</span>
                    </div>

                    {info.description && <ChannelDescription text={info.description} />}

                    <div style={{ marginTop: '16px' }}>
                        <ChannelSubscribeButton channelId={info.id} channelName={info.title} />
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="channel-tabs">
                <div className="channel-tabs-inner">
                    <div className="channel-tab active">Videos</div>
                </div>
            </div>

            {/* Video Grid + infinite scroll (view counts hydrated client-side) */}
            <ChannelVideosLoader
                channelId={info.id}
                channelTitle={info.title}
                initialVideos={videos.map((v) => ({ ...v, uploader: info.title }))}
            />
        </div>
    );
}
