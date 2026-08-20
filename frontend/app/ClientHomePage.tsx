'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import VideoCard from './components/VideoCard';
import LoadingSpinner from './components/LoadingSpinner';
import { VideoData } from './constants';
import { invidious } from './services/invidious';
import { getHomeFeedClient, searchVideosClient } from './clientActions';
import { categoryQuery, getRegionContent } from './regionContent';
import {
  IoFlameOutline,
  IoMusicalNotesOutline,
  IoGameControllerOutline,
  IoFilmOutline,
  IoSparklesOutline,
  IoRadioOutline,
  IoNewspaperOutline,
  IoHardwareChipOutline,
  IoFootballOutline,
  IoMicOutline,
  IoHappyOutline,
  IoFastFoodOutline,
  IoAirplaneOutline,
  IoCodeSlashOutline,
} from 'react-icons/io5';

interface CategoryConfig {
  id: string;
  label: string;
  icon?: React.ReactNode;
  trendingType?: string;
  searchQuery?: string;
}

const CATEGORIES: CategoryConfig[] = [
  { id: 'All', label: 'All', icon: <IoSparklesOutline size={16} /> },
  { id: 'Trending', label: 'Trending', icon: <IoFlameOutline size={16} />, trendingType: 'default' },
  { id: 'Music', label: 'Music', icon: <IoMusicalNotesOutline size={16} />, searchQuery: 'official music video top hits' },
  { id: 'Gaming', label: 'Gaming', icon: <IoGameControllerOutline size={16} />, searchQuery: 'gaming gameplay walkthrough' },
  { id: 'Movies', label: 'Movies & Trailers', icon: <IoFilmOutline size={16} />, searchQuery: 'official movie trailer teaser' },
  { id: 'News', label: 'News', icon: <IoNewspaperOutline size={16} />, searchQuery: 'daily news world news breaking' },
  { id: 'Tech', label: 'Tech & Gadgets', icon: <IoHardwareChipOutline size={16} />, searchQuery: 'technology gadgets smartphone review tech' },
  { id: 'Coding', label: 'Coding & Dev', icon: <IoCodeSlashOutline size={16} />, searchQuery: 'software programming web development tutorial' },
  { id: 'Sports', label: 'Sports', icon: <IoFootballOutline size={16} />, searchQuery: 'sports match highlights top plays' },
  { id: 'Podcasts', label: 'Podcasts', icon: <IoMicOutline size={16} />, searchQuery: 'podcast full episode interview show' },
  { id: 'Live', label: 'Live Streams', icon: <IoRadioOutline size={16} />, searchQuery: 'live stream 24/7' },
  { id: 'Comedy', label: 'Comedy', icon: <IoHappyOutline size={16} />, searchQuery: 'stand up comedy sketches funny' },
  { id: 'Food', label: 'Food & Cooking', icon: <IoFastFoodOutline size={16} />, searchQuery: 'cooking recipe street food delicious dish' },
  { id: 'Travel', label: 'Travel', icon: <IoAirplaneOutline size={16} />, searchQuery: 'travel vlog guide city explore' },
];

function mapInvidiousVideo(v: any): VideoData {
  const vidId = v.videoId || v.id || '';
  // Low-resolution 320x180 thumbnail for ultra-fast grid rendering (~10KB vs 300KB+)
  const thumbUrl = `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`;

  let dur = '';
  if (typeof v.lengthSeconds === 'number' && v.lengthSeconds > 0) {
    const mins = Math.floor(v.lengthSeconds / 60);
    const secs = v.lengthSeconds % 60;
    dur = `${mins}:${secs.toString().padStart(2, '0')}`;
  } else if (v.duration) {
    dur = String(v.duration);
  }

  let avatar =
    v.authorThumbnails?.[0]?.url ||
    v.authorThumbnails?.[v.authorThumbnails.length - 1]?.url ||
    v.authorThumbnail ||
    v.avatar_url ||
    '';
  if (avatar.startsWith('//')) {
    avatar = 'https:' + avatar;
  } else if (avatar.startsWith('/ggpht') || avatar.startsWith('/yt')) {
    avatar = 'https://yt3.ggpht.com' + avatar;
  } else if (!avatar && (v.authorId || v.channel_id)) {
    avatar = `/api/channel-avatar?id=${encodeURIComponent(v.authorId || v.channel_id)}`;
  }

  return {
    id: vidId,
    title: v.title || 'Untitled',
    uploader: v.author || v.uploader || v.channelTitle || 'Unknown Creator',
    channel_id: v.authorId || v.channel_id || '',
    thumbnail: thumbUrl,
    duration: dur,
    view_count: v.viewCount ?? v.view_count ?? 0,
    upload_date: v.publishedText || v.upload_date || '',
    publishedAt: v.publishedText || '',
    avatar_url: avatar,
  };
}

