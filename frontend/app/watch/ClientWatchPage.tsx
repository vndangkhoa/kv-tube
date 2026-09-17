'use client';

import { useEffect, useState, useCallback, useMemo, lazy, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DownloadSheet from './DownloadSheet';
import { getVideoDetailsClient, getRelatedVideosClient, getCommentsClient, getCommentsPageClient, searchVideosClient } from '../clientActions';
import { VideoData } from '../constants';
import { proxiedThumb, proxiedImageUrl, formatRelativeTime, getThumbnailCascade } from '../utils';
import { isVideoSaved, toggleSaveVideo, addToHistory, isSubscribed, toggleSubscription, isVideoLiked, toggleLikeVideo } from '../storage';
import { invidious } from '../services/invidious';
import LoadingSpinner from '../components/LoadingSpinner';
import Link from 'next/link';
import { usePlayer } from '../context/PlayerContext';

// Stale-while-revalidate cache (like React Query staleTime + gcTime)
const apiCache = new Map<string, { data: any; timestamp: number }>();
const STALE_TIME = 3 * 60 * 1000;  // 3 min - data shown from cache without refetch
const GC_TIME = 30 * 60 * 1000;    // 30 min - data kept in memory for back-nav

function getCachedData(key: string): { data: any; isStale: boolean } {
    const cached = apiCache.get(key);
    if (!cached) return { data: null, isStale: false };
    const isStale = Date.now() - cached.timestamp > STALE_TIME;
    return { data: cached.data, isStale };
}

function setCachedData(key: string, data: any) {
    apiCache.set(key, { data, timestamp: Date.now() });
    if (apiCache.size > 100) {
        const oldestKey = apiCache.keys().next().value;
        if (oldestKey) apiCache.delete(oldestKey);
    }
}

// Refetch if stale (background refresh, no loading flash)
async function getOrFetchData<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const { data, isStale } = getCachedData(key);
    if (data && !isStale) return data;
    // If stale, revalidate in background but return stale data immediately
    if (data) {
        fetcher().then(newData => setCachedData(key, newData)).catch(() => {});
        return data;
    }
    const newData = await fetcher();
    setCachedData(key, newData);
    return newData;
}

