'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSubscriptionsFeedClient, getVideoDatesClient, formatRelativeTime } from '../../clientActions';
import { VideoData } from '../../constants';
import { proxiedThumb, proxiedImageUrl } from '../../utils';
import LoadingSpinner from '../../components/LoadingSpinner';

const API_BASE = '/api';

interface Subscription {
    channel_id: string;
    channel_name: string;
    channel_avatar: string;
}

const DEFAULT_THUMBNAIL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect fill="%23222" width="320" height="180"/%3E%3Cpath fill="%23555" d="M140 65v50l40-25z"/%3E%3C/svg%3E';

const CHANNELS_PER_PAGE = 20;
const PER_CHANNEL = 5;

// Sort newest first by upload_date ("YYYYMMDD"); undated videos go last.
// Array.prototype.sort is stable, so relative order is preserved within ties.
function sortByLatest(list: VideoData[]): VideoData[] {
    return [...list].sort((a, b) => {
        const da = a.upload_date || '';
        const db = b.upload_date || '';
        if (da && db) return db.localeCompare(da);
        if (da) return -1;
        if (db) return 1;
        return 0;
    });
}

async function fetchSubscriptions(): Promise<Subscription[]> {
    try {
        const res = await fetch(`${API_BASE}/subscriptions`, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error('Failed to fetch subscriptions:', e);
        return [];
    }
}

// A subscription's stored "avatar" is often just a letter, so only treat it as
// an image when it's an actual URL; otherwise fall back to the initial.
function isImageUrl(v?: string): boolean {
    return !!v && (/^https?:\/\//.test(v) || v.startsWith('data:'));
}

// ---- Lazy avatar hydration ----
// Avatars aren't stored with subscriptions, so we lazily fetch real avatar URLs
// for channels as they scroll into view. Results are cached in memory + in
// localStorage (avatars rarely change) and requests are batched + de-duplicated.
const AVATAR_LS_KEY = 'kvtube_channel_avatars';
const avatarMemCache = new Map<string, string>();
let avatarLsLoaded = false;

function loadAvatarCache() {
    if (avatarLsLoaded || typeof window === 'undefined') return;
    avatarLsLoaded = true;
    try {
        const raw = window.localStorage.getItem(AVATAR_LS_KEY);
        if (raw) {
            const obj = JSON.parse(raw) as Record<string, string>;
            for (const [k, v] of Object.entries(obj)) {
                if (isImageUrl(v)) avatarMemCache.set(k, v);
            }
        }
    } catch { /* ignore */ }
}

function persistAvatarCache() {
    if (typeof window === 'undefined') return;
    try {
        const obj: Record<string, string> = {};
        avatarMemCache.forEach((v, k) => { obj[k] = v; });
        window.localStorage.setItem(AVATAR_LS_KEY, JSON.stringify(obj));
    } catch { /* ignore */ }
}

const avatarPending = new Set<string>();
let avatarQueue: string[] = [];
let avatarFlushTimer: ReturnType<typeof setTimeout> | null = null;
const avatarSubscribers = new Set<() => void>();

function notifyAvatarSubscribers() {
    avatarSubscribers.forEach((fn) => fn());
}

async function flushAvatarQueue() {
    avatarFlushTimer = null;
    const batch = avatarQueue.splice(0, 20);
    if (batch.length === 0) return;
    try {
        const res = await fetch(`${API_BASE}/channel/avatars?ids=${batch.map(encodeURIComponent).join(',')}`);
        if (res.ok) {
            const data = await res.json() as Record<string, { avatar_url?: string }>;
            let changed = false;
            for (const id of batch) {
                const url = data[id]?.avatar_url;
                if (url && isImageUrl(url)) {
                    avatarMemCache.set(id, url);
                    changed = true;
                }
            }
            if (changed) {
                persistAvatarCache();
                notifyAvatarSubscribers();
            }
        }
    } catch { /* ignore */ }
    finally {
        batch.forEach((id) => avatarPending.delete(id));
        if (avatarQueue.length > 0 && !avatarFlushTimer) {
            avatarFlushTimer = setTimeout(flushAvatarQueue, 150);
        }
    }
}

function requestAvatar(channelId: string) {
    if (!channelId || avatarMemCache.has(channelId) || avatarPending.has(channelId)) return;
    avatarPending.add(channelId);
    avatarQueue.push(channelId);
    if (!avatarFlushTimer) avatarFlushTimer = setTimeout(flushAvatarQueue, 150);
}

// Hook: returns a resolved avatar URL for a channel once it's been requested and fetched.
function useLazyAvatar(channelId: string, inView: boolean, fallback?: string): string | undefined {
    loadAvatarCache();
    const [url, setUrl] = useState<string | undefined>(() => avatarMemCache.get(channelId));

    useEffect(() => {
        if (!inView) return;
        if (avatarMemCache.has(channelId)) {
            setUrl(avatarMemCache.get(channelId));
            return;
        }
        requestAvatar(channelId);
        const sub = () => {
            const v = avatarMemCache.get(channelId);
            if (v) setUrl(v);
        };
        avatarSubscribers.add(sub);
        return () => { avatarSubscribers.delete(sub); };
    }, [channelId, inView]);

    return url || (isImageUrl(fallback) ? fallback : undefined);
}

function ChannelAvatar({ name, avatar, size = 40 }: { name: string; avatar?: string; size?: number }) {
    const showImg = isImageUrl(avatar);
    return (
        <div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            background: 'var(--yt-avatar-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: `${size * 0.45}px`,
            color: '#fff',
            fontWeight: '600',
            overflow: 'hidden',
            flexShrink: 0,
        }}>
            {showImg ? (
                <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                name ? name[0].toUpperCase() : '?'
            )}
        </div>
    );
}

