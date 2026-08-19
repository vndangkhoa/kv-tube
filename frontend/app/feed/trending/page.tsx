'use client';

import { useState, useEffect, useCallback } from 'react';
import VideoCard from '@/app/components/VideoCard';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { VideoData } from '@/app/constants';
import { invidious } from '@/app/services/invidious';
import { getRegionContent, categoryQuery } from '@/app/regionContent';
import {
  IoFlameOutline,
  IoMusicalNotesOutline,
  IoGameControllerOutline,
  IoFilmOutline,
  IoNewspaperOutline,
  IoHardwareChipOutline,
  IoCodeSlashOutline,
  IoFootballOutline,
  IoMicOutline,
  IoHappyOutline,
  IoFastFoodOutline,
  IoPlanetOutline,
} from 'react-icons/io5';

interface TrendingTabConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  searchQuery?: string;
  description: string;
}

// Map a raw Invidious response into the app's VideoData shape.
function mapTrendingItems(items: any[]): VideoData[] {
  return (Array.isArray(items) ? items : []).map((v: any) => ({
    id: v.videoId || v.id,
    title: v.title,
    uploader: v.author || v.uploader || v.channelTitle || 'Creator',
    thumbnail:
      v.videoThumbnails?.[0]?.url ||
      (typeof v.thumbnail === 'string' ? v.thumbnail.replace('/maxresdefault.jpg', '/mqdefault.jpg') : v.thumbnail) ||
      `https://i.ytimg.com/vi/${v.videoId || v.id}/mqdefault.jpg`,
    duration: v.lengthSeconds
      ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}`
      : v.duration || '',
    view_count: v.viewCount ?? v.view_count ?? 0,
    upload_date: v.publishedText || v.upload_date || '',
    channel_id: v.authorId || v.channel_id || '',
    avatar_url:
      v.authorThumbnails?.[0]?.url ||
      v.authorThumbnails?.[v.authorThumbnails.length - 1]?.url ||
      v.authorThumbnail ||
      v.avatar_url ||
      (v.authorId || v.channel_id ? `/api/channel-avatar?id=${encodeURIComponent(v.authorId || v.channel_id)}` : ''),
  }));
}

// Map a trending tab to its category key in regionContent.ts so the tab uses a
// region-localized search query instead of the hardcoded English one.
const TAB_CATEGORY_KEYS: Record<string, string> = {
  music: 'Music',
  gaming: 'Gaming',
  movies: 'Movies',
  news: 'News',
  tech: 'Tech',
  coding: 'Coding',
  sports: 'Sports',
  podcasts: 'Podcasts',
  comedy: 'Comedy',
  food: 'Food',
  science: 'Science',
};

// Fetch one page of items for a tab. The "now" tab uses the native regional
// trending feed on page 1, then falls back to a regional trending search for
// subsequent pages (Invidious trending has no pagination). Category tabs use a
// region-localized topic search — trending is the collection of the most viewed
// videos, so everything is sorted by view count.
async function fetchTabItems(tab: TrendingTabConfig, region: string, pageNum: number): Promise<any[]> {
  if (tab.id === 'now') {
    if (pageNum === 1) {
      const trending = await invidious.getTrending(region);
      if (Array.isArray(trending) && trending.length > 0) return trending;
      return await invidious.getPopular();
    }
    const rc = getRegionContent(region);
    return await invidious.search(rc.trending, {
      page: pageNum,
      type: 'video',
      sort_by: 'view_count',
      region,
    });
  }
  const categoryKey = TAB_CATEGORY_KEYS[tab.id];
  const query = categoryKey ? categoryQuery(region, categoryKey) : tab.searchQuery || tab.label;
  return await invidious.search(query, {
    page: pageNum,
    type: 'video',
    sort_by: 'view_count',
    region,
  });
}

const TRENDING_TABS: TrendingTabConfig[] = [
  {
    id: 'now',
    label: 'Now',
    icon: <IoFlameOutline size={18} />,
    description: 'Discover what the world is watching right now',
  },
  {
    id: 'music',
    label: 'Music',
    icon: <IoMusicalNotesOutline size={18} />,
    searchQuery: 'official music video top hits',
    description: 'Top trending music videos and chart toppers',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: <IoGameControllerOutline size={18} />,
    searchQuery: 'popular gaming walkthrough highlights',
    description: 'Trending gameplay, esports and game releases',
  },
  {
    id: 'movies',
    label: 'Movies & Trailers',
    icon: <IoFilmOutline size={18} />,
    searchQuery: 'official movie trailers teaser trailers',
    description: 'Latest official movie trailers and cinematic teasers',
  },
  {
    id: 'news',
    label: 'News',
    icon: <IoNewspaperOutline size={18} />,
    searchQuery: 'daily news breaking world news',
    description: 'Breaking news and global headlines',
  },
  {
    id: 'tech',
    label: 'Tech & Gadgets',
    icon: <IoHardwareChipOutline size={18} />,
    searchQuery: 'tech gadgets smartphone review technology',
    description: 'Latest gadget reviews, unboxings and tech news',
  },
  {
    id: 'coding',
    label: 'Coding & Dev',
    icon: <IoCodeSlashOutline size={18} />,
    searchQuery: 'software programming web development tutorial',
    description: 'Developer tutorials, coding courses and tech talks',
  },
  {
    id: 'sports',
    label: 'Sports',
    icon: <IoFootballOutline size={18} />,
    searchQuery: 'sports match highlights top plays',
    description: 'Game recaps, top plays and athletic highlights',
  },
  {
    id: 'podcasts',
    label: 'Podcasts',
    icon: <IoMicOutline size={18} />,
    searchQuery: 'popular podcast full episode interview show',
    description: 'Full-length podcast conversations and interviews',
  },
  {
    id: 'comedy',
    label: 'Comedy',
    icon: <IoHappyOutline size={18} />,
    searchQuery: 'stand up comedy sketches funny',
    description: 'Stand-up specials, sketches and viral laughs',
  },
  {
    id: 'food',
    label: 'Food & Cooking',
    icon: <IoFastFoodOutline size={18} />,
    searchQuery: 'cooking recipe street food delicious',
    description: 'Delicious recipes, culinary guides and street eats',
  },
  {
    id: 'science',
    label: 'Science & Cosmos',
    icon: <IoPlanetOutline size={18} />,
    searchQuery: 'science documentary space physics nature',
    description: 'Deep dives into space, physics and the natural world',
  },
];

export default function TrendingPage() {
  const [activeTab, setActiveTab] = useState('now');
  const [regionCode, setRegionCode] = useState('VN');
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTab = TRENDING_TABS.find((t) => t.id === activeTab) || TRENDING_TABS[0];

  // Initialize and listen to region changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kv_region');
      if (saved) setRegionCode(saved);
    } catch {}

    const handleRegionChange = (e: Event) => {
      const region = (e as CustomEvent).detail?.region;
      if (region) {
        setRegionCode(region);
      }
    };
    window.addEventListener('regionchange', handleRegionChange);
    return () => window.removeEventListener('regionchange', handleRegionChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTrending() {
      setLoading(true);
      setError(null);
      setPage(1);
      setHasMore(false);
      try {
        const tab = TRENDING_TABS.find((t) => t.id === activeTab) || TRENDING_TABS[0];

        const items = await fetchTabItems(tab, regionCode, 1);

        if (!cancelled) {
          setVideos(mapTrendingItems(items));
          setHasMore(items.length > 0);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load trending videos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTrending();
    return () => {
      cancelled = true;
    };
  }, [activeTab, regionCode]);

  // Load the next page and append (deduped) to the current tab's grid.
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const tab = TRENDING_TABS.find((t) => t.id === activeTab) || TRENDING_TABS[0];
      const nextPage = page + 1;
      const items = await fetchTabItems(tab, regionCode, nextPage);
      const mapped = mapTrendingItems(items);
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...mapped.filter((v) => !seen.has(v.id))];
      });
      setPage(nextPage);
      setHasMore(items.length >= 20);
    } catch (err) {
      console.error('[Trending] Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [page, regionCode, activeTab, loadingMore]);

  return (
    <div className="trending-page-container" style={{ maxWidth: '1750px', margin: '0 auto', padding: '16px 24px 60px' }}>
      {/* Material 3 Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
            color: 'var(--md-sys-color-primary, var(--yt-brand-red))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {currentTab.icon}
        </div>
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              margin: '0 0 2px',
              color: 'var(--yt-text-primary)',
            }}
          >
            Trending · {currentTab.label}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', margin: 0 }}>
            {currentTab.description}
          </p>
        </div>
      </div>

      {/* Material 3 Scrollable Filter Chips Row */}
      <div
        className="trending-chips-row"
        style={{
          position: 'sticky',
          top: 'var(--yt-header-height)',
          zIndex: 300,
          backgroundColor: 'var(--yt-background)',
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          padding: '12px 0 16px',
          marginBottom: '16px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {TRENDING_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '24px',
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
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Grid */}
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
              <div
                style={{
                  height: '14px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--yt-hover)',
                  width: '80%',
                }}
              />
            </div>
          ))}
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--yt-text-secondary)' }}>
          <p>{error}</p>
          <button
            onClick={() => setActiveTab(activeTab)}
            style={{
              padding: '8px 20px',
              borderRadius: '20px',
              backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--yt-text-secondary)' }}>
          <p>No trending videos found in this category.</p>
        </div>
      ) : (
        <>
          <div
            className="trending-video-grid"
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

          {hasMore && (
            <div style={{ textAlign: 'center', padding: '28px 0 8px' }}>
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 28px',
                  borderRadius: '20px',
                  backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: loadingMore ? 'wait' : 'pointer',
                  opacity: loadingMore ? 0.7 : 1,
                }}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      <style jsx global>{`
        @media (max-width: 600px) {
          .trending-page-container {
            padding: 12px 12px 60px !important;
          }
          .trending-chips-row {
            margin-left: -12px !important;
            margin-right: -12px !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          .trending-video-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}
