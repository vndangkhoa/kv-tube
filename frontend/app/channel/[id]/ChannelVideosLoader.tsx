'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import VideoCard from '../../components/VideoCard';
import { VideoData } from '@/app/constants';
import { getVideoStatsClient } from '../../clientActions';
import LoadingSpinner from '../../components/LoadingSpinner';

interface Props {
    channelId: string;
    channelTitle: string;
    initialVideos: VideoData[];
}

const LIMIT_STEPS = [96, 150, 200];

export default function ChannelVideosLoader({ channelId, channelTitle, initialVideos }: Props) {
    const [videos, setVideos] = useState<VideoData[]>(initialVideos);
    const [loading, setLoading] = useState(false);

    const loadedRef = useRef(initialVideos.length);
    const stepRef = useRef(0);
    const loadingRef = useRef(false);
    const doneRef = useRef(false);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const enrichingRef = useRef<Set<string>>(new Set());

    // Lazily resolve view counts (flat-playlist listings don't include them),
    // in background chunks, then patch them into the rendered videos.
    const enrichViews = useCallback(async (list: VideoData[]) => {
        const ids = list
            .filter(v => v.id && !v.view_count && !enrichingRef.current.has(v.id))
            .map(v => v.id);
        if (ids.length === 0) return;
        ids.forEach(id => enrichingRef.current.add(id));
        for (let i = 0; i < ids.length; i += 40) {
            const chunk = ids.slice(i, i + 40);
            const stats = await getVideoStatsClient(chunk);
            if (!stats || Object.keys(stats).length === 0) continue;
            setVideos(prev => prev.map(v => {
                const s = stats[v.id];
                if (!s) return v;
                return {
                    ...v,
                    view_count: s.view_count || v.view_count,
                    upload_date: s.upload_date || v.upload_date,
                };
            }));
        }
    }, []);

    useEffect(() => {
        enrichViews(initialVideos);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadMore = useCallback(async () => {
        if (loadingRef.current || doneRef.current) return;
        if (stepRef.current >= LIMIT_STEPS.length) {
            doneRef.current = true;
            return;
        }
        loadingRef.current = true;
        setLoading(true);
        const limit = LIMIT_STEPS[stepRef.current];
        stepRef.current += 1;
        try {
            const res = await fetch(`/api/channel/page?id=${encodeURIComponent(channelId)}&limit=${limit}`, {
                signal: AbortSignal.timeout(60000),
            });
            const data = res.ok ? await res.json() : null;
            const all: VideoData[] = Array.isArray(data?.videos) ? data.videos : [];
            const fresh = all.slice(loadedRef.current);
            if (fresh.length === 0) {
                doneRef.current = true;
            } else {
                loadedRef.current = all.length;
                fresh.forEach(v => { v.uploader = channelTitle; });
                setVideos(prev => [...prev, ...fresh]);
                enrichViews(fresh);
            }
        } catch {
            // allow retry on next scroll
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [channelId, channelTitle, enrichViews]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) loadMore();
            },
            { rootMargin: '800px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [loadMore]);

    return (
        <>
            <div className="channel-video-grid">
                {videos.map(v => (
                    <div key={v.id}>
                        <VideoCard video={v as any} hideChannelAvatar={true} />
                    </div>
                ))}
            </div>

            <div ref={sentinelRef} style={{ height: '1px' }} />

            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                    <LoadingSpinner />
                </div>
            )}
        </>
    );
}