function ChannelChip({ sub }: { sub: Subscription }) {
    const ref = useRef<HTMLAnchorElement>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
            { rootMargin: '200px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const avatarUrl = useLazyAvatar(sub.channel_id, inView, sub.channel_avatar);

    return (
        <Link
            ref={ref}
            key={sub.channel_id}
            href={`/channel/${sub.channel_id}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                width: '72px',
                minWidth: '72px',
                flexShrink: 0,
                textDecoration: 'none',
            }}
            title={sub.channel_name}
        >
            <ChannelAvatar name={sub.channel_name} avatar={avatarUrl} size={56} />
            <span style={{
                fontSize: '12px',
                color: 'var(--yt-text-secondary)',
                maxWidth: '72px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'center',
            }}>
                {sub.channel_name || '...'}
            </span>
        </Link>
    );
}

function RecentChannelsStrip({ subs }: { subs: Subscription[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);

    if (subs.length === 0) return null;

    const scrollBy = (dir: number) => {
        const el = scrollRef.current;
        if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
    };

    return (
        <div style={{ marginBottom: '20px' }}>
            {/* Header row with count + expand toggle */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
            }}>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--yt-text-primary)', margin: 0 }}>
                    All channels <span style={{ color: 'var(--yt-text-secondary)', fontWeight: 400 }}>({subs.length})</span>
                </h2>
                <button
                    onClick={() => setExpanded((e) => !e)}
                    style={{
                        background: 'var(--yt-hover)',
                        border: '1px solid var(--yt-border)',
                        color: 'var(--yt-text-primary)',
                        borderRadius: '18px',
                        padding: '6px 14px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    {expanded ? 'Collapse' : 'Expand'}
                </button>
            </div>

            {expanded ? (
                /* Expanded: wrapping grid, scrollable if very tall */
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    maxHeight: '340px',
                    overflowY: 'auto',
                    padding: '4px',
                }}>
                    {subs.map((sub) => <ChannelChip key={sub.channel_id} sub={sub} />)}
                </div>
            ) : (
                /* Collapsed: horizontal scroll with arrow controls */
                <div style={{ position: 'relative' }}>
                    {subs.length > 6 && (
                        <button
                            aria-label="Scroll left"
                            onClick={() => scrollBy(-1)}
                            className="channel-scroll-arrow"
                            style={{ left: '-6px' }}
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
                        </button>
                    )}
                    <div
                        ref={scrollRef}
                        style={{
                            display: 'flex',
                            gap: '16px',
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                            padding: '4px 0',
                            scrollBehavior: 'smooth',
                        }}
                        className="hide-scrollbox"
                    >
                        {subs.map((sub) => <ChannelChip key={sub.channel_id} sub={sub} />)}
                    </div>
                    {subs.length > 6 && (
                        <button
                            aria-label="Scroll right"
                            onClick={() => scrollBy(1)}
                            className="channel-scroll-arrow"
                            style={{ right: '-6px' }}
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function VideoCard({ video }: { video: VideoData }) {
    const [imgSrc, setImgSrc] = useState(() => proxiedImageUrl(video.thumbnail) || proxiedThumb(video.id));
    const [thumbErr, setThumbErr] = useState(false);
    const relativeTime = video.publishedAt || '';

    const channelName = video.channelTitle || video.uploader;
    const channelId = video.channelId || video.uploader_id;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} className="card-hover-lift">
            <Link href={`/watch?v=${video.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden', background: '#272727' }}>
                    <img
                        src={imgSrc}
                        alt={video.title}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => {
                            if (thumbErr) return;
                            setThumbErr(true);
                            setImgSrc(proxiedThumb(video.id, 'default'));
                        }}
                    />
                    {video.duration && <div className="duration-badge">{video.duration}</div>}
                </div>
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/watch?v=${video.id}`} style={{ textDecoration: 'none' }}>
                    <h3 style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        lineHeight: '20px',
                        color: 'var(--yt-text-primary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        margin: '0 0 4px 0',
                    }}>
                        {video.title}
                    </h3>
                </Link>
                {channelName && (
                    channelId ? (
                        <Link
                            href={`/channel/${channelId}`}
                            style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', textDecoration: 'none' }}
                            className="channel-link-hover"
                        >
                            {channelName}
                        </Link>
                    ) : (
                        <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>{channelName}</div>
                    )
                )}
                {relativeTime && (
                    <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                        {relativeTime}
                    </div>
                )}
            </div>
        </div>
    );
}

function CardSkeleton() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ aspectRatio: '16/9', borderRadius: '12px', background: 'var(--yt-hover)', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--yt-hover)', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ height: '14px', borderRadius: '4px', background: 'var(--yt-hover)', width: '90%', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
                    <div style={{ height: '12px', borderRadius: '4px', background: 'var(--yt-hover)', width: '55%', marginTop: '8px', animation: 'skeletonPulse 1.5s ease-in-out infinite' }} />
                </div>
            </div>
        </div>
    );
}

export default function SubscriptionsPage() {
    const [recentSubs, setRecentSubs] = useState<Subscription[]>([]);
    const [hasAnySubs, setHasAnySubs] = useState<boolean | null>(null);
    const [videos, setVideos] = useState<VideoData[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const offsetRef = useRef(0);
    const loadingRef = useRef(false);
    const hasMoreRef = useRef(true);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Merge real upload dates in the background (in chunks), then re-sort so the
    // feed stays newest-first as dates resolve.
    const enrichDates = useCallback(async (list: VideoData[]) => {
        const ids = list.filter((v) => v.id && !v.upload_date).map((v) => v.id);
        if (ids.length === 0) return;
        for (let i = 0; i < ids.length; i += 60) {
            const chunk = ids.slice(i, i + 60);
            const dates = await getVideoDatesClient(chunk);
            if (!dates || Object.keys(dates).length === 0) continue;
            setVideos((prev) => sortByLatest(prev.map((v) => {
                const d = dates[v.id];
                return d && !v.upload_date ? { ...v, upload_date: d, publishedAt: formatRelativeTime(d) } : v;
            })));
        }
    }, []);

    const loadFeed = useCallback(async (isInitial: boolean) => {
        if (loadingRef.current || !hasMoreRef.current) return;
        loadingRef.current = true;
        if (isInitial) setLoading(true);
        else setLoadingMore(true);

        const offset = offsetRef.current;
        const batch = await getSubscriptionsFeedClient(offset, CHANNELS_PER_PAGE, PER_CHANNEL);

        if (batch.length === 0) {
            hasMoreRef.current = false;
            setHasMore(false);
        } else {
            offsetRef.current = offset + CHANNELS_PER_PAGE;
            setVideos((prev) => {
                const existing = new Set(prev.map((v) => v.id));
                const fresh = batch.filter((v) => !existing.has(v.id));
                return sortByLatest([...prev, ...fresh]);
            });
            enrichDates(batch);
        }

        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
    }, [enrichDates]);

    useEffect(() => {
        fetchSubscriptions().then((data) => {
            setHasAnySubs(data.length > 0);
            setRecentSubs(data);
        });
        loadFeed(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !loadingRef.current && hasMoreRef.current) {
                    loadFeed(false);
                }
            },
            { rootMargin: '800px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [loadFeed]);

    if (loading) {
        return (
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--yt-text-primary)', marginBottom: '20px' }}>Subscriptions</h1>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px 20px' }}>
                    {Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)}
                </div>
            </div>
        );
    }

    if (hasAnySubs === false) {
        return (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                <h2 style={{ marginBottom: '16px', color: 'var(--yt-text-primary)' }}>No subscriptions yet</h2>
                <p>Subscribe to channels to see their latest videos here</p>
                <Link href="/" style={{ display: 'inline-block', marginTop: '16px', padding: '10px 20px', backgroundColor: 'var(--yt-brand-red)', color: 'white', borderRadius: '20px', textDecoration: 'none', fontWeight: '500' }}>
                    Discover videos
                </Link>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--yt-text-primary)', marginBottom: '16px' }}>
                Subscriptions
            </h1>

            <RecentChannelsStrip subs={recentSubs} />

            {videos.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                    Couldn&apos;t load the latest videos. Try refreshing.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px 20px' }}>
                    {videos.map((video) => <VideoCard key={video.id} video={video} />)}
                </div>
            )}

            {hasMore && <div ref={sentinelRef} style={{ height: '1px' }} />}

            {loadingMore && (
                <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
                    <LoadingSpinner />
                </div>
            )}

            {!hasMore && videos.length > 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
                    You&apos;ve reached the end
                </div>
            )}
        </div>
    );
}
