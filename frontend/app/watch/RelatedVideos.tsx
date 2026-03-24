import Link from 'next/link';
import { API_BASE } from '../constants';
import NextVideoClient from './NextVideoClient';

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    channel_id?: string;
    thumbnail: string;
    view_count: number;
    duration: string;
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

export default async function RelatedVideos({ videoId, title, uploader }: { videoId: string, title: string, uploader: string }) {
    const relatedVideos = await getRelatedVideos(videoId, title, uploader);

    if (relatedVideos.length === 0) {
        return <div style={{ padding: '1rem', color: '#888' }}>No related videos found.</div>;
    }

    const nextVideoId = relatedVideos[0].id;

    return (
        <div className="watch-related-list">
            <NextVideoClient videoId={nextVideoId} />
            {relatedVideos.map((video, i) => {
                const views = formatViews(video.view_count);
                const staggerClass = `stagger-${Math.min(i + 1, 6)}`;

                return (
                    <Link key={video.id} href={`/watch?v=${video.id}`} className={`related-video-item fade-in-up ${staggerClass}`} style={{ opacity: 0 }}>
                        <div className="related-thumb-container">
                             <img 
                                 src={video.thumbnail} 
                                 alt={video.title} 
                                 className="related-thumb-img"
                                 onError={(e) => {
                                     const img = e.target as HTMLImageElement;
                                     if (img.src !== 'https://i.ytimg.com/vi/default/hqdefault.jpg') {
                                         img.src = 'https://i.ytimg.com/vi/default/hqdefault.jpg';
                                     }
                                 }}
                             />
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
    );
}
