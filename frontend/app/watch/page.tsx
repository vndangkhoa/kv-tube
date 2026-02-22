import { Suspense } from 'react';
import VideoPlayer from './VideoPlayer';
import Link from 'next/link';
import WatchActions from './WatchActions';
import SubscribeButton from '../components/SubscribeButton';
import RelatedVideos from './RelatedVideos';
import { API_BASE } from '../constants';

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

    return (
        <div className="watch-container fade-in">
            <div className="watch-primary">
                <div className="watch-player-wrapper">
                    <VideoPlayer
                        videoId={v}
                        title={info?.title}
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
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}><div className="skeleton" style={{ width: '100%', height: '100px', marginBottom: '1rem', borderRadius: '8px' }}></div><div className="skeleton" style={{ width: '100%', height: '100px', marginBottom: '1rem', borderRadius: '8px' }}></div><div className="skeleton" style={{ width: '100%', height: '100px', marginBottom: '1rem', borderRadius: '8px' }}></div></div>}>
                    <RelatedVideos videoId={v} title={info?.title || ''} uploader={info?.uploader || ''} />
                </Suspense>
            </div>
        </div>
    );
}
