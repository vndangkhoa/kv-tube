'use client';

import { useEffect, useState, useCallback, lazy, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DownloadSheet from './DownloadSheet';
import { getVideoDetailsClient, getRelatedVideosClient, getCommentsClient, searchVideosClient } from '../clientActions';
import { VideoData } from '../constants';
import { proxiedThumb, proxiedImageUrl } from '../utils';
import { isVideoSaved, toggleSaveVideo, addToHistory, isSubscribed, toggleSubscription } from '../storage';
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
    IoThumbsDownOutline,
    IoShareSocialOutline,
    IoBookmarkOutline,
    IoBookmark,
    IoDownloadOutline,
    IoPlaySkipBack,
    IoPlaySkipForward,
    IoRepeat,
    IoExpandOutline,
} from 'react-icons/io5';

// Video Info Section with Material 3 & Return YouTube Dislike (RYD)
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
}) {
    const [expanded, setExpanded] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [ryd, setRyd] = useState<RYDData | null>(null);
    const [userLiked, setUserLiked] = useState<boolean | null>(null);
    const { adaptToThumbnail } = useTheme();

    // Fetch subscription, saved state, RYD dislikes, record history, and adapt theme to thumbnail
    useEffect(() => {
        if (video?.channelId) {
            setSubscribed(isSubscribed(video.channelId));
        }
        if (video?.id) {
            setIsSaved(isVideoSaved(video.id));
            fetchDislikes(video.id).then(data => setRyd(data)).catch(() => {});
            addToHistory({
                videoId: video.id,
                title: video.title || 'Untitled Video',
                thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`,
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
                channelName: video.channelTitle || video.channelId,
                channelAvatar: video.channelAvatar || '',
            });
            setSubscribed(next);
            if (next) {
                invidious.pushSubscriptionToInvidious(video.channelId).catch(() => {});
            }
        } catch (error) {
            console.error('Subscribe error:', error);
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
                channelTitle: video.channelTitle || '',
                thumbnail: video.thumbnail || '',
            });
            setIsSaved(nowSaved);
        } catch (error) {
            console.error('Save error:', error);
        }
    }, [video?.id, video?.title, video?.thumbnail, video?.channelTitle]);
    
    if (!video) return null;
    
    const description = video.description || '';
    const hasDescription = description.length > 0;
    const shouldTruncate = description.length > 300;
    const displayDescription = expanded ? description : description.slice(0, 300) + (shouldTruncate ? '...' : '');
    
    // Format view count
    const formatViews = (views: string | number) => {
        if (!views || views === '0' || views === 0) return 'No views';
        const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, '') || '0');
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M views';
        if (num >= 1000) return (num / 1000).toFixed(0) + 'K views';
        return num.toLocaleString() + ' views';
    };

    const formatCount = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    };

    const likesDisplay = ryd ? formatCount(ryd.likes + (userLiked === true ? 1 : 0)) : (video.likeCount || 'Like');
    const dislikesDisplay = ryd ? formatCount(ryd.dislikes + (userLiked === false ? 1 : 0)) : 'Dislike';
    const likeRatio = ryd && (ryd.likes + ryd.dislikes > 0) ? (ryd.likes / (ryd.likes + ryd.dislikes)) * 100 : 95;
    const channelAvatarUrl =
        video.channelAvatar ||
        video.authorThumbnails?.[0]?.url ||
        video.authorThumbnail ||
        (video.channelId ? `/api/channel-avatar?id=${encodeURIComponent(video.channelId)}` : '');
    
    return (
        <div style={{ padding: '8px 0 16px' }}>
            {/* 1. Title */}
            <h1 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                margin: '8px 0 14px', 
                color: 'var(--yt-text-primary)',
                lineHeight: '1.35',
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
                            <div style={{ color: 'var(--yt-text-primary)', fontWeight: 600, fontSize: '15px', lineHeight: '1.2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {video.channelTitle || video.uploader || 'Unknown Channel'}
                            </div>
                            <div style={{ color: 'var(--yt-text-secondary)', fontSize: '12px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {video.subCountText || (video.subscriberCount ? `${formatViews(video.subscriberCount)} subscribers` : '')}
                            </div>
                        </div>
                    </Link>

                    {/* Subscribe Button */}
                    <button 
                        onClick={handleSubscribe}
                        disabled={subscribing}
                        className={`watch-sub-btn ${subscribed ? 'subscribed' : 'unsubscribed'}`}
                    >
                        {subscribing ? '...' : subscribed ? 'Subscribed' : 'Subscribe'}
                    </button>
                </div>
                
                {/* Right: Unified Action Buttons Strip */}
                <div className="watch-actions-scroll-strip">
                    {/* Material 3 Like/Dislike Combo Pill (RYD Integrated) */}
                    <div className="watch-like-dislike-pill">
                        {/* Like Section */}
                        <button
                            type="button"
                            onClick={() => setUserLiked(userLiked === true ? null : true)}
                            className={`watch-like-btn ${userLiked === true ? 'active' : ''}`}
                            title="I like this"
                        >
                            <IoThumbsUpOutline size={16} />
                            <span className="watch-like-count">{likesDisplay}</span>
                        </button>

                        {/* Divider */}
                        <div className="watch-pill-divider" />

                        {/* Dislike Section (RYD) */}
                        <button
                            type="button"
                            onClick={() => setUserLiked(userLiked === false ? null : false)}
                            className={`watch-dislike-btn ${userLiked === false ? 'active' : ''}`}
                            title="I dislike this"
                        >
                            <IoThumbsDownOutline size={16} />
                            <span className="watch-dislike-count">{dislikesDisplay}</span>
                        </button>
                    </div>

                    {/* Previous Button */}
                    {onPrevious && (
                        <button
                            onClick={onPrevious}
                            disabled={!hasPrevious}
                            className="watch-action-pill"
                            style={{ opacity: hasPrevious ? 1 : 0.4, cursor: hasPrevious ? 'pointer' : 'not-allowed' }}
                            title="Previous video"
                        >
                            <IoPlaySkipBack size={15} />
                            <span className="watch-btn-text">Prev</span>
                        </button>
                    )}

                    {/* Next Button */}
                    {onNext && (
                        <button
                            onClick={onNext}
                            disabled={!hasNext}
                            className={`watch-action-pill ${hasNext ? 'active' : ''}`}
                            style={{ opacity: hasNext ? 1 : 0.4, cursor: hasNext ? 'pointer' : 'not-allowed' }}
                            title="Next video"
                        >
                            <IoPlaySkipForward size={15} />
                            <span className="watch-btn-text">Next</span>
                        </button>
                    )}

                    {/* Share Button */}
                    <button 
                        onClick={async () => {
                            try {
                                if (typeof navigator !== 'undefined' && navigator.share) {
                                    try {
                                        await navigator.share({
                                            title: video.title || 'Check out this video',
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
                        }}
                        className="watch-action-pill"
                        title="Share"
                    >
                        <IoShareSocialOutline size={16} />
                        <span className="watch-btn-text">Share</span>
                    </button>

                    {/* Download Button */}
                    {onOpenDownload && (
                        <button
                            onClick={onOpenDownload}
                            className="watch-action-pill"
                            title="Download Video / Audio"
                        >
                            <IoDownloadOutline size={16} />
                            <span className="watch-btn-text">Download</span>
                        </button>
                    )}
                    
                    {/* Save Button with Toggle State */}
                    <button 
                        onClick={handleSave}
                        className={`watch-action-pill ${isSaved ? 'active' : ''}`}
                        title={isSaved ? 'Remove from saved' : 'Save to playlist'}
                    >
                        {isSaved ? <IoBookmark size={16} /> : <IoBookmarkOutline size={16} />}
                        <span className="watch-btn-text">{isSaved ? 'Saved' : 'Save'}</span>
                    </button>

                    {/* Loop Toggle */}
                    {onToggleLoop && (
                        <button
                            onClick={onToggleLoop}
                            title={loopMode ? 'Disable loop' : 'Enable loop'}
                            className={`watch-action-pill ${loopMode ? 'active' : ''}`}
                        >
                            <IoRepeat size={16} />
                            <span className="watch-btn-text">{loopMode ? 'Looping' : 'Loop'}</span>
                        </button>
                    )}

                    {/* Wide Mode Toggle */}
                    {onToggleWide && (
                        <button
                            onClick={onToggleWide}
                            title={wideMode ? 'Exit wide mode' : 'Enter wide mode'}
                            className={`watch-action-pill watch-action-wide ${wideMode ? 'active' : ''}`}
                        >
                            <IoExpandOutline size={16} />
                            <span className="watch-btn-text">Wide</span>
                        </button>
                    )}
                </div>
            </div>
            
            {/* Description Box */}
            <div style={{
                backgroundColor: 'var(--yt-hover)',
                borderRadius: '12px',
                padding: '12px',
                marginTop: '12px',
            }}>
                {/* Views and Date */}
                <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    marginBottom: '8px', 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    color: 'var(--yt-text-primary)' 
                }}>
                    <span>{formatViews(video.viewCount)}</span>
                    {video.publishedAt && (
                        <>
                            <span>•</span>
                            <span>{video.publishedAt}</span>
                        </>
                    )}
                </div>
                
                {/* Description */}
                {hasDescription ? (
                    <div style={{ 
                        fontSize: '13px', 
                        color: 'var(--yt-text-primary)',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                    }}>
                        {displayDescription}
                        {shouldTruncate && (
                            <button 
                                onClick={() => setExpanded(!expanded)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--yt-blue)',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    padding: 0,
                                    marginLeft: '4px',
                                }}
                            >
                                {expanded ? ' Show less' : ' ...more'}
                            </button>
                        )}
                    </div>
                ) : null}
                
                {/* Tags */}
                {video.tags && video.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                        {video.tags.slice(0, 10).map((tag: string, i: number) => (
                            <span key={i} style={{
                                backgroundColor: 'var(--yt-background)',
                                padding: '4px 10px',
                                borderRadius: '14px',
                                fontSize: '12px',
                                color: 'var(--yt-blue)',
                                cursor: 'pointer',
                            }}>
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Mix Playlist Component
function MixPlaylist({ videos, currentIndex, onVideoSelect, title }: { 
    videos: VideoData[]; 
    currentIndex: number; 
    onVideoSelect: (index: number) => void;
    title?: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 900);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const visibleVideos = isMobile && !expanded ? videos.slice(0, 3) : videos;
    const hasMore = isMobile && !expanded && videos.length > 3;

    return (
        <div className="mix-playlist-container" style={{
            backgroundColor: 'var(--yt-hover)',
            borderRadius: '12px',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--yt-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', margin: 0, color: 'var(--yt-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {title || 'Mix Playlist'}
                    </h3>
                    <p style={{ fontSize: '11px', color: 'var(--yt-text-secondary)', margin: '2px 0 0 0' }}>
                        {videos.length} videos • Auto-play is on
                    </p>
                </div>
                {isMobile && videos.length > 3 && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--yt-blue)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '4px 8px',
                            flexShrink: 0,
                        }}
                    >
                        {expanded ? 'Show less' : `Show all`}
                    </button>
                )}
            </div>
            
            {/* Video List */}
            <div className="mix-playlist-list" style={{ maxHeight: isMobile ? 'none' : '360px', overflowY: isMobile ? 'visible' : 'auto' }}>
                {visibleVideos.map((video, index) => {
                    const actualIndex = isMobile && !expanded ? videos.findIndex(v => v.id === video.id) : index;
                    return (
                    <div 
                        key={video.id}
                        onClick={() => onVideoSelect(actualIndex)}
                        style={{
                            display: 'flex',
                            gap: '10px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            backgroundColor: actualIndex === currentIndex ? 'var(--yt-active)' : 'transparent',
                            borderLeft: actualIndex === currentIndex ? '3px solid var(--yt-blue)' : '3px solid transparent',
                            transition: 'background-color 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            if (actualIndex !== currentIndex) {
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.05)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (actualIndex !== currentIndex) {
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                            }
                        }}
                    >
                        {/* Thumbnail with index */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <img 
                                src={video.thumbnail ? proxiedImageUrl(video.thumbnail) : proxiedThumb(video.id, 'mqdefault')}
                                alt={video.title}
                                loading="lazy"
                                decoding="async"
                                style={{ 
                                    width: '90px', 
                                    height: '50px', 
                                    objectFit: 'cover',
                                    borderRadius: '6px',
                                }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = proxiedThumb(video.id, 'default');
                                }}
                            />
                            <div style={{
                                position: 'absolute',
                                bottom: '2px',
                                left: '2px',
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                color: '#fff',
                                padding: '1px 3px',
                                borderRadius: '3px',
                                fontSize: '9px',
                            }}>
                                {actualIndex + 1}/{videos.length}
                            </div>
                            {actualIndex === currentIndex && (
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    backgroundColor: 'rgba(0,0,0,0.8)',
                                    borderRadius: '50%',
                                    padding: '5px',
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                                    </svg>
                                </div>
                            )}
                        </div>
                        
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ 
                                fontSize: '12px', 
                                fontWeight: actualIndex === currentIndex ? '600' : '500',
                                color: 'var(--yt-text-primary)',
                                lineHeight: '1.2',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}>
                                {video.title}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--yt-text-secondary)', marginTop: '2px' }}>
                                {video.uploader}
                            </div>
                            {video.duration && (
                                <div style={{ fontSize: '10px', color: 'var(--yt-text-secondary)', marginTop: '1px' }}>
                                    {video.duration}
                                </div>
                            )}
                        </div>
                    </div>
                    );
                })}
            </div>

            {/* Show more indicator */}
            {hasMore && (
                <button
                    onClick={() => setExpanded(true)}
                    style={{
                        width: '100%',
                        padding: '8px',
                        background: 'none',
                        border: 'none',
                        borderTop: '1px solid var(--yt-border)',
                        color: 'var(--yt-text-secondary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                    }}
                >
                    +{videos.length - 3} more videos
                </button>
            )}
        </div>
    );
}

// Comment Section - lazy loaded (TypeType pattern: heavy components behind React.lazy)
function CommentSectionInner({ videoId }: { videoId: string }) {
    const [comments, setComments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [visibleCount, setVisibleCount] = useState(4);

    useEffect(() => {
        const loadComments = async () => {
            try {
                const data = await getCommentsClient(videoId, 50);
                setComments(data);
            } catch (error) {
                console.error('Failed to load comments:', error);
            } finally {
                setLoading(false);
            }
        };
        loadComments();
    }, [videoId]);

    if (loading) {
        return (
            <div style={{ padding: '24px 0', color: 'var(--yt-text-secondary)' }}>
                Loading comments...
            </div>
        );
    }

    const displayedComments = comments.slice(0, visibleCount);
    const hasMore = visibleCount < comments.length;

    return (
        <div style={{ padding: '24px 0', borderTop: '1px solid var(--yt-border)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: 'var(--yt-text-primary)' }}>
                {comments.length} Comments
            </h2>
            
            {/* Sort dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--yt-text-secondary)">
                    <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/>
                </svg>
                <span style={{ fontSize: '14px', color: 'var(--yt-text-secondary)' }}>Sort by</span>
            </div>

            {/* Comments List - progressive rendering (TypeType pattern) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {displayedComments.map((comment) => (
                    <div key={comment.id} style={{ display: 'flex', gap: '12px' }}>
                        {comment.author_thumbnail ? (
                            <img 
                                src={comment.author_thumbnail}
                                alt={comment.author}
                                loading="lazy"
                                decoding="async"
                                style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--yt-hover)', flexShrink: 0 }}
                            />
                        ) : null}
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--yt-text-primary)' }}>
                                    {comment.author}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>
                                    {comment.timestamp}
                                </span>
                            </div>
                            <div style={{ fontSize: '14px', color: 'var(--yt-text-primary)', marginTop: '4px', lineHeight: '1.5' }}>
                                {comment.text}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                                <button style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--yt-text-secondary)',
                                    fontSize: '12px',
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
                                    </svg>
                                    {comment.likes}
                                </button>
                                <button style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--yt-text-secondary)',
                                    fontSize: '12px',
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2z"/>
                                    </svg>
                                </button>
                                <button style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--yt-blue)',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                }}>
                                    Reply
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            {hasMore && (
                <button
                    onClick={() => setVisibleCount(prev => prev + 4)}
                    style={{
                        marginTop: '16px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--yt-blue)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        padding: '8px 0',
                    }}
                >
                    Show more comments ({comments.length - visibleCount} remaining)
                </button>
            )}
        </div>
    );
}

function CommentSection({ videoId }: { videoId: string }) {
    return (
        <Suspense fallback={
            <div style={{ padding: '24px 0', color: 'var(--yt-text-secondary)' }}>
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
    const videoId = searchParams.get('v');
    const { setPlayingVideo, setIsPlaying, loopMode, setLoopMode, watchHandlersRef } = usePlayer();
    const [videoInfo, setVideoInfo] = useState<any>(null);
    const [relatedVideos, setRelatedVideos] = useState<VideoData[]>([]);
    const [mixPlaylist, setMixPlaylist] = useState<VideoData[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [activeTab, setActiveTab] = useState<'upnext' | 'mix'>('upnext');
    const [apiError, setApiError] = useState<string | null>(null);
	const [wideMode, setWideMode] = useState(false);
	const [showDownload, setShowDownload] = useState(false);

    // Hover prefetch: debounce 220ms, prefetch Next.js route for instant navigation
    const prefetchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const prefetched = useRef<Set<string>>(new Set());

    const handlePrefetchEnter = useCallback((videoId: string) => {
        const timer = setTimeout(() => {
            if (!prefetched.current.has(videoId)) {
                prefetched.current.add(videoId);
                router.prefetch(`/watch?v=${videoId}`);
            }
        }, 220);
        prefetchTimers.current.set(videoId, timer);
    }, [router]);

    const handlePrefetchLeave = useCallback((videoId: string) => {
        const timer = prefetchTimers.current.get(videoId);
        if (timer) {
            clearTimeout(timer);
            prefetchTimers.current.delete(videoId);
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

				// Mount the persistent player immediately with just the ID so the
				// stream starts loading before the metadata fetch completes.
				setPlayingVideo({
					id: videoId,
					title: '',
					uploader: '',
					thumbnail: '',
					duration: '',
				});

				// Continue from the clicked position when navigating between
				// videos (?idx=N), so Next/Prev follow the list order instead
				// of always restarting at the top.
				const startIdx = Math.max(0, parseInt(searchParams.get('idx') || '0', 10) || 0);
				setCurrentIndex(startIdx);

				// Fetch video details and backend related videos concurrently
				const [video, upNextResult] = await Promise.all([
					getOrFetchData(`video_${videoId}`, () => getVideoDetailsClient(videoId)),
					getOrFetchData(`related_${videoId}`, () => getRelatedVideosClient(videoId, 20)),
				]);
				setVideoInfo(video);

				// Add to watch history (storage & Invidious) and sync Global Player
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
						thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
						channelTitle: video.uploader || video.channelTitle || 'Creator',
						channelId: (video as any).channelId || video.channel_id || '',
						duration: video.duration || '',
						viewCount: typeof video.view_count === 'number' ? video.view_count : (parseInt(String(video.view_count || video.viewCount || '0').replace(/[^0-9]/g, '')) || 0),
						uploadDate: video.upload_date || video.publishedAt || '',
					});
					invidious.addAuthHistory(videoId).catch(() => {});
				}

				keywords = titleKeywords(video?.title || '');
				const channel = video?.channelTitle || video?.uploader || '';
				firstWords = keywords.split(' ').slice(0, 3).join(' ');
				const exclude = new Set<string>([videoId]);

				// Mix: playlist/compilation style, also video-specific fallbacks.
				const mixQueries = [
					keywords ? `${keywords} mix` : '',
					channel ? `${channel} playlist` : '',
					firstWords ? `${firstWords} playlist` : '',
					keywords ? `${keywords} album` : '',
				];

				const mixResults = await getOrFetchData(`mix_${videoId}`, () => searchWithFallback(mixQueries, 10, 20, exclude));

				let uniqueRelated = (Array.isArray(upNextResult) ? upNextResult : [])
					.filter((v, i, self) =>
						i === self.findIndex(item => item.id === v.id) && v.id !== videoId
					);

				if (uniqueRelated.length < 6) {
					// Backend related is thin/unavailable: top up with search,
					// from specific (channel + title) to broad.
					const relatedQueries = [
						[channel, keywords].filter(Boolean).join(' '),
						keywords,
						channel,
						firstWords,
						`${firstWords} official video`,
						`${channel || firstWords} live`,
					];
					const seen = new Set<string>(uniqueRelated.map(v => v.id));
					const extra = await searchWithFallback(relatedQueries, 10, 20, new Set<string>([videoId, ...seen]));
					for (const v of extra) {
						if (uniqueRelated.length >= 20) break;
						if (seen.has(v.id)) continue;
						seen.add(v.id);
						uniqueRelated.push(v);
					}
				}

				let uniqueMix = mixArrFilter(mixResults, videoId, uniqueRelated);

				// Guarantee both sections have content: if one came back empty,
				// borrow from the other so the UI always shows Mix + Up Next.
				if (uniqueRelated.length === 0 && uniqueMix.length > 0) {
					const half = Math.ceil(uniqueMix.length / 2);
					uniqueRelated = uniqueMix.slice(0, half);
					uniqueMix = uniqueMix.slice(half);
				} else if (uniqueMix.length === 0 && uniqueRelated.length > 0) {
					const half = Math.ceil(uniqueRelated.length / 2);
					uniqueMix = uniqueRelated.slice(half);
					uniqueRelated = uniqueRelated.slice(0, half);
				}

				setRelatedVideos(uniqueRelated);
				setMixPlaylist(uniqueMix.slice(0, 20));

				if (!video) {
					setApiError('Video info unavailable, but you can still browse related videos.');
				}
			} catch (error) {
				console.error('Failed to load video data:', error);
				try {
					// Video-specific last-resort so suggestions differ per video.
					const fallbackQueries = [
						keywords ? `${keywords} video` : 'music popular',
						firstWords ? `${firstWords} mix` : 'music popular',
					];
					const fallbackResults = await searchWithFallback(fallbackQueries, 20, 20, new Set<string>([videoId]));
					const arr = Array.isArray(fallbackResults) ? fallbackResults : [];
					setRelatedVideos(arr.slice(0, 10));
					setMixPlaylist(arr.slice(10, 20));
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
	}, [videoId]);

    const handleVideoSelect = (index: number) => {
        const video = activeTab === 'upnext' ? relatedVideos[index] : mixPlaylist[index];
        if (video) {
            router.push(`/watch?v=${video.id}&idx=${index}`);
        }
    };

    const handlePrevious = () => {
        const playlist = activeTab === 'mix' ? mixPlaylist : relatedVideos;
        if (currentIndex > 0) {
            const prevVideo = playlist[currentIndex - 1];
            router.push(`/watch?v=${prevVideo.id}&idx=${currentIndex - 1}`);
        }
    };

    const handleNext = () => {
        const playlist = activeTab === 'mix' ? mixPlaylist : relatedVideos;
        if (currentIndex < playlist.length - 1) {
            const nextVideo = playlist[currentIndex + 1];
            router.push(`/watch?v=${nextVideo.id}&idx=${currentIndex + 1}`);
        }
    };

    const handleVideoEnd = () => {
        const playlist = activeTab === 'mix' ? mixPlaylist : relatedVideos;
        if (currentIndex < playlist.length - 1) {
            handleNext();
        }
    };

    // Publish the watch-page handlers to the persistent player (layout), which
    // drives next/prev/loop for both the full player and the miniplayer.
    watchHandlersRef.current = {
        onNext: handleNext,
        onPrev: handlePrevious,
        onVideoEnd: handleVideoEnd,
        onError: () => {
            console.warn('[Watch] player error');
        },
        loopMode,
    };

    if (!videoId) {
        return <div style={{ padding: '2rem', color: 'var(--yt-text-primary)' }}>No video ID provided</div>;
    }

    const currentPlaylist = activeTab === 'mix' ? mixPlaylist : relatedVideos;

    return (
        <div style={{ 
            backgroundColor: 'var(--yt-background)', 
            color: 'var(--yt-text-primary)', 
            minHeight: '100vh',
        }}>
            <div className="watch-page-container" style={{ 
                maxWidth: wideMode ? '100%' : '1800px', 
                width: '100%',
                margin: '0 auto',
                padding: '24px',
                display: 'grid',
                gridTemplateColumns: wideMode ? '1fr' : '1fr 400px',
                gap: '24px',
                boxSizing: 'border-box',
            }}>
                {/* Main Content */}
                <div className="watch-main">
                    {/* Video Player — rendered by the persistent player in the
                        layout, which positions itself over this slot */}
					<div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', backgroundColor: '#000000', borderRadius: '16px', overflow: 'hidden' }}>
					<div id="watch-player-slot" style={{ width: '100%', height: '100%' }} />
					</div>

                    {/* Video Info and Comments Body */}
                    <div className="watch-main-body" style={{ width: '100%' }}>
                        <VideoInfo
                            video={videoInfo}
                            onOpenDownload={() => setShowDownload(true)}
                            onPrevious={handlePrevious}
                            onNext={handleNext}
                            hasPrevious={currentIndex > 0}
                            hasNext={currentIndex < currentPlaylist.length - 1}
                            loopMode={loopMode}
                            onToggleLoop={() => setLoopMode(!loopMode)}
                            wideMode={wideMode}
                            onToggleWide={() => setWideMode(!wideMode)}
                        />

                        {/* Comments */}
                        <CommentSection videoId={videoId} />
                    </div>
                </div>

                {/* Sidebar — in wide mode it flows below the main content
                    (single-column grid) as ONE column: Mix first, Up Next
                    below, full width. */}
                <div className="watch-sidebar" style={{
                    position: wideMode ? 'relative' : 'sticky',
                    top: wideMode ? 0 : '70px',
                    height: wideMode ? 'auto' : 'calc(100vh - 90px)',
                    maxHeight: wideMode ? 'none' : 'calc(100vh - 90px)',
                    overflow: wideMode ? 'visible' : 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '12px',
                    width: '100%',
                }}>
                    {/* Mix Playlist - Always on top */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: 0,
                        width: '100%',
                    }}>
                        <MixPlaylist 
                            videos={mixPlaylist}
                            currentIndex={currentIndex}
                            onVideoSelect={handleVideoSelect}
                            title={videoInfo?.title ? `Mix - ${videoInfo.title.split(' ').slice(0, 3).join(' ')}` : 'Mix Playlist'}
                        />
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

                    {/* Up Next Section */}
                    <div className="upnext-section" style={{
                        backgroundColor: 'var(--yt-hover)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        minHeight: wideMode ? 'auto' : 0,
                        flex: wideMode ? undefined : 1,
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--yt-border)',
                            flexShrink: 0,
                        }}>
                            <h3 style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: 'var(--yt-text-primary)' }}>
                                Up Next
                            </h3>
                            <span style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>
                                {relatedVideos.length} videos
                            </span>
                        </div>
                        <div className="upnext-list" style={{ 
                            flex: wideMode ? 'none' : 1, 
                            minHeight: wideMode ? 'auto' : 0, 
                            overflowY: wideMode ? 'visible' : 'auto',
                        }}>
                            {relatedVideos.slice(0, 30).map((video, index) => (
                                <div 
                                    key={video.id}
                                    onClick={() => handleVideoSelect(index)}
                                    onMouseEnter={() => handlePrefetchEnter(video.id)}
                                    onMouseLeave={() => handlePrefetchLeave(video.id)}
                                    style={{
                                        display: 'flex',
                                        gap: '10px',
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        backgroundColor: index === currentIndex ? 'var(--yt-active)' : 'transparent',
                                        borderLeft: index === currentIndex ? '3px solid var(--yt-blue)' : '3px solid transparent',
                                        transition: 'background-color 0.2s',
                                    }}
                                    onMouseOver={(e) => {
                                        if (index !== currentIndex) {
                                            (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.05)';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (index !== currentIndex) {
                                            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                        }
                                    }}
                                >
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <img 
                                            src={video.thumbnail ? proxiedImageUrl(video.thumbnail) : proxiedThumb(video.id, 'mqdefault')}
                                            alt={video.title}
                                            loading="lazy"
                                            decoding="async"
                                            style={{ width: '120px', height: '68px', objectFit: 'cover', borderRadius: '6px' }}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = proxiedThumb(video.id, 'mqdefault');
                                            }}
                                        />
                                        {video.duration && (
                                            <div style={{
                                                position: 'absolute',
                                                bottom: '3px',
                                                right: '3px',
                                                backgroundColor: 'rgba(0,0,0,0.8)',
                                                color: '#fff',
                                                padding: '1px 4px',
                                                borderRadius: '3px',
                                                fontSize: '10px',
                                            }}>
                                                {video.duration}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ 
                                            fontSize: '12px', 
                                            fontWeight: '500',
                                            color: 'var(--yt-text-primary)',
                                            lineHeight: '1.2',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                        }}>
                                            {video.title}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--yt-text-secondary)', marginTop: '2px' }}>
                                            {video.uploader}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Download sheet — rendered at root level to escape any stacking context */}
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
                    }
                    .watch-sidebar {
                        position: relative !important;
                        top: 0 !important;
                        height: auto !important;
                        max-height: none !important;
                        overflow: visible !important;
                    }
                    .upnext-section {
                        flex: none !important;
                        min-height: auto !important;
                    }
                    .upnext-list {
                        flex: none !important;
                        min-height: auto !important;
                        overflow-y: visible !important;
                    }
                }
            `}</style>
        </div>
    );
}