"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import VideoCard from './VideoCard';
import { fetchMoreVideos } from '../actions';
import { VideoData } from '../constants';

interface Props {
    initialVideos: VideoData[];
    currentCategory: string;
    regionLabel: string;
    contextVideoId?: string;
}

export default function InfiniteVideoGrid({ initialVideos, currentCategory, regionLabel, contextVideoId }: Props) {
    const [videos, setVideos] = useState<VideoData[]>(initialVideos);
    const [page, setPage] = useState(2);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const observerTarget = useRef<HTMLDivElement>(null);

    // Reset state if category or region changes, or initialVideos changes
    useEffect(() => {
        setVideos(initialVideos);
        setPage(2);
        setHasMore(true);
    }, [initialVideos, currentCategory, regionLabel]);

    const loadMore = useCallback(async () => {
        if (isLoading || !hasMore) return;
        setIsLoading(true);

        try {
            const newVideos = await fetchMoreVideos(currentCategory, regionLabel, page, contextVideoId);
            if (newVideos.length === 0) {
                setHasMore(false);
            } else {
                setVideos(prev => {
                    // Deduplicate IDs
                    const existingIds = new Set(prev.map(v => v.id));
                    const uniqueNewVideos = newVideos.filter(v => !existingIds.has(v.id));
                    if (uniqueNewVideos.length === 0) {
                        return prev;
                    }
                    return [...prev, ...uniqueNewVideos];
                });
                setPage(p => p + 1);

                // If we get an extremely small yield, consider it the end
                if (newVideos.length < 5) {
                    setHasMore(false);
                }
            }
        } catch (e) {
            console.error('Failed to load more videos:', e);
        } finally {
            setIsLoading(false);
        }
    }, [currentCategory, regionLabel, page, isLoading, hasMore, contextVideoId]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [loadMore]);

    return (
        <div>
            <div className="fade-in video-grid-mobile" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
                paddingBottom: '24px'
            }}>
                {videos.map((v, i) => {
                    const staggerClass = i < 12 ? `stagger-${Math.min((i % 12) + 1, 6)}` : '';
                    return (
                        <div key={`${v.id}-${i}`} className={i < 12 ? `fade-in-up ${staggerClass}` : 'fade-in'}>
                            <VideoCard video={v} />
                        </div>
                    );
                })}
            </div>

            {hasMore && (
                <div ref={observerTarget} style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
                    {isLoading && (
                        <div style={{
                            width: '40px',
                            height: '40px',
                            border: '3px solid var(--yt-border)',
                            borderTopColor: 'var(--yt-brand-red)',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }}></div>
                    )}
                </div>
            )}

            {!hasMore && videos.length > 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
                    No more results
                </div>
            )}
        </div>
    );
}
