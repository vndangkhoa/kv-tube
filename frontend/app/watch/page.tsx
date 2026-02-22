import VideoPlayer from './VideoPlayer';
import Link from 'next/link';
import WatchActions from './WatchActions';
import SubscribeButton from '../components/SubscribeButton';
import { API_BASE } from '../constants';

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    channel_id?: string;
    thumbnail: string;
    view_count: number;
    duration: string;
}

interface VideoInfo {
    title: string;
    description: string;
    uploader: string;
    channel_id: string;
    view_count: number;
    thumbnail?: string;
}

async function getVideoInfo(id: string): Promise<VideoInfo | null> {
    try {
        const res = await fetch(`${API_BASE}/api/get_stream_info?v=${id}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            title: data.title || `Video ${id}`,
            description: data.description || '',
            uploader: data.uploader || 'Unknown',
            channel_id: data.channel_id || '',
            view_count: data.view_count || 0,
            thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function getRelatedVideos(videoId: string, title: string, uploader: string) {
    try {
        const params = new URLSearchParams({ v: videoId, title: title || '', uploader: uploader || '', limit: '15' });
        const res = await fetch(`${API_BASE}/api/related?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) return [];
        return res.json() as Promise<VideoData[]>;
    } catch (e) {
        console.error(e);
        return [];
    }
}

function formatViews(views: number): string {
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toString();
}

export default async function WatchPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const awaitParams = await searchParams;
    const v = awaitParams.v as string;

    if (!v) {
        return <div style={{ padding: '2rem' }}>No video ID provided</div>;
    }

    const info = await getVideoInfo(v);
    const relatedVideos = await getRelatedVideos(v, info?.title || '', info?.uploader || '');
    const nextVideoId = relatedVideos.length > 0 ? relatedVideos[0].id : undefined;

    return (
        <div className="watch-container fade-in">
            <div className="watch-primary">
                <div className="watch-player-wrapper">
                    <VideoPlayer 
                        videoId={v} 
                        title={info?.title}
                        nextVideoId={nextVideoId}
                    />
                </div>

                <h1 className="watch-title">
                    {info?.title || `Video ${v}`}
                </h1>

                {info && (
                    <div className="watch-meta-row">
                        <div className="watch-channel-info">
                            <Link href={info.channel_id ? `/channel/${info.channel_id}` : '#'} className="watch-channel-link">
                                <div className="watch-channel-text">
                                    <span className="watch-channel-name">{info.uploader}</span>
                                </div>
                            </Link>
                            <SubscribeButton channelId={info.channel_id} channelName={info.uploader} />
                        </div>

                        <div className="watch-actions-row">
                            <WatchActions videoId={v} />
                        </div>
                    </div>
                )}

                {info && (
                    <div className="watch-description-box">
                        <div className="watch-description-stats">
                            {formatNumber(info.view_count)} views
                        </div>
                        <div className="watch-description-text">
                            {info.description || 'No description available.'}
                        </div>
                    </div>
                )}
            </div>

            <div className="watch-secondary">
                <div className="watch-related-list">
                    {relatedVideos.map((video, i) => {
                        const views = formatViews(video.view_count);
                        const staggerClass = `stagger-${Math.min(i + 1, 6)}`;

                        return (
                            <Link key={video.id} href={`/watch?v=${video.id}`} className={`related-video-item fade-in-up ${staggerClass}`} style={{ opacity: 0 }}>
                                <div className="related-thumb-container">
                                    <img src={video.thumbnail} alt={video.title} className="related-thumb-img" />
                                    {video.duration && (
                                        <div className="duration-badge">
                                            {video.duration}
                                        </div>
                                    )}
                                </div>
                                <div className="related-video-info">
                                    <span className="related-video-title">{video.title}</span>
                                    <span className="related-video-channel">{video.uploader}</span>
                                    <span className="related-video-meta">{views} views</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