// Strip brackets/punctuation so search terms actually match related content.
function cleanTitle(title: string): string {
    return (title || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[|•\-–—_#"'!?.,:;/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Build a compact keyword string from a video title.
function titleKeywords(title: string, maxWords = 6): string {
    const cleaned = cleanTitle(title);
    if (!cleaned) return '';
    return cleaned.split(' ').filter(w => w.length > 1).slice(0, maxWords).join(' ');
}

// Run candidate queries concurrently, accumulating unique videos until we reach `min` results.
async function searchWithFallback(
    queries: string[],
    min: number,
    limit: number,
    excludeIds: Set<string>,
): Promise<VideoData[]> {
    const validQueries = queries.filter(q => q && q.trim()).slice(0, 4);
    if (validQueries.length === 0) return [];
    
    const results = await Promise.all(
        validQueries.map(q => searchVideosClient(q, limit).catch(() => []))
    );
    
    const acc: VideoData[] = [];
    const seen = new Set<string>(excludeIds);
    for (const res of results) {
        for (const v of Array.isArray(res) ? res : []) {
            if (v.id && !seen.has(v.id)) {
                seen.add(v.id);
                acc.push(v);
                if (acc.length >= min) break;
            }
        }
        if (acc.length >= min) break;
    }
    return acc;
}

// Deduplicate and filter mix results against the current video and the
// Up Next list so the two tabs never show the same video.
function mixArrFilter(mix: VideoData[], videoId: string, related: VideoData[]): VideoData[] {
    const relatedIds = new Set(related.map(v => v.id));
    return (Array.isArray(mix) ? mix : [])
        .filter((v, i, self) =>
            i === self.findIndex(item => item.id === v.id) &&
            v.id !== videoId &&
            !relatedIds.has(v.id)
        );
}

import { fetchDislikes, RYDData } from '../services/ryd';
import { useTheme } from '../context/ThemeContext';
import {
    IoThumbsUpOutline,
    IoThumbsUp,
    IoThumbsDownOutline,
    IoThumbsDown,
    IoShareSocialOutline,
    IoBookmarkOutline,
    IoBookmark,
    IoDownloadOutline,
    IoPlaySkipBack,
    IoPlaySkipForward,
    IoRepeat,
    IoExpandOutline,
    IoNotificationsOutline,
    IoEllipsisHorizontal,
    IoChevronDown,
    IoChevronUp,
    IoChevronForward,
    IoCheckmark,
    IoSparklesOutline,
    IoShuffle,
    IoClose,
    IoRadioOutline,
    IoPlay,
} from 'react-icons/io5';
import { MdSort } from 'react-icons/md';

// Helper to auto-link URLs in description
function linkifyText(text: string) {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
        if (part.match(urlRegex)) {
            return (
                <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: 'var(--yt-blue)', textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                    {part}
                </a>
            );
        }
        return part;
    });
}

// Video Info Section matching modern desktop YouTube
function VideoInfo({
    video,
    onOpenDownload,
    onPrevious,
    onNext,
    hasPrevious,
    hasNext,
    loopMode,
    onToggleLoop,
    wideMode,
    onToggleWide,
    onStartMix,
    isMixActive,
}: {
    video: any;
    onOpenDownload?: () => void;
    onPrevious?: () => void;
    onNext?: () => void;
    hasPrevious?: boolean;
    hasNext?: boolean;
    loopMode?: boolean;
    onToggleLoop?: () => void;
    wideMode?: boolean;
    onToggleWide?: () => void;
    onStartMix?: () => void;
    isMixActive?: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [ryd, setRyd] = useState<RYDData | null>(null);
    const [userLiked, setUserLiked] = useState<boolean | null>(null);
    const { adaptToThumbnail } = useTheme();
    const moreMenuRef = useRef<HTMLDivElement>(null);

    // Close overflow menu on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
                setShowMoreMenu(false);
            }
        }
        if (showMoreMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMoreMenu]);

    // Fetch subscription, saved state, RYD dislikes, record history, and adapt theme to thumbnail
    useEffect(() => {
        if (video?.channelId) {
            setSubscribed(isSubscribed(video.channelId));
        }
        if (video?.id) {
            setIsSaved(isVideoSaved(video.id));
            setUserLiked(isVideoLiked(video.id) ? true : null);
            fetchDislikes(video.id).then(data => setRyd(data)).catch(() => {});
            addToHistory({
                videoId: video.id,
                title: video.title || 'Untitled Video',
                thumbnail: video.thumbnail || (video.id ? getThumbnailCascade(video.id, 1) : ''),
                channelTitle: video.channelTitle || video.uploader || 'Creator',
                channelId: video.channelId || video.authorId || '',
                channelAvatar: video.channelAvatar || video.authorThumbnails?.[0]?.url || video.authorThumbnail || '',
                duration: video.duration || '',
                viewCount: typeof video.viewCount === 'number' ? video.viewCount : (parseInt(String(video.viewCount || '0').replace(/[^0-9]/g, '')) || 0),
                uploadDate: video.uploadDate || video.publishedText || '',
            });
            invidious.addAuthHistory(video.id).catch(() => {});
        }
        if (video?.thumbnail) {
            adaptToThumbnail(video.thumbnail);
        }
    }, [video?.channelId, video?.id, video?.title, video?.thumbnail, video?.channelTitle, adaptToThumbnail]);

    const handleSubscribe = useCallback(async () => {
        if (!video?.channelId || subscribing) return;
        setSubscribing(true);
        try {
            const next = toggleSubscription({
                channelId: video.channelId,
                channelName: video.channelTitle || video.uploader || 'Creator',
                channelAvatar: video.channelAvatar || video.authorThumbnails?.[0]?.url || '',
            });
            setSubscribed(next);
            if (next) {
                invidious.pushSubscriptionToInvidious(video.channelId).catch(() => {});
            } else {
                invidious.unsubscribeChannel(video.channelId).catch(() => {});
            }
        } finally {
            setSubscribing(false);
        }
    }, [video?.channelId, video?.channelTitle, video?.channelAvatar, subscribing]);

    const handleSave = useCallback(() => {
        if (!video?.id) return;
        try {
            const nowSaved = toggleSaveVideo({
                videoId: video.id,
                title: video.title,
                channelTitle: video.channelTitle || video.uploader || '',
                channelId: video.channelId || video.authorId || '',
                duration: video.duration || '',
                thumbnail: video.thumbnail || '',
            });
            setIsSaved(nowSaved);
        } catch (error) {
            console.error('Save error:', error);
        }
    }, [video?.id, video?.title, video?.thumbnail, video?.channelTitle, video?.uploader, video?.channelId, video?.authorId, video?.duration]);

    const handleToggleLike = useCallback(() => {
        if (!video?.id) return;
        try {
            const isNowLiked = toggleLikeVideo({
                videoId: video.id,
                title: video.title || 'Untitled Video',
                thumbnail: video.thumbnail || (video.id ? getThumbnailCascade(video.id, 1) : ''),
                channelTitle: video.channelTitle || video.uploader || 'Creator',
                channelId: video.channelId || video.authorId || '',
                duration: video.duration || '',
            });
            setUserLiked(isNowLiked ? true : null);
        } catch (error) {
            console.error('Like error:', error);
        }
    }, [video?.id, video?.title, video?.thumbnail, video?.channelTitle, video?.uploader, video?.channelId, video?.authorId, video?.duration]);

    const handleToggleDislike = useCallback(() => {
        if (!video?.id) return;
        try {
            if (userLiked === true) {
                toggleLikeVideo({
                    videoId: video.id,
                    title: video.title || 'Untitled Video',
                    thumbnail: video.thumbnail || (video.id ? getThumbnailCascade(video.id, 1) : ''),
                    channelTitle: video.channelTitle || video.uploader || 'Creator',
                    channelId: video.channelId || video.authorId || '',
                    duration: video.duration || '',
                });
            }
            setUserLiked(userLiked === false ? null : false);
        } catch (error) {
            console.error('Dislike error:', error);
        }
    }, [video?.id, video?.title, video?.thumbnail, video?.channelTitle, video?.uploader, video?.channelId, video?.authorId, video?.duration, userLiked]);

    const handleShare = useCallback(async () => {
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                try {
                    await navigator.share({
                        title: video?.title || 'Check out this video',
                        url: window.location.href,
                    });
                    return;
                } catch (shareErr: any) {
                    if (shareErr.name === 'AbortError') return;
                }
            }
            await navigator.clipboard.writeText(window.location.href);
            alert('Link copied to clipboard!');
        } catch (err) {
            alert('Could not share or copy link');
        }
    }, [video?.title]);
    
    if (!video) return null;
    
    const description = video.description || '';
    const hasDescription = description.length > 0;
    const shouldTruncate = description.length > 250;
    const displayDescription = expanded ? description : description.slice(0, 250);
    
    const formatViews = (views: string | number) => {
        if (!views || views === '0' || views === 0) return 'No views';
        const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, '') || '0');
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M views';
        if (num >= 1000) return (num / 1000).toFixed(0) + 'K views';
        return num.toLocaleString() + ' views';
    };

    const formatCount = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
        return n.toString();
    };

    const likesDisplay = ryd ? formatCount(ryd.likes + (userLiked === true ? 1 : 0)) : (video.likeCount ? formatCount(parseInt(String(video.likeCount).replace(/[^0-9]/g, '')) || 0) : 'Like');
    const dislikesDisplay = ryd ? formatCount(ryd.dislikes + (userLiked === false ? 1 : 0)) : 'Dislike';
    const channelAvatarUrl =
        video.channelAvatar ||
        video.authorThumbnails?.[0]?.url ||
        video.authorThumbnail ||
        (video.channelId ? `/api/channel-avatar?id=${encodeURIComponent(video.channelId)}` : '');
    
    return (
        <div style={{ padding: '12px 0 16px' }}>
            {/* 1. Title */}
            <h1 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                margin: '0 0 10px', 
                color: 'var(--yt-text-primary)',
                lineHeight: '1.35',
                letterSpacing: '-0.1px',
            }}>
                {video.title || 'Untitled Video'}
            </h1>
            
            {/* 2. Unified Channel & Actions Row */}
            <div className="watch-meta-container">
                {/* Left: Channel Info & Subscribe */}
                <div className="watch-channel-group">
                    <Link
                        href={video.channelId ? `/channel/${video.channelId}` : `/watch?v=${video.id}`}
                        className="watch-channel-link"
                    >
                        <div
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--yt-hover)',
                                color: 'var(--yt-text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '16px',
                                overflow: 'hidden',
                                position: 'relative',
                                flexShrink: 0,
                            }}
                        >
                            <span>{(video.channelTitle || video.uploader || 'C').charAt(0).toUpperCase()}</span>
                            {channelAvatarUrl && (
                                <img
                                    src={channelAvatarUrl.includes('googleusercontent.com') || channelAvatarUrl.includes('ggpht.com') ? (channelAvatarUrl.startsWith('//') ? 'https:' + channelAvatarUrl : channelAvatarUrl) : (channelAvatarUrl.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(channelAvatarUrl)}` : channelAvatarUrl)}
                                    alt={video.channelTitle}
                                    loading="lazy"
                                    decoding="async"
                                    onError={(e) => {
                                        const img = e.currentTarget as HTMLImageElement;
                                        if (video.channelId && !img.src.includes('/api/channel-avatar?id=')) {
                                            img.src = `/api/channel-avatar?id=${encodeURIComponent(video.channelId)}`;
                                        } else {
                                            img.style.display = 'none';
                                        }
                                    }}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        borderRadius: '50%',
                                    }}
                                />
                            )}
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                            <div style={{ 
                                color: 'var(--yt-text-primary)', 
                                fontWeight: 600, 
                                fontSize: '16px', 
                                lineHeight: '1.25', 
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis' 
                            }}>
                                <span>{video.channelTitle || video.uploader || 'Unknown Channel'}</span>
                                {/* YouTube Verified Checkmark Badge */}
                                <svg className="shrink-0" viewBox="0 0 24 24" width="14" height="14" fill="var(--yt-text-secondary)">
                                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7l-4.2-4.2 1.4-1.4 2.8 2.8 6.8-6.8 1.4 1.4-8.2 8.2z"/>
                                </svg>
                            </div>
                            <div style={{ color: 'var(--yt-text-secondary)', fontSize: '12px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {video.subCountText || (video.subscriberCount ? `${formatViews(video.subscriberCount)} subscribers` : '')}
                            </div>
                        </div>
                    </Link>

                    {/* Join Button (only if channel supports memberships) */}
                    {video?.hasMemberships && (
                        <button
                            type="button"
                            onClick={() => alert('Channel memberships are not currently supported in KV-Tube.')}
                            className="watch-action-pill"
                            style={{ height: '36px', padding: '0 16px', fontSize: '14px', fontWeight: 600 }}
                        >
                            Join
                        </button>
                    )}

                    {/* YouTube Subscribe / Subscribed Pill */}
                    <button 
                        onClick={handleSubscribe}
                        disabled={subscribing}
                        className={`watch-sub-btn ${subscribed ? 'subscribed' : 'unsubscribed'}`}
                    >
                        {subscribing ? (
                            '...'
                        ) : subscribed ? (
                            <>
                                <IoNotificationsOutline size={18} />
                                <span>Subscribed</span>
                                <IoChevronDown size={14} />
                            </>
                        ) : (
                            'Subscribe'
                        )}
                    </button>
                </div>
                
                {/* Right: Action Buttons Strip */}
                <div className="watch-actions-scroll-strip">
                    {/* YouTube Segmented Like/Dislike Capsule */}
                    <div className="watch-like-dislike-pill">
                        <button
                            type="button"
                            onClick={handleToggleLike}
                            className={`watch-like-btn ${userLiked === true ? 'active' : ''}`}
                            title="I like this"
                        >
                            {userLiked === true ? <IoThumbsUp size={18} /> : <IoThumbsUpOutline size={18} />}
                            <span className="watch-like-count">{likesDisplay}</span>
                        </button>

                        <div className="watch-pill-divider" />

                        <button
                            type="button"
                            onClick={handleToggleDislike}
                            className={`watch-dislike-btn ${userLiked === false ? 'active' : ''}`}
                            title="I dislike this"
                        >
                            {userLiked === false ? <IoThumbsDown size={18} /> : <IoThumbsDownOutline size={18} />}
                            {ryd && ryd.dislikes > 0 && <span className="watch-dislike-count">{dislikesDisplay}</span>}
                        </button>
                    </div>

                    {/* Share Button */}
                    <button 
                        onClick={handleShare}
                        className="watch-action-pill"
                        title="Share"
                    >
                        <IoShareSocialOutline size={18} />
                        <span className="watch-btn-text">Share</span>
                    </button>

                    {/* Theater Mode Button */}
                    {onToggleWide && (
                        <button
                            type="button"
                            onClick={onToggleWide}
                            className={`watch-action-pill watch-action-wide ${wideMode ? 'active' : ''}`}
                            title={wideMode ? 'Default view (t)' : 'Theater mode (t)'}
                        >
                            <IoExpandOutline size={18} />
                            <span className="watch-btn-text">{wideMode ? 'Default' : 'Theater'}</span>
                        </button>
                    )}

                    {/* Download Button */}
                    {onOpenDownload && (
                        <button
                            onClick={onOpenDownload}
                            className="watch-action-pill"
                            title="Download Video / Audio"
                        >
                            <IoDownloadOutline size={18} />
                            <span className="watch-btn-text">Download</span>
                        </button>
                    )}
                    
                    {/* Save Button */}
                    <button 
                        onClick={handleSave}
                        className={`watch-action-pill ${isSaved ? 'active' : ''}`}
                        title={isSaved ? 'Remove from saved' : 'Save to playlist'}
                    >
                        {isSaved ? <IoBookmark size={18} /> : <IoBookmarkOutline size={18} />}
                        <span className="watch-btn-text">{isSaved ? 'Saved' : 'Save'}</span>
                    </button>

                    {/* Mix / Radio Button */}
                    {onStartMix && (
                        <button
                            type="button"
                            onClick={onStartMix}
                            className={`watch-action-pill ${isMixActive ? 'active' : ''}`}
                            title={isMixActive ? 'Mix playlist active' : 'Start YouTube Mix'}
                        >
                            <IoRadioOutline size={18} />
                            <span className="watch-btn-text">Mix</span>
                        </button>
                    )}

                    {/* More actions dropdown (•••) */}
                    <div ref={moreMenuRef} style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setShowMoreMenu(prev => !prev)}
                            className="watch-action-pill"
                            style={{ width: '36px', height: '36px', padding: 0, justifyContent: 'center', minWidth: '36px' }}
                            title="More actions"
                        >
                            <IoEllipsisHorizontal size={18} />
                        </button>

                        {showMoreMenu && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '8px',
                                backgroundColor: 'var(--yt-surface)',
                                border: '1px solid var(--yt-border)',
                                borderRadius: '12px',
                                boxShadow: 'var(--yt-shadow-lg)',
                                zIndex: 100,
                                minWidth: '190px',
                                padding: '6px 0',
                                overflow: 'hidden',
                            }}>
                                {onToggleLoop && (
                                    <button
                                        onClick={() => { onToggleLoop(); setShowMoreMenu(false); }}
                                        style={{
                                            width: '100%',
                                            padding: '10px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--yt-text-primary)',
                                            fontSize: '14px',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--yt-hover)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                        <IoRepeat size={18} color={loopMode ? 'var(--yt-blue)' : undefined} />
                                        <span>{loopMode ? 'Disable Loop' : 'Loop Video'}</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        navigator.clipboard?.writeText(window.location.href);
                                        alert('Video link copied to clipboard!');
                                        setShowMoreMenu(false);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--yt-text-primary)',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--yt-hover)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <IoShareSocialOutline size={18} />
                                    <span>Copy Link</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* 3. Description Box */}
            <div 
                onClick={() => !expanded && setExpanded(true)}
                style={{
                    backgroundColor: 'var(--yt-hover)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    marginTop: '12px',
                    cursor: expanded ? 'default' : 'pointer',
                    transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                    if (!expanded) e.currentTarget.style.backgroundColor = 'var(--yt-active)';
                }}
                onMouseLeave={(e) => {
                    if (!expanded) e.currentTarget.style.backgroundColor = 'var(--yt-hover)';
                }}
            >
                {/* Views and Date Header */}
                <div style={{ 
                    display: 'flex', 
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '8px', 
                    marginBottom: '6px', 
                    fontSize: '14px', 
                    fontWeight: '700', 
                    color: 'var(--yt-text-primary)' 
                }}>
                    <span>{formatViews(video.viewCount)}</span>
                    {video.publishedAt && (
                        <span>{formatRelativeTime(video.publishedAt) || video.publishedAt}</span>
                    )}
                    {video.tags && video.tags.slice(0, 3).map((tag: string, i: number) => (
                        <span key={i} style={{ color: 'var(--yt-blue)', fontWeight: '500' }}>#{tag}</span>
                    ))}
                </div>
                
                {/* Description Body with auto-links */}
                {hasDescription ? (
                    <div style={{ 
                        fontSize: '14px', 
                        color: 'var(--yt-text-primary)',
                        lineHeight: '1.45',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}>
                        {expanded ? linkifyText(description) : linkifyText(displayDescription)}
                        {!expanded && shouldTruncate && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded(true);
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--yt-text-primary)',
                                    cursor: 'pointer',
                                    fontWeight: '700',
                                    padding: 0,
                                    marginLeft: '4px',
                                }}
                            >
                                ...more
                            </button>
                        )}
                    </div>
                ) : null}

                {/* Show Less button */}
                {expanded && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(false);
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--yt-text-primary)',
                            cursor: 'pointer',
                            fontWeight: '700',
                            padding: '12px 0 0',
                            fontSize: '14px',
                            display: 'block',
                        }}
                    >
                        Show less
                    </button>
                )}
            </div>
        </div>
    );
}

// Mix Playlist Drawer matching modern YouTube desktop & mobile
function MixPlaylist({ 
    videos, 
    currentIndex, 
    onVideoSelect, 
    title,
    isShuffle,
    onToggleShuffle,
    isLoop,
    onToggleLoop,
    onClose,
}: { 
    videos: VideoData[]; 
    currentIndex: number; 
    onVideoSelect: (video: VideoData, index: number) => void;
    title?: string;
    isShuffle?: boolean;
    onToggleShuffle?: () => void;
    isLoop?: boolean;
    onToggleLoop?: () => void;
    onClose?: () => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const activeItemRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 900);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        if (activeItemRef.current) {
            activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentIndex]);

    const visibleVideos = isMobile && !expanded ? videos.slice(0, 4) : videos;

    return (
        <div className="mix-playlist-container" style={{
            backgroundColor: 'var(--yt-surface)',
            border: '1px solid var(--yt-border)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: 'var(--yt-shadow-sm)',
            marginBottom: '16px',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                backgroundColor: 'var(--yt-hover)',
                borderBottom: '1px solid var(--yt-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
            }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <IoRadioOutline size={16} color="var(--yt-blue)" />
                        <h3 style={{ 
                            fontSize: '14px', 
                            fontWeight: '600', 
                            margin: 0, 
                            color: 'var(--yt-text-primary)', 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis' 
                        }}>
                            {title || 'Mix Playlist'}
                        </h3>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--yt-text-secondary)', margin: '3px 0 0 0' }}>
                        Mixes are playlists YouTube makes for you • {currentIndex >= 0 ? `${currentIndex + 1} / ${videos.length}` : `${videos.length} videos`}
                    </p>
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {onToggleShuffle && (
                        <button
                            type="button"
                            onClick={onToggleShuffle}
                            style={{
                                background: isShuffle ? 'rgba(62, 166, 255, 0.2)' : 'none',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isShuffle ? 'var(--yt-blue)' : 'var(--yt-text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                            title={isShuffle ? 'Shuffle on' : 'Shuffle off'}
                        >
                            <IoShuffle size={18} />
                        </button>
                    )}

                    {onToggleLoop && (
                        <button
                            type="button"
                            onClick={onToggleLoop}
                            style={{
                                background: isLoop ? 'rgba(62, 166, 255, 0.2)' : 'none',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isLoop ? 'var(--yt-blue)' : 'var(--yt-text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                            title={isLoop ? 'Loop on' : 'Loop off'}
                        >
                            <IoRepeat size={18} />
                        </button>
                    )}

                    {isMobile && videos.length > 4 && (
                        <button
                            type="button"
                            onClick={() => setExpanded(prev => !prev)}
                            style={{
                                background: 'none',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--yt-text-secondary)',
                                cursor: 'pointer',
                            }}
                            title={expanded ? 'Collapse' : 'Expand'}
                        >
                            {expanded ? <IoChevronUp size={18} /> : <IoChevronDown size={18} />}
                        </button>
                    )}

                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--yt-text-secondary)',
                                cursor: 'pointer',
                                transition: 'color 0.15s',
                            }}
                            title="Close mix"
                        >
                            <IoClose size={18} />
                        </button>
                    )}
                </div>
            </div>
            
            {/* Video List */}
            <div 
                className="mix-playlist-list" 
                style={{ 
                    maxHeight: isMobile && !expanded ? 'none' : '380px', 
                    overflowY: isMobile && !expanded ? 'visible' : 'auto',
                    backgroundColor: 'var(--yt-background)',
                }}
            >
                {visibleVideos.map((video, index) => {
                    const actualIndex = index;
                    const isCurrent = actualIndex === currentIndex;
                    return (
                        <div 
                            key={`${video.id}-${actualIndex}`}
                            ref={isCurrent ? activeItemRef : undefined}
                            onClick={() => onVideoSelect(video, actualIndex)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                backgroundColor: isCurrent ? 'var(--yt-active)' : 'transparent',
                                borderLeft: isCurrent ? '3px solid var(--yt-blue)' : '3px solid transparent',
                                transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => {
                                if (!isCurrent) {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--yt-hover)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isCurrent) {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                }
                            }}
                        >
                            {/* Track Index or Playing Indicator */}
                            <div style={{ 
                                width: '20px', 
                                textAlign: 'center', 
                                fontSize: '11px', 
                                color: isCurrent ? 'var(--yt-blue)' : 'var(--yt-text-secondary)',
                                fontWeight: isCurrent ? 700 : 400,
                                flexShrink: 0,
                            }}>
                                {isCurrent ? '▶' : actualIndex + 1}
                            </div>

                            {/* Thumbnail with duration */}
                            <div style={{ position: 'relative', width: '96px', height: '54px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden' }}>
                                <img 
                                    src={video.thumbnail ? proxiedImageUrl(video.thumbnail) : getThumbnailCascade(video.id, 1)}
                                    alt={video.title}
                                    loading="lazy"
                                    decoding="async"
                                    style={{ 
                                        width: '100%', 
                                        height: '100%', 
                                        objectFit: 'cover',
                                    }}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = getThumbnailCascade(video.id, 3);
                                    }}
                                />
                                {video.duration && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '2px',
                                        right: '2px',
                                        backgroundColor: 'rgba(0,0,0,0.8)',
                                        color: '#fff',
                                        padding: '1px 4px',
                                        borderRadius: '3px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                    }}>
                                        {video.duration}
                                    </div>
                                )}
                            </div>
                            
                            {/* Track Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ 
                                    fontSize: '12px', 
                                    fontWeight: isCurrent ? '600' : '500',
                                    color: isCurrent ? 'var(--yt-blue)' : 'var(--yt-text-primary)',
                                    lineHeight: '1.3',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}>
                                    {video.title}
                                </div>
                                <div style={{ 
                                    fontSize: '11px', 
                                    color: 'var(--yt-text-secondary)', 
                                    marginTop: '2px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}>
                                    {video.uploader || (video as any).channelTitle || 'Unknown'}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Mobile Expand / Collapse Bar */}
            {isMobile && videos.length > 4 && (
                <button
                    type="button"
                    onClick={() => setExpanded(prev => !prev)}
                    style={{
                        width: '100%',
                        padding: '8px',
                        background: 'none',
                        border: 'none',
                        borderTop: '1px solid var(--yt-border)',
                        color: 'var(--yt-blue)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                    }}
                >
                    {expanded ? 'Show less' : `Show all (${videos.length} videos)`}
                </button>
            )}
        </div>
    );
}

// Comment Section - lazy loaded (TypeType pattern: heavy components behind React.lazy)
function CommentSectionInner({ videoId }: { videoId: string }) {
    const [comments, setComments] = useState<any[]>([]);
    const [continuation, setContinuation] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [visibleCount, setVisibleCount] = useState(12);
    const [newComment, setNewComment] = useState('');
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});

    useEffect(() => {
        let isCancelled = false;
        const loadComments = async () => {
            setLoading(true);
            try {
                const res = await getCommentsPageClient(videoId, undefined, 40);
                if (isCancelled) return;
                setComments(res.comments);
                setContinuation(res.continuation);
            } catch (error) {
                if (!isCancelled) console.error('Failed to load comments:', error);
            } finally {
                if (!isCancelled) setLoading(false);
            }
        };
        loadComments();
        return () => {
            isCancelled = true;
        };
    }, [videoId]);

    const toggleReplies = (id: string) => {
        setExpandedReplies(prev => ({ ...prev, [id]: !prev[id] }));
    };

    if (loading) {
        return (
            <div style={{ padding: '24px 0', color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
                Loading comments...
            </div>
        );
    }

    const displayedComments = comments.slice(0, visibleCount);
    const hasMore = visibleCount < comments.length;

    return (
        <div style={{ padding: '24px 0 32px' }}>
            {/* Header with count and Sort by */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: 'var(--yt-text-primary)' }}>
                    {comments.length} Comments
                </h2>
                <button style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--yt-text-primary)',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    padding: '6px 10px',
                    borderRadius: '18px',
                }}>
                    <MdSort size={22} />
                    <span>Sort by</span>
                </button>
            </div>

            {/* Interactive Add a Comment Box */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--yt-hover)',
                    color: 'var(--yt-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '16px',
                    flexShrink: 0,
                }}>
                    U
                </div>
                <div style={{ flex: 1 }}>
                    <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onFocus={() => setIsInputFocused(true)}
                        placeholder="Add a comment..."
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: isInputFocused ? '2px solid var(--yt-text-primary)' : '1px solid var(--yt-border)',
                            outline: 'none',
                            padding: '4px 0 8px',
                            color: 'var(--yt-text-primary)',
                            fontSize: '14px',
                            transition: 'border-color 0.2s',
                        }}
                    />
                    {(isInputFocused || newComment.length > 0) && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                            <button
                                onClick={() => { setNewComment(''); setIsInputFocused(false); }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: '18px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: 'var(--yt-text-primary)',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (!newComment.trim()) return;
                                    setComments(prev => [
                                        {
                                            id: `local-${Date.now()}`,
                                            author: 'You',
                                            text: newComment,
                                            timestamp: 'Just now',
                                            likes: 0,
                                        },
                                        ...prev,
                                    ]);
                                    setNewComment('');
                                    setIsInputFocused(false);
                                }}
                                disabled={!newComment.trim()}
                                style={{
                                    backgroundColor: newComment.trim() ? 'var(--yt-blue)' : 'var(--yt-hover)',
                                    color: newComment.trim() ? '#ffffff' : 'var(--yt-text-secondary)',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: '18px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                                }}
                            >
                                Comment
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Comments List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {displayedComments.map((comment) => (
                    <div key={comment.id} style={{ display: 'flex', gap: '16px' }}>
                        {comment.author_thumbnail ? (
                            <img 
                                src={comment.author_thumbnail}
                                alt={comment.author}
                                loading="lazy"
                                decoding="async"
                                style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--yt-hover)', flexShrink: 0, objectFit: 'cover' }}
                            />
                        ) : (
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--yt-hover)',
                                color: 'var(--yt-text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '15px',
                                flexShrink: 0,
                            }}>
                                {(comment.author || 'A').charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--yt-text-primary)' }}>
                                    @{comment.author?.replace(/\s+/g, '')}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                                    {comment.timestamp}
                                </span>
                            </div>
                            <div style={{ fontSize: '14px', color: 'var(--yt-text-primary)', marginTop: '4px', lineHeight: '1.45', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {comment.text}
                            </div>
                            {/* Actions: Thumbs Up, Thumbs Down, Reply */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '8px' }}>
                                <button style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--yt-text-primary)',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    padding: '4px',
                                }}>
                                    <IoThumbsUpOutline size={16} />
                                    {comment.likes > 0 && <span>{comment.likes}</span>}
                                </button>
                                <button style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--yt-text-primary)',
                                    padding: '4px',
                                }}>
                                    <IoThumbsDownOutline size={16} />
                                </button>
                                <button style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--yt-text-primary)',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                }}>
                                    Reply
                                </button>
                            </div>
                            {/* Nested Replies toggle */}
                            {(comment.replies?.length > 0 || comment.reply_count > 0) && (
                                <button
                                    onClick={() => toggleReplies(comment.id)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--yt-blue)',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        padding: '4px 8px',
                                        borderRadius: '16px',
                                        marginTop: '6px',
                                    }}
                                >
                                    {expandedReplies[comment.id] ? <IoChevronUp size={16} /> : <IoChevronDown size={16} />}
                                    <span>{comment.replies?.length || comment.reply_count} replies</span>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            
            {(hasMore || !!continuation) && (
                <button
                    onClick={async () => {
                        if (visibleCount < comments.length) {
                            setVisibleCount(prev => prev + 8);
                        } else if (continuation && !loadingMore) {
                            setLoadingMore(true);
                            try {
                                const res = await getCommentsPageClient(videoId, continuation, 30);
                                if (res.comments.length > 0) {
                                    setComments(prev => [...prev, ...res.comments]);
                                    setContinuation(res.continuation);
                                    setVisibleCount(prev => prev + res.comments.length);
                                } else {
                                    setContinuation(undefined);
                                }
                            } catch (e) {
                                console.error('Failed to load more comments:', e);
                            } finally {
                                setLoadingMore(false);
                            }
                        }
                    }}
                    disabled={loadingMore}
                    style={{
                        marginTop: '20px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--yt-blue)',
                        cursor: loadingMore ? 'default' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        padding: '8px 0',
                    }}
                >
                    {loadingMore ? 'Loading more comments...' : 'Show more comments'}
                </button>
            )}
        </div>
    );
}

function CommentSection({ videoId }: { videoId: string }) {
    return (
        <Suspense fallback={
            <div style={{ padding: '24px 0', color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
                Loading comments...
            </div>
        }>
            <CommentSectionInner videoId={videoId} />
        </Suspense>
    );
}

export default function ClientWatchPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const paramVideoId = searchParams.get('v');
    const [activeVideoId, setActiveVideoId] = useState<string | null>(paramVideoId);
    const videoId = activeVideoId || paramVideoId;
    const playlistId = searchParams.get('list');
    const chipBarRef = useRef<HTMLDivElement>(null);
    const { currentVideo, setPlayingVideo, setIsPlaying, loopMode, setLoopMode, watchHandlersRef } = usePlayer();
    const [videoInfo, setVideoInfo] = useState<any>(null);
    const [relatedVideos, setRelatedVideos] = useState<VideoData[]>([]);
    const [mixPlaylist, setMixPlaylist] = useState<VideoData[]>([]);
    const [mixTitle, setMixTitle] = useState<string>('');
    const [isShuffle, setIsShuffle] = useState(false);
    const [isMixLoop, setIsMixLoop] = useState(false);
    const [isMixDismissed, setIsMixDismissed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [apiError, setApiError] = useState<string | null>(null);
    const [wideMode, setWideMode] = useState(false);
    const [showDownload, setShowDownload] = useState(false);
    const [selectedChip, setSelectedChip] = useState('All');

    const handleStartMix = useCallback(() => {
        if (!videoId) return;
        setIsMixDismissed(false);
        const mixListId = playlistId || `RD${videoId}`;
        const newUrl = `/watch?v=${videoId}&list=${mixListId}&start_radio=1`;
        window.history.pushState({ videoId }, '', newUrl);

        if (mixPlaylist.length > 0) {
            const el = document.querySelector('.mix-playlist-container');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        fetch(`/api/mix/${encodeURIComponent(videoId)}?list=${encodeURIComponent(mixListId)}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && Array.isArray(data.videos) && data.videos.length > 0) {
                    setMixPlaylist(data.videos);
                    setMixTitle(data.title || `Mix - ${videoInfo?.title || 'YouTube'}`);
                    const found = data.videos.findIndex((v: any) => v.id === videoId);
                    setCurrentIndex(found >= 0 ? found : 0);
                    setIsMixDismissed(false);
                }
            })
            .catch(err => console.warn('Failed to start mix:', err));
    }, [videoId, playlistId, videoInfo?.title, mixPlaylist.length]);

    // Sync activeVideoId when external route changes (e.g. from Search or Header)
    useEffect(() => {
        if (paramVideoId && paramVideoId !== activeVideoId) {
            setActiveVideoId(paramVideoId);
        }
    }, [paramVideoId]);

    // Handle browser back/forward buttons smoothly
    useEffect(() => {
        const handlePopState = () => {
            const v = new URLSearchParams(window.location.search).get('v');
            if (v) {
                setActiveVideoId(v);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Keyboard shortcut: 't' toggles Theater Mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
            if ((e.target as HTMLElement)?.isContentEditable) return;
            if (e.key.toLowerCase() === 't') {
                e.preventDefault();
                setWideMode(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Hover prefetch: debounce 120ms, prefetch Next.js route AND warm Invidious video cache
    const prefetchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const prefetched = useRef<Set<string>>(new Set());

    const handlePrefetchEnter = useCallback((vidId: string) => {
        const timer = setTimeout(() => {
            if (!prefetched.current.has(vidId)) {
                prefetched.current.add(vidId);
                router.prefetch(`/watch?v=${vidId}`);
                invidious.getVideo(vidId).catch(() => {});
            }
        }, 120);
        prefetchTimers.current.set(vidId, timer);
    }, [router]);

    const handlePrefetchLeave = useCallback((vidId: string) => {
        const timer = prefetchTimers.current.get(vidId);
        if (timer) {
            clearTimeout(timer);
            prefetchTimers.current.delete(vidId);
        }
    }, []);

    // Scroll to top when video changes or page loads
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [videoId]);

    useEffect(() => {
        if (!videoId) return;

        const loadVideoData = async () => {
            let keywords = '';
            let firstWords = '';
            try {
                setLoading(true);
                setApiError(null);

                // Only initialize empty video if not already populated with optimistic data from card click
                if ((!videoInfo || videoInfo.id !== videoId) && (!currentVideo || currentVideo.id !== videoId)) {
                    setPlayingVideo({
                        id: videoId,
                        title: '',
                        uploader: '',
                        thumbnail: getThumbnailCascade(videoId, 1),
                        duration: '',
                    });
                }

                const startIdx = Math.max(0, parseInt(searchParams.get('idx') || '0', 10) || 0);
                if (currentIndex < 0) {
                    setCurrentIndex(startIdx);
                }

                setIsMixDismissed(false);
                const mixListId = playlistId || `RD${videoId}`;
                const isAlreadyInMix = mixPlaylist.length > 0 && mixPlaylist.some((v: any) => v.id === videoId);

                const [video, upNextResult, mixData] = await Promise.all([
                    getOrFetchData(`video_${videoId}`, () => getVideoDetailsClient(videoId)),
                    getOrFetchData(`related_${videoId}`, () => getRelatedVideosClient(videoId, 20)),
                    !isAlreadyInMix
                        ? getOrFetchData(`mix_${videoId}_${mixListId}`, async () => {
                            try {
                                const res = await fetch(`/api/mix/${encodeURIComponent(videoId)}?list=${encodeURIComponent(mixListId)}`);
                                if (res.ok) {
                                    const json = await res.json();
                                    if (json && Array.isArray(json.videos) && json.videos.length > 0) {
                                        return json;
                                    }
                                }
                            } catch (e) {
                                console.warn('Mix fetch failed:', e);
                            }
                            return null;
                        })
                        : Promise.resolve(null),
                ]);
                setVideoInfo(video);

                if (video) {
                    setPlayingVideo({
                        id: videoId,
                        title: video.title || 'Untitled Video',
                        uploader: video.uploader || video.channelTitle || '',
                        thumbnail: video.thumbnail || '',
                        duration: video.duration || '',
                    });
                    setIsPlaying(true);
                    addToHistory({
                        videoId: videoId,
                        title: video.title || 'Untitled Video',
                        thumbnail: video.thumbnail || getThumbnailCascade(videoId, 1),
                        channelTitle: video.uploader || video.channelTitle || 'Creator',
                        channelId: (video as any).channelId || video.channel_id || '',
                        duration: video.duration || '',
                        viewCount: typeof video.view_count === 'number' ? video.view_count : (parseInt(String(video.view_count || video.viewCount || '0').replace(/[^0-9]/g, '')) || 0),
                        uploadDate: video.upload_date || video.publishedAt || '',
                    });
                    invidious.addAuthHistory(videoId).catch(() => {});
                }

                let uniqueRelated = (Array.isArray(upNextResult) ? upNextResult : [])
                    .filter((v, i, self) =>
                        i === self.findIndex(item => item.id === v.id) && v.id !== videoId
                    );

                if (isAlreadyInMix) {
                    const foundIdx = mixPlaylist.findIndex((v: any) => v.id === videoId);
                    if (foundIdx >= 0) {
                        setCurrentIndex(foundIdx);
                    }
                    setRelatedVideos(uniqueRelated);
                } else if (mixData && Array.isArray(mixData.videos) && mixData.videos.length > 0) {
                    setMixPlaylist(mixData.videos);
                    setMixTitle(mixData.title || `Mix - ${video?.title || 'YouTube'}`);
                    const foundIdx = mixData.videos.findIndex((v: any) => v.id === videoId);
                    if (foundIdx >= 0) {
                        setCurrentIndex(foundIdx);
                    } else if (currentIndex < 0) {
                        setCurrentIndex(startIdx);
                    }
                    setRelatedVideos(uniqueRelated);
                } else {
                    // Fallback to related-derived mix if API unavailable
                    keywords = titleKeywords(video?.title || '');
                    const channel = video?.channelTitle || video?.uploader || '';
                    firstWords = keywords.split(' ').slice(0, 3).join(' ');
                    const exclude = new Set<string>([videoId]);
                    const mixQueries = [
                        keywords ? `${keywords} mix` : '',
                        channel ? `${channel} playlist` : '',
                        firstWords ? `${firstWords} playlist` : '',
                    ];
                    try {
                        const mixResults = await getOrFetchData(`mix_${videoId}`, () => searchWithFallback(mixQueries, 10, 20, exclude));
                        let uniqueMix = mixArrFilter(mixResults, videoId, uniqueRelated);
                        if (uniqueMix.length > 0) {
                            setMixPlaylist(uniqueMix.slice(0, 30));
                            setMixTitle(`Mix - ${video?.title || 'Playlist'}`);
                        } else {
                            setMixPlaylist([]);
                            setMixTitle('');
                        }
                    } catch {
                        setMixPlaylist([]);
                        setMixTitle('');
                    }
                    setRelatedVideos(uniqueRelated);
                }

                if (!video) {
                    setApiError('Video info unavailable, but you can still browse related videos.');
                }
            } catch (error) {
                console.error('Failed to load video data:', error);
                try {
                    const fallbackQueries = [
                        keywords ? `${keywords} video` : 'music popular',
                        firstWords ? `${firstWords} mix` : 'music popular',
                    ];
                    const fallbackResults = await searchWithFallback(fallbackQueries, 20, 20, new Set<string>([videoId]));
                    const arr = Array.isArray(fallbackResults) ? fallbackResults : [];
                    if (playlistId) {
                        setRelatedVideos(arr.slice(0, 10));
                        setMixPlaylist(arr.slice(10, 20));
                    } else {
                        setRelatedVideos(arr);
                        setMixPlaylist([]);
                    }
                    setApiError('Unable to load video details. Showing suggested videos instead.');
                } catch {
                    setRelatedVideos([]);
                    setMixPlaylist([]);
                    setApiError('Unable to load content. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };

        loadVideoData();
    }, [videoId, playlistId]);

    const handleVideoSelect = useCallback((videoOrIndex: VideoData | number, maybeIndex?: number) => {
        let selectedVideo: VideoData | undefined;
        let selectedIndex = typeof maybeIndex === 'number' ? maybeIndex : -1;

        if (typeof videoOrIndex === 'number') {
            selectedIndex = videoOrIndex;
            selectedVideo = mixPlaylist[videoOrIndex] || relatedVideos[videoOrIndex];
        } else {
            selectedVideo = videoOrIndex;
            if (typeof maybeIndex === 'number') selectedIndex = maybeIndex;
        }

        if (!selectedVideo?.id) return;
        const newId = selectedVideo.id;

        // 1. Instantly update the player in PlayerContext with card metadata (0ms latency!)
        setPlayingVideo({
            id: newId,
            title: selectedVideo.title || '',
            uploader: selectedVideo.uploader || selectedVideo.channelTitle || '',
            thumbnail: selectedVideo.thumbnail || getThumbnailCascade(newId, 1),
            duration: selectedVideo.duration || '',
        });
        setIsPlaying(true);

        // 2. Instantly update optimistic video metadata on the watch page
        setVideoInfo(selectedVideo);
        setActiveVideoId(newId);
        if (selectedIndex >= 0) {
            setCurrentIndex(selectedIndex);
        }

        // 3. Shallow URL update with history state - 0ms router latency, no server RSC roundtrip
        const activeList = playlistId || (mixPlaylist.length > 0 ? (searchParams.get('list') || `RD${newId}`) : '');
        const newUrl = `/watch?v=${newId}${selectedIndex >= 0 ? `&idx=${selectedIndex}` : ''}${activeList ? `&list=${activeList}` : ''}`;
        window.history.pushState({ videoId: newId }, '', newUrl);

        // 4. Scroll smoothly to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [mixPlaylist, relatedVideos, playlistId, searchParams, setPlayingVideo, setIsPlaying]);

    const handlePrevious = useCallback(() => {
        if (mixPlaylist.length > 0) {
            if (currentIndex > 0) {
                const prevVideo = mixPlaylist[currentIndex - 1];
                if (prevVideo) {
                    handleVideoSelect(prevVideo, currentIndex - 1);
                }
            }
            return;
        }

        if (currentIndex > 0) {
            const prevVideo = relatedVideos[currentIndex - 1];
            if (prevVideo) {
                handleVideoSelect(prevVideo, currentIndex - 1);
            }
        }
    }, [currentIndex, mixPlaylist, relatedVideos, handleVideoSelect]);

    const handleNext = useCallback(() => {
        if (mixPlaylist.length > 0) {
            if (isShuffle) {
                const available = mixPlaylist.map((_, i) => i).filter(i => i !== currentIndex);
                if (available.length > 0) {
                    const randIdx = available[Math.floor(Math.random() * available.length)];
                    handleVideoSelect(mixPlaylist[randIdx], randIdx);
                    return;
                }
            }
            if (currentIndex < mixPlaylist.length - 1) {
                const nextVideo = mixPlaylist[currentIndex + 1];
                if (nextVideo) {
                    handleVideoSelect(nextVideo, currentIndex + 1);
                }
            } else if (isMixLoop || loopMode) {
                handleVideoSelect(mixPlaylist[0], 0);
            }
            return;
        }

        if (currentIndex < relatedVideos.length - 1) {
            const nextVideo = relatedVideos[currentIndex + 1];
            if (nextVideo) {
                handleVideoSelect(nextVideo, currentIndex + 1);
            }
        }
    }, [currentIndex, mixPlaylist, relatedVideos, isShuffle, isMixLoop, loopMode, handleVideoSelect]);

    const handleVideoEnd = useCallback(() => {
        if (loopMode && mixPlaylist.length === 0) {
            return;
        }
        if (mixPlaylist.length > 0) {
            handleNext();
            return;
        }
        if (currentIndex < relatedVideos.length - 1) {
            handleNext();
        }
    }, [loopMode, mixPlaylist.length, currentIndex, handleNext, relatedVideos.length]);

    watchHandlersRef.current = {
        onNext: handleNext,
        onPrev: handlePrevious,
        onVideoEnd: handleVideoEnd,
        onError: () => {
            console.warn('[Watch] player error');
        },
        loopMode,
    };

    // Extract dynamic topic filter chips from video metadata
    const filterChips = useMemo(() => {
        const list = ['All'];
        const channel = videoInfo?.channelTitle || videoInfo?.uploader;
        if (channel) list.push(`From ${channel}`);
        if (Array.isArray(videoInfo?.tags)) {
            list.push(...videoInfo.tags.slice(0, 3));
        }
        list.push('Related', 'Recently uploaded');
        return Array.from(new Set(list));
    }, [videoInfo?.channelTitle, videoInfo?.uploader, videoInfo?.tags]);

    // Filter related videos by chip
    const filteredRelated = useMemo(() => {
        if (selectedChip === 'All') return relatedVideos;
        const q = selectedChip.toLowerCase().replace('from ', '');
        const filtered = relatedVideos.filter(v =>
            (v.title && v.title.toLowerCase().includes(q)) ||
            (v.uploader && v.uploader.toLowerCase().includes(q))
        );
        return filtered.length > 0 ? filtered : relatedVideos;
    }, [selectedChip, relatedVideos]);

    if (!videoId) {
        return <div style={{ padding: '2rem', color: 'var(--yt-text-primary)' }}>No video ID provided</div>;
    }

    return (
        <div style={{ 
            backgroundColor: 'var(--yt-background)', 
            color: 'var(--yt-text-primary)', 
            minHeight: '100vh',
        }}>
            {/* YouTube Theater Mode Top Player Banner */}
            {wideMode && (
                <div style={{ width: '100%', backgroundColor: '#000000', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '1750px', aspectRatio: '16/9', maxHeight: 'calc(100vh - 169px)', position: 'relative' }}>
                        <div id="watch-player-slot" style={{ width: '100%', height: '100%' }} />
                    </div>
                </div>
            )}

            <div className="watch-page-container" style={{ 
                maxWidth: '1750px', 
                width: '100%',
                margin: '0 auto',
                padding: '24px',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 402px',
                gap: '24px',
                boxSizing: 'border-box',
            }}>
                {/* Main Content (Player, Info, Comments) */}
                <div className="watch-main" style={{ minWidth: 0 }}>
                    {/* Video Player in Default (non-theater) mode */}
                    {!wideMode && (
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', backgroundColor: '#000000', borderRadius: '16px', overflow: 'hidden' }}>
                            <div id="watch-player-slot" style={{ width: '100%', height: '100%' }} />
                        </div>
                    )}

                    {/* Video Info and Comments Body */}
                    <div className="watch-main-body" style={{ width: '100%' }}>
                        <VideoInfo
                            video={videoInfo}
                            onOpenDownload={() => setShowDownload(true)}
                            onPrevious={handlePrevious}
                            onNext={handleNext}
                            hasPrevious={currentIndex > 0}
                            hasNext={currentIndex < (mixPlaylist.length > 0 ? mixPlaylist.length - 1 : relatedVideos.length - 1)}
                            loopMode={loopMode}
                            onToggleLoop={() => setLoopMode(!loopMode)}
                            wideMode={wideMode}
                            onToggleWide={() => setWideMode(!wideMode)}
                            onStartMix={handleStartMix}
                            isMixActive={mixPlaylist.length > 0 && !isMixDismissed}
                        />

                        {/* Comments */}
                        <CommentSection videoId={videoId} />
                    </div>
                </div>

                {/* Sidebar (Mix Playlist, Topic Chips, Related Videos Stream) */}
                <div className="watch-sidebar" style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxSizing: 'border-box',
                }}>
                    {/* Mix Playlist Drawer at top of sidebar (exact YouTube desktop layout) */}
                    {mixPlaylist.length > 0 && !isMixDismissed && (
                        <div style={{ width: '100%' }}>
                            <MixPlaylist 
                                videos={mixPlaylist}
                                currentIndex={currentIndex}
                                onVideoSelect={handleVideoSelect}
                                title={mixTitle || (videoInfo?.title ? `Mix - ${videoInfo.title}` : 'Mix Playlist')}
                                isShuffle={isShuffle}
                                onToggleShuffle={() => setIsShuffle(prev => !prev)}
                                isLoop={isMixLoop}
                                onToggleLoop={() => setIsMixLoop(prev => !prev)}
                                onClose={() => setIsMixDismissed(true)}
                            />
                        </div>
                    )}

                    {/* Topic Filter Chips with YouTube Scroll Arrow */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                        <div ref={chipBarRef} className="yt-chip-bar" style={{ flex: 1 }}>
                            {filterChips.map((chip) => (
                                <button
                                    key={chip}
                                    onClick={() => setSelectedChip(chip)}
                                    className={`yt-filter-chip ${selectedChip === chip ? 'active' : ''}`}
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (chipBarRef.current) {
                                    chipBarRef.current.scrollBy({ left: 160, behavior: 'smooth' });
                                }
                            }}
                            className="yt-chip-scroll-btn"
                            title="Next chips"
                            aria-label="Next chips"
                            style={{
                                background: 'var(--yt-hover)',
                                border: 'none',
                                color: 'var(--yt-text-primary)',
                                cursor: 'pointer',
                                padding: '6px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginLeft: '6px',
                                transition: 'background-color 0.15s',
                            }}
                        >
                            <IoChevronForward size={16} />
                        </button>
                    </div>

                    {/* API Error Message */}
                    {apiError && (
                        <div style={{
                            padding: '10px',
                            backgroundColor: 'rgba(255, 0, 0, 0.1)',
                            border: '1px solid rgba(255, 0, 0, 0.2)',
                            borderRadius: '8px',
                            color: 'var(--yt-text-secondary)',
                            fontSize: '12px',
                            textAlign: 'center',
                        }}>
                            {apiError}
                        </div>
                    )}

                    {/* YouTube Free-Flowing Related Videos Stream (168px x 94px) */}
                    <div className="yt-related-list">
                        {/* Fallback Mix Card when drawer was closed/dismissed */}
                        {mixPlaylist.length > 0 && isMixDismissed && (
                            <div 
                                onClick={() => {
                                    setIsMixDismissed(false);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="yt-related-card"
                                style={{ 
                                    cursor: 'pointer',
                                    border: '1px solid var(--yt-border)',
                                    borderRadius: '10px',
                                    padding: '8px',
                                    marginBottom: '6px',
                                    backgroundColor: 'var(--yt-surface)',
                                }}
                            >
                                <div className="yt-related-thumb-container" style={{ position: 'relative' }}>
                                    <img 
                                        src={mixPlaylist[0]?.thumbnail ? proxiedImageUrl(mixPlaylist[0].thumbnail) : getThumbnailCascade(videoId, 0)}
                                        alt={mixTitle || 'Mix Playlist'}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        backgroundColor: 'rgba(0, 0, 0, 0.82)',
                                        color: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                    }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <IoPlay size={12} color="var(--yt-blue)" /> Mix
                                        </span>
                                        <span>25+ tracks</span>
                                    </div>
                                </div>
                                <div className="yt-related-info">
                                    <h4 className="yt-related-title" title={mixTitle || 'Mix Playlist'}>
                                        {mixTitle || `Mix - ${videoInfo?.title || 'YouTube'}`}
                                    </h4>
                                    <div className="yt-related-channel">YouTube</div>
                                    <div className="yt-related-meta">Mixes are playlists YouTube makes for you</div>
                                </div>
                            </div>
                        )}
                        {filteredRelated.slice(0, 35).map((video, index) => (
                            <Link 
                                key={`${video.id}-${index}`}
                                href={`/watch?v=${video.id}&idx=${index}`}
                                onClick={(e) => {
                                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                                        e.preventDefault();
                                        handleVideoSelect(video, index);
                                    }
                                }}
                                onMouseEnter={() => handlePrefetchEnter(video.id)}
                                onMouseLeave={() => handlePrefetchLeave(video.id)}
                                className={`yt-related-card ${videoId === video.id ? 'active' : ''}`}
                            >
                                {/* Thumbnail Container (168px x 94px) */}
                                <div className="yt-related-thumb-container">
                                    <img 
                                        src={video.thumbnail ? proxiedImageUrl(video.thumbnail) : getThumbnailCascade(video.id, 0)}
                                        alt={video.title}
                                        loading="lazy"
                                        decoding="async"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = getThumbnailCascade(video.id, 1);
                                        }}
                                    />
                                    {video.duration && (
                                        <div className="yt-related-duration">
                                            {video.duration}
                                        </div>
                                    )}
                                </div>

                                {/* Metadata Details */}
                                <div className="yt-related-info">
                                    <h4 className="yt-related-title" title={video.title}>
                                        {video.title}
                                    </h4>
                                    <div className="yt-related-channel">
                                        <span>{video.uploader}</span>
                                        <svg className="shrink-0" viewBox="0 0 24 24" width="12" height="12" fill="var(--yt-text-secondary)">
                                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7l-4.2-4.2 1.4-1.4 2.8 2.8 6.8-6.8 1.4 1.4-8.2 8.2z"/>
                                        </svg>
                                    </div>
                                    <div className="yt-related-meta">
                                        {video.view_count ? `${typeof video.view_count === 'number' ? (video.view_count >= 1000000 ? (video.view_count / 1000000).toFixed(1) + 'M' : video.view_count >= 1000 ? (video.view_count / 1000).toFixed(0) + 'K' : video.view_count) : video.view_count} views • ` : ''}
                                        {formatRelativeTime(video.upload_date) || video.upload_date || 'Recently'}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* Download sheet */}
            {showDownload && (
                <DownloadSheet
                    videoId={videoId}
                    title={videoInfo?.title}
                    onClose={() => setShowDownload(false)}
                />
            )}

            {/* Responsive styles */}
            <style jsx>{`
                @media (max-width: 1024px) {
                    .watch-page-container {
                        grid-template-columns: 1fr !important;
                        padding: 0 12px 80px !important;
                        gap: 16px !important;
                    }
                    .watch-sidebar {
                        width: 100% !important;
                    }
                }
            `}</style>
        </div>
    );
}