export default function ClientHomePage() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category') || 'All';
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(categoryParam);
  const [regionCode, setRegionCode] = useState('VN');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Sync state with URL parameter
  useEffect(() => {
    if (categoryParam) {
      setCurrentCategory(categoryParam);
    }
  }, [categoryParam]);

  // Initialize and listen to region changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kv_region');
      if (saved) setRegionCode(saved);
    } catch {}

    const handleRegionChange = (e: any) => {
      if (e.detail?.region) {
        setRegionCode(e.detail.region);
      }
    };
    window.addEventListener('regionchange', handleRegionChange);
    return () => window.removeEventListener('regionchange', handleRegionChange);
  }, []);

  // Fetch videos for selected category directly via Invidious backend matching selected region
  const fetchFeed = useCallback(async (categoryId: string, pageNum: number): Promise<VideoData[]> => {
    const cat = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
    const rc = getRegionContent(regionCode);

    try {
      let items: any[] = [];

      if (cat.id === 'All') {
        // Home shows the most recent videos in the selected region.
        items = await invidious.search(rc.trending, {
          page: pageNum,
          type: 'video',
          region: regionCode,
          sort_by: 'upload_date',
        });
      } else if (cat.id === 'Trending') {
        // Trending is the collection of the most viewed videos.
        items = await invidious.getTrending(regionCode);
        if (!items || items.length === 0) {
          items = await invidious.search(rc.trending, {
            page: pageNum,
            type: 'video',
            region: regionCode,
            sort_by: 'view_count',
          });
        }
      } else {
        // Most recent videos for the selected category in the region.
        const localizedQuery = categoryQuery(regionCode, cat.id);
        items = await invidious.search(localizedQuery, {
          page: pageNum,
          type: 'video',
          region: regionCode,
          sort_by: 'upload_date',
        });
        if (!items || items.length === 0) {
          items = await invidious.search(localizedQuery, {
            page: pageNum,
            type: 'video',
            region: regionCode,
            sort_by: 'relevance',
          });
        }
      }

      if (Array.isArray(items) && items.length > 0) {
        return items.filter((v) => (v.videoId || v.id) && v.title).map(mapInvidiousVideo);
      }
    } catch (invidiousErr) {
      console.warn(`[Feed] Invidious fetch failed for ${categoryId} (${regionCode}):`, invidiousErr);
    }

    // Fallback search
    try {
      const q = categoryQuery(regionCode, cat.id);
      const searchRes = await searchVideosClient(q, 30);
      if (Array.isArray(searchRes) && searchRes.length > 0) {
        return searchRes.filter((v) => v.id && v.title);
      }
    } catch (fallbackErr) {
      console.warn('[Feed] Fallback search failed:', fallbackErr);
    }

    return [];
  }, [regionCode]);

  // Load initial videos
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const list = await fetchFeed(currentCategory, 1);
      if (active) {
        setVideos(list);
        setPage(1);
        setHasMore(list.length > 0);
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [currentCategory, regionCode, fetchFeed]);

  // Load more on button click
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const more = await fetchFeed(currentCategory, nextPage);
    if (more.length > 0) {
      const existingIds = new Set(videos.map((v) => v.id));
      const filtered = more.filter((v) => !existingIds.has(v.id));
      setVideos((prev) => [...prev, ...filtered]);
      setPage(nextPage);
      if (filtered.length === 0) setHasMore(false);
    } else {
      setHasMore(false);
    }
    setLoadingMore(false);
  };

  const handleCategoryClick = (catId: string) => {
    setCurrentCategory(catId);
    const url = new URL(window.location.href);
    url.searchParams.set('category', catId);
    window.history.pushState({}, '', url);
  };

  return (
    <div className="home-page-container" style={{ maxWidth: '1750px', margin: '0 auto', padding: '16px 24px 60px' }}>
      {/* Category Pills (Material 3 Filter Chips) */}
      <div
        className="home-chips-row"
        style={{
          position: 'sticky',
          top: 'var(--yt-header-height)',
          zIndex: 300,
          backgroundColor: 'var(--yt-background)',
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          padding: '10px 0 14px',
          marginBottom: '14px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = currentCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(cat.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '20px',
                border: isActive ? 'none' : '1px solid var(--yt-border)',
                backgroundColor: isActive
                  ? 'var(--md-sys-color-primary, var(--yt-text-primary))'
                  : 'var(--yt-surface)',
                color: isActive
                  ? 'var(--md-sys-color-on-primary, var(--yt-background))'
                  : 'var(--yt-text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                flexShrink: 0,
              }}
            >
              {cat.icon && <span>{cat.icon}</span>}
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Videos Grid */}
      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '16/9',
                  borderRadius: '16px',
                  backgroundColor: 'var(--yt-hover)',
                  animation: 'skeletonPulse 1.5s ease-in-out infinite',
                }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--yt-hover)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      height: '14px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--yt-hover)',
                      width: '80%',
                    }}
                  />
                  <div
                    style={{
                      height: '12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--yt-hover)',
                      width: '50%',
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--yt-text-secondary)' }}>
          <h3 style={{ fontSize: '18px', color: 'var(--yt-text-primary)', marginBottom: '8px' }}>No videos found</h3>
          <p style={{ fontSize: '14px', marginBottom: '20px' }}>Select another category or refresh.</p>
          <button
            onClick={() => handleCategoryClick('Trending')}
            style={{
              padding: '10px 20px',
              borderRadius: '20px',
              backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Load Trending
          </button>
        </div>
      ) : (
        <>
          <div
            className="home-video-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{
                  padding: '12px 32px',
                  borderRadius: '24px',
                  border: '1px solid var(--yt-border)',
                  backgroundColor: 'var(--yt-surface)',
                  color: 'var(--yt-text-primary)',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: loadingMore ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s',
                }}
              >
                {loadingMore ? <LoadingSpinner size="small" color="white" /> : 'Load More Videos'}
              </button>
            </div>
          )}
        </>
      )}

      <style jsx global>{`
        @media (max-width: 600px) {
          .home-page-container {
            padding: 8px 12px 60px !important;
          }
          .home-chips-row {
            margin-left: -12px !important;
            margin-right: -12px !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .home-video-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
        .home-chips-row::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}