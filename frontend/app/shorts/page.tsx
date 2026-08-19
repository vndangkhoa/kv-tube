'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  IoHeart,
  IoHeartOutline,
  IoShareOutline,
  IoVolumeMute,
  IoVolumeHigh,
  IoArrowUp,
  IoArrowDown,
  IoMusicalNotes,
  IoPlay,
  IoExpand,
  IoContract,
} from 'react-icons/io5';
import LoadingSpinner from '../components/LoadingSpinner';
import { invidious } from '../services/invidious';
import { isSubscribed, toggleSubscription } from '../storage';

interface ShortVideo {
  id: string;
  title: string;
  uploader: string;
  channelId?: string;
  channelAvatar?: string;
  thumbnail: string;
  view_count?: number;
  lengthSeconds?: number;
}

const REGION_SHORTS_TERMS: Record<string, string[]> = {
  VN: [
    '#shorts việt nam',
    'shorts hài hước triệu view',
    'shorts xu hướng việt nam',
    'shorts tiktok việt nam',
    'shorts ẩm thực việt nam',
    'shorts giải trí việt nam',
    'reels việt nam trending',
    'shorts gái xinh việt nam',
  ],
  US: [
    '#shorts',
    'trending shorts',
    'viral shorts',
    'funny shorts',
    'shorts comedy',
    'shorts gaming',
    'tiktok viral shorts',
    'reels shorts',
  ],
  JP: [
    '#shorts 日本',
    'shorts 面白い',
    'shorts トレンド',
    'shorts バズる',
    'shorts アニメ',
    'shorts ゲーム',
  ],
  KR: [
    '#shorts 한국',
    'shorts 쇼츠 인기',
    'shorts 재미있는',
    'shorts 케이팝',
    'shorts 유행',
  ],
  GLOBAL: [
    '#shorts',
    'trending shorts',
    'viral shorts',
    'funny shorts',
    'shorts comedy',
    'shorts gaming',
  ],
};

function getTermsForRegion(region: string): string[] {
  return REGION_SHORTS_TERMS[region.toUpperCase()] || REGION_SHORTS_TERMS.VN || REGION_SHORTS_TERMS.US;
}

function formatViews(views?: number): string {
  if (!views) return '35K';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
  if (views >= 1000) return (views / 1000).toFixed(0) + 'K';
  return views.toString();
}

// Global Set to prevent duplicate shorts from appearing in the feed
const globalSeenIds = new Set<string>();

