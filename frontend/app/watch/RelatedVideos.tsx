'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

const DEFAULT_THUMBNAIL = 'https://i.ytimg.com/vi/default/hqdefault.jpg';

interface VideoData {
    id: string;
    title: string;
    uploader: string;
    channel_id?: string;
    thumbnail: string;
    view_count: number;
    duration: string;
}

interface RelatedVideosProps {
    initialVideos: VideoData[];
    nextVideoId: string;
}

function formatViews(views: number): string {
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

function RelatedVideoItem({ video, index }: { video: VideoData; index: number }) {
    const thumbnailSrc = video.thumbnail || DEFAULT_THUMBNAIL;
    const views = formatViews(video.view_count);
    const staggerClass = `stagger-${Math.min(index + 1, 6)}`;

    const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.target as HTMLImageElement;
        if (img.src !== DEFAULT_THUMBNAIL) {
            img.src = DEFAULT_THUMBNAIL;
        }
    }, []);

    return (
        <Link 
            key={video.id} 
            href={`/watch?v=${video.id}`} 
            className={`related-video-item fade-in-up ${staggerClass}`}
            style={{ opacity: 1 }}
        >
            <div className="related-thumb-container">
                <img 
                    src={thumbnailSrc}
                    alt={video.title} 
                    className="related-thumb-img"
                    onError={handleImageError}
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
}

export default function RelatedVideos({ initialVideos, nextVideoId }: RelatedVideosProps) {
    const [videos, setVideos] = useState<VideoData[]>(initialVideos);

    useEffect(() => {
        setVideos(initialVideos);
    }, [initialVideos]);

    if (videos.length === 0) {
        return <div style={{ padding: '1rem', color: '#888' }}>No related videos found.</div>;
    }

    return (
        <div className="watch-related-list">
            <Link href={`/watch?v=${nextVideoId}`} className="related-video-item fade-in-up" style={{ opacity: 1 }}>
                <div className="related-thumb-container">
                    <div className="next-up-overlay">
                        <span>UP NEXT</span>
                    </div>
                </div>
            </Link>
            {videos.map((video, i) => (
                <RelatedVideoItem key={video.id} video={video} index={i} />
            ))}
        </div>
    );
}