async function fetchUniqueShorts(page: number, region: string = 'VN'): Promise<ShortVideo[]> {
  const terms = getTermsForRegion(region);
  const queryIndex = (page - 1) % terms.length;
  const query = terms[queryIndex];

  try {
    const results = await invidious.search(query, {
      page: Math.floor((page - 1) / terms.length) + 1,
      type: 'video',
      duration: 'short',
      sort_by: 'upload_date',
      region: region,
    });

    if (Array.isArray(results) && results.length > 0) {
      const filtered: ShortVideo[] = [];

      for (const v of results) {
        const vidId = v.videoId || v.id;
        if (!vidId || globalSeenIds.has(vidId)) continue;

        // Ensure duration is short (under 95 seconds)
        if (v.lengthSeconds && v.lengthSeconds > 95) continue;

        globalSeenIds.add(vidId);
        filtered.push({
          id: vidId,
          title: v.title || 'Short Video',
          uploader: v.author || v.uploader || 'Creator',
          channelId: v.authorId || v.channel_id || '',
          channelAvatar: v.authorThumbnails?.[v.authorThumbnails.length - 1]?.url,
          thumbnail:
            v.videoThumbnails?.[0]?.url ||
            (typeof v.thumbnail === 'string' ? v.thumbnail.replace('/maxresdefault.jpg', '/mqdefault.jpg') : v.thumbnail) ||
            `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`,
          view_count: v.viewCount ?? v.view_count ?? 38000,
          lengthSeconds: v.lengthSeconds || 30,
        });
      }

      if (filtered.length > 0) return filtered;
    }
  } catch (e) {
    console.warn('[Shorts] Invidious search failed for query:', query, e);
  }

  // Secondary fallback with generic shorts query
  try {
    const backupResults = await invidious.search(`#shorts ${region}`, {
      page: page + 1,
      type: 'video',
      duration: 'short',
      sort_by: 'relevance',
      region: region,
    });

    if (Array.isArray(backupResults)) {
      const filteredBackup: ShortVideo[] = [];
      for (const v of backupResults) {
        const vidId = v.videoId || v.id;
        if (!vidId || globalSeenIds.has(vidId)) continue;
        globalSeenIds.add(vidId);
        filteredBackup.push({
          id: vidId,
          title: v.title || 'Shorts',
          uploader: v.author || 'Creator',
          channelId: v.authorId || '',
          channelAvatar: v.authorThumbnails?.[0]?.url,
          thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`,
          view_count: v.viewCount ?? 45000,
          lengthSeconds: v.lengthSeconds || 30,
        });
      }
      return filteredBackup;
    }
  } catch {}

  return [];
}

function ShortCard({
  video,
  isActive,
  muted,
  toggleMute,
}: {
  video: ShortVideo;
  isActive: boolean;
  muted: boolean;
  toggleMute: () => void;
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(
    video.view_count ? Math.floor(video.view_count * 0.08) : 5200
  );
  const [heartAnim, setHeartAnim] = useState(false);
  const [isSub, setIsSub] = useState(false);
  const lastClickRef = useRef<number>(0);

  useEffect(() => {
    if (video.channelId) {
      setIsSub(isSubscribed(video.channelId));
    }
  }, [video.channelId]);

  const handleCardClick = () => {
    const now = Date.now();
    if (now - lastClickRef.current < 320) {
      // Double tap to like
      if (!liked) {
        setLiked(true);
        setLikeCount((prev) => prev + 1);
      }
      setHeartAnim(true);
      setTimeout(() => setHeartAnim(false), 700);
    }
    lastClickRef.current = now;
  };

  const handleToggleSub = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!video.channelId) return;
    const next = toggleSubscription({
      channelId: video.channelId,
      channelName: video.uploader,
      channelAvatar: video.channelAvatar,
    });
    setIsSub(next);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: video.title,
          url: `${window.location.origin}/watch?v=${video.id}`,
        });
      } else {
        await navigator.clipboard.writeText(`${window.location.origin}/watch?v=${video.id}`);
        alert('Shorts video link copied!');
      }
    } catch {}
  };

  // Embed URL for flawless vertical video playback with audio
  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${video.id}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1`;

  return (
    <div
      className="short-card-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        scrollSnapAlign: 'start',
      }}
    >
      {/* Responsive Full-View / Frame Container */}
      <div
        onClick={handleCardClick}
        className="short-video-wrapper"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#000000',
          userSelect: 'none',
        }}
      >
        {/* Active Iframe Video Player with Full Viewport Coverage */}
        {isActive ? (
          <iframe
            src={embedUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <img
            src={video.thumbnail}
            alt={video.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        )}

        {/* Double-Tap Heart Animation */}
        {heartAnim && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) scale(1.3)',
              color: '#ff2d55',
              zIndex: 25,
              animation: 'bounce 0.6s ease',
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.6))',
              pointerEvents: 'none',
            }}
          >
            <IoHeart size={84} />
          </div>
        )}

        {/* Top Sound Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            color: '#ffffff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 30,
            backdropFilter: 'blur(8px)',
          }}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <IoVolumeMute size={22} /> : <IoVolumeHigh size={22} />}
        </button>

        {/* Full-Width Seamless Bottom Gradient */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '240px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.1) 75%, transparent 100%)',
            pointerEvents: 'none',
            zIndex: 15,
          }}
        />

        {/* Bottom Info Overlay */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="short-bottom-info"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingLeft: '16px',
            paddingRight: '76px',
            color: '#ffffff',
            zIndex: 20,
          }}
        >
          {/* Channel Author & Subscribe Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Link
              href={video.channelId ? `/channel/${video.channelId}` : `/watch?v=${video.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#ffffff',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--md-sys-color-primary, #ff0033)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                {video.channelAvatar ? (
                  <img src={video.channelAvatar} alt={video.uploader} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  video.uploader?.[0]?.toUpperCase() || 'C'
                )}
              </div>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '15px',
                  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                  maxWidth: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                @{video.uploader}
              </span>
            </Link>

            {video.channelId && (
              <button
                type="button"
                onClick={handleToggleSub}
                style={{
                  padding: '5px 14px',
                  borderRadius: '18px',
                  border: 'none',
                  backgroundColor: isSub ? 'rgba(255,255,255,0.25)' : '#ffffff',
                  color: isSub ? '#ffffff' : '#000000',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(6px)',
                  transition: 'all 0.2s',
                }}
              >
                {isSub ? 'Subscribed' : 'Subscribe'}
              </button>
            )}
          </div>

          {/* Title */}
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 500,
              lineHeight: '1.4',
              margin: '0 0 8px',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            {video.title}
          </h3>

          {/* Audio Track */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              opacity: 0.85,
            }}
          >
            <IoMusicalNotes size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Original Sound · {video.uploader}
            </span>
          </div>
        </div>

        {/* Right Floating Actions Toolbar */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="short-actions-toolbar"
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            alignItems: 'center',
            zIndex: 30,
          }}
        >
          {/* Like Button */}
          <button
            type="button"
            onClick={() => {
              setLiked(!liked);
              setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
            }}
            style={{
              background: 'none',
              border: 'none',
              color: liked ? '#ff2d55' : '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            title="Like"
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
                transition: 'transform 0.15s ease',
              }}
            >
              {liked ? <IoHeart size={26} /> : <IoHeartOutline size={26} />}
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>{formatViews(likeCount)}</span>
          </button>

          {/* Watch Full Video Player */}
          <Link
            href={`/watch?v=${video.id}`}
            style={{
              color: '#ffffff',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Watch in full player"
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
              }}
            >
              <IoPlay size={22} style={{ marginLeft: '2px' }} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>Watch</span>
          </Link>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            title="Share"
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
              }}
            >
              <IoShareOutline size={22} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>Share</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShortsPage() {
  const [shorts, setShorts] = useState<ShortVideo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [muted, setMuted] = useState(false);
  const [currentRegion, setCurrentRegion] = useState('VN');
  const containerRef = useRef<HTMLDivElement>(null);

  // Read active region and listen to region changes
  useEffect(() => {
    const saved = (typeof window !== 'undefined' ? localStorage.getItem('kv_region') : null) || 'VN';
    setCurrentRegion(saved);

    const handleRegionChange = (e: any) => {
      if (e.detail?.region) {
        setCurrentRegion(e.detail.region);
      }
    };
    window.addEventListener('regionchange', handleRegionChange);
    return () => window.removeEventListener('regionchange', handleRegionChange);
  }, []);

  const loadInitialShorts = useCallback(async (region: string) => {
    setLoading(true);
    globalSeenIds.clear();
    const batch1 = await fetchUniqueShorts(1, region);
    const batch2 = await fetchUniqueShorts(2, region);
    const combined = [...batch1, ...batch2];
    setShorts(combined);
    setPage(3);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInitialShorts(currentRegion);
  }, [currentRegion, loadInitialShorts]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    const more = await fetchUniqueShorts(nextPage, currentRegion);
    if (more.length > 0) {
      setShorts((prev) => [...prev, ...more]);
      setPage(nextPage);
    }
  }, [page, currentRegion]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = containerRef.current;
    const index = Math.round(scrollTop / clientHeight);
    if (index !== currentIndex && index < shorts.length) {
      setCurrentIndex(index);
    }
    // Pre-fetch next shorts when reaching within 2 videos of the end
    if (scrollHeight - scrollTop - clientHeight < 1000) {
      loadMore();
    }
  };

  const scrollTo = (dir: 'next' | 'prev') => {
    if (!containerRef.current) return;
    const h = containerRef.current.clientHeight;
    if (dir === 'next' && currentIndex < shorts.length - 1) {
      containerRef.current.scrollBy({ top: h, behavior: 'smooth' });
    } else if (dir === 'prev' && currentIndex > 0) {
      containerRef.current.scrollBy({ top: -h, behavior: 'smooth' });
    }
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollTo('next');
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollTo('prev');
      }
      if (e.key === 'm') {
        e.preventDefault();
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentIndex, shorts.length]);

  if (loading && shorts.length === 0) {
    return (
      <div
        style={{
          height: 'calc(100vh - var(--yt-header-height))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <LoadingSpinner text="" fullScreen={false} size="large" />
        <p style={{ color: 'var(--yt-text-secondary)', fontSize: '14px', margin: 0 }}>
          Loading {currentRegion} Shorts...
        </p>
      </div>
    );
  }

  return (
    <div
      className="shorts-page-container"
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - var(--yt-header-height))',
        backgroundColor: '#000000',
      }}
    >
      <style jsx global>{`
        /* Mobile Full Viewport Coverage */
        @media (max-width: 768px) {
          .short-card-container {
            height: calc(100vh - var(--yt-header-height) - 56px) !important;
          }
          .short-video-wrapper {
            max-width: 100% !important;
            height: 100% !important;
            max-height: 100% !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .short-bottom-info {
            bottom: 0 !important;
            padding-bottom: 74px !important;
            padding-left: 16px !important;
            padding-right: 76px !important;
          }
          .short-actions-toolbar {
            bottom: 74px !important;
          }
          .shorts-desktop-nav {
            display: none !important;
          }
        }

        /* Desktop Clean Center 9:16 View */
        @media (min-width: 769px) {
          .short-card-container {
            height: calc(100vh - var(--yt-header-height)) !important;
            padding: 16px 0;
          }
          .short-video-wrapper {
            max-width: 440px !important;
            height: calc(100vh - var(--yt-header-height) - 32px) !important;
            max-height: 860px !important;
            border-radius: 20px !important;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8) !important;
          }
          .short-bottom-info {
            bottom: 0 !important;
            padding-bottom: 24px !important;
            padding-left: 16px !important;
            padding-right: 76px !important;
          }
          .short-actions-toolbar {
            bottom: 24px !important;
          }
          .shorts-desktop-nav {
            display: flex !important;
          }
        }
      `}</style>

      {/* Scrollable Shorts Feed */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
        }}
      >
        {shorts.map((video, idx) => (
          <ShortCard
            key={video.id}
            video={video}
            isActive={idx === currentIndex}
            muted={muted}
            toggleMute={() => setMuted((m) => !m)}
          />
        ))}
      </div>

      {/* Desktop Floating Navigation Controls (Previous / Next) - Hidden on Mobile */}
      <div
        className="shorts-desktop-nav"
        style={{
          position: 'fixed',
          right: '32px',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={() => scrollTo('prev')}
          disabled={currentIndex === 0}
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: 'var(--yt-surface)',
            border: '1px solid var(--yt-border)',
            color: 'var(--yt-text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            opacity: currentIndex === 0 ? 0.35 : 1,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            transition: 'all 0.2s',
          }}
          title="Previous short (Arrow Up / k)"
        >
          <IoArrowUp size={22} />
        </button>
        <button
          type="button"
          onClick={() => scrollTo('next')}
          disabled={currentIndex >= shorts.length - 1}
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: 'var(--yt-surface)',
            border: '1px solid var(--yt-border)',
            color: 'var(--yt-text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: currentIndex >= shorts.length - 1 ? 'not-allowed' : 'pointer',
            opacity: currentIndex >= shorts.length - 1 ? 0.35 : 1,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            transition: 'all 0.2s',
          }}
          title="Next short (Arrow Down / j)"
        >
          <IoArrowDown size={22} />
        </button>
      </div>
    </div>
  );
}
