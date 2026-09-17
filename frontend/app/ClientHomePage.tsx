'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import VideoCard from './components/VideoCard';
import ShortsShelf, { ShortItem } from './components/ShortsShelf';
import ExploreTopicsShelf, { DEFAULT_EXPLORE_TOPICS } from './components/ExploreTopicsShelf';
import InfiniteScrollTrigger from './components/InfiniteScrollTrigger';
import { VideoData } from './constants';
import { invidious } from './services/invidious';
import { categoryQuery, getRegionContent } from './regionContent';
import { searchVideosClient } from './clientActions';
import { formatRelativeTime, proxiedImageUrl, isShortVideo } from './utils';
import { IoChevronBack, IoChevronForward, IoChevronDown } from 'react-icons/io5';

const CATEGORY_TOPIC_MAP: Record<string, string[]> = {
  Music: [
    'Immersive K-Pop audio',
    'Electronic vibes only',
    'Lo-Fi beats study chill',
    'Acoustic guitar live sessions',
    '80s synthwave retro music',
    'Rock guitar solos',
    'Electropop music hits',
  ],
  'Youth music': [
    'Nhạc trẻ remix thịnh hành',
    'V-Pop acoustic live',
    'Indie Việt hay nhất',
    'Nhạc lofi Việt chill',
    'Ballad Việt Nam',
  ],
  Gaming: [
    'Retro gaming walkthroughs',
    'PC build benchmarks',
    'Speedruns world record',
    'Unreal Engine 5 games',
    'Graphics processing units',
    'Indie game development',
    'Elden Ring boss fights',
  ],
  Electropop: [
    'Synthwave 80s retro',
    'Future bass electronic',
    'Electropop music hits',
    'Electronic vibes only',
  ],
  Mixes: [
    'DJ nonstop remix',
    'Deep house club mix',
    'Chillout sunset mix',
    'Remix trending songs',
  ],
  'Dance-Pop': [
    'Dance pop playlist',
    'Party dance workout',
    'Electronic dance music',
    'Upbeat dance hits',
  ],
  AI: [
    'AI video generation',
    'AI image editing',
    'Deep learning tools',
    'LLM prompt engineering',
    'Autonomous AI agents',
    'Graphics processing units',
  ],
  'Computer Hardware': [
    'Graphics processing units',
    'PC build benchmarks',
    'Windows 11 troubleshooting',
    'Raspberry Pi projects',
    'Smart eyewear',
    'Custom water cooling PC',
  ],
  Podcasts: [
    'Tech interviews podcasts',
    'Deep dive conversations',
    'Self improvement talks',
    'Science tech podcast',
  ],
  Apple: [
    'Apple iPhone tips',
    'MacBook Pro setup',
    'Apple Vision Pro review',
    'iOS features and hidden tricks',
  ],
  News: [
    'Tech industry news',
    'World news breakdown',
    'Science and nature discoveries',
  ],
};

const REGION_MUSIC_TOPICS: Record<string, string[]> = {
  VN: [
    'Nhạc trẻ remix thịnh hành',
    'V-Pop acoustic live',
    'Indie Việt hay nhất',
    'Nhạc lofi Việt chill',
    'Ballad Việt Nam',
    'Rap Việt hot trend',
    'Nhạc acoustic chill thư giãn',
  ],
  JP: [
    'J-Pop 最新 ヒット',
    'アニソン 最新',
    'ボカロ 名曲',
    'シティポップ',
    '邦楽 ロック',
  ],
  KR: [
    'K-POP 인기곡',
    '케이팝 댄스',
    'K-Indie 감성 힐링',
    '한국 힙합 최신',
  ],
  IN: [
    'Hindi songs top hits',
    'Bollywood romantic songs',
    'Punjabi party songs',
    'Indian lofi chill beats',
  ],
};

function getCategoryTopics(categoryId: string, regionCode: string): string[] {
  if ((categoryId === 'Music' || categoryId === 'Youth music') && REGION_MUSIC_TOPICS[regionCode]) {
    return REGION_MUSIC_TOPICS[regionCode];
  }
  return CATEGORY_TOPIC_MAP[categoryId] || DEFAULT_EXPLORE_TOPICS;
}

interface CategoryConfig {
  id: string;
  label: string;
  trendingType?: string;
  searchQuery?: string;
}

// Matching the topic chips from user's YouTube screenshot, localized by region
const CATEGORIES: CategoryConfig[] = [
  { id: 'All', label: 'All' },
  { id: 'Music', label: 'Music' },
  { id: 'Youth music', label: 'Youth music' },
  { id: 'Gaming', label: 'Gaming' },
  { id: 'Electropop', label: 'Electropop', searchQuery: 'electropop official music hits' },
  { id: 'Mixes', label: 'Mixes', searchQuery: 'dj nonstop remix mix nhạc' },
  { id: 'Dance-Pop', label: 'Dance-Pop', searchQuery: 'dance pop songs official' },
  { id: 'Graphics processing units', label: 'Graphics processing units', searchQuery: 'NVIDIA RTX AMD Radeon GPU review benchmark' },
  { id: 'Computer Hardware', label: 'Computer Hardware', searchQuery: 'PC build computer hardware tech setup' },
  { id: 'Podcasts', label: 'Podcasts' },
  { id: 'AI', label: 'AI', searchQuery: 'artificial intelligence LLM machine learning' },
  { id: 'Apple', label: 'Apple', searchQuery: 'Apple iPhone Mac iPad tech review' },
  { id: 'News', label: 'News' },
  { id: 'Live', label: 'Live Streams' },
];

function isUsableFreshVideo(v: any): boolean {
  if (!v || !(v.videoId || v.id) || !v.title) return false;
  if (v.liveNow) return false;
  if (isShortVideo(v)) return false;
  if (v.viewCount === 0 && (v.lengthSeconds === 0 || v.duration === '0:00')) return false;

  const pText = (v.publishedText || v.upload_date || '').toLowerCase();
  if (
    pText.includes('year') ||
    pText.includes('yr') ||
    pText.includes('năm') ||
    pText.includes('سنة') ||
    pText.includes('السنة')
  ) {
    return false;
  }
  if (typeof v.published === 'number' && v.published > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - v.published > 120 * 24 * 3600) {
      return false;
    }
  }
  return true;
}

function isUsableTrendingVideo(v: any): boolean {
  if (!v || !(v.videoId || v.id) || !v.title) return false;
  if (v.liveNow) return false;
  if (isShortVideo(v)) return false;
  if (v.viewCount === 0 && (v.lengthSeconds === 0 || v.duration === '0:00')) return false;
  return true;
}

function mapInvidiousVideo(v: any, regionCode: string = 'VN'): VideoData {
  const vidId = v.videoId || v.id || '';
  let thumbUrl = vidId ? `https://i.ytimg.com/vi_webp/${vidId}/hq720.webp` : '';
  if (Array.isArray(v.videoThumbnails) && v.videoThumbnails.length > 0) {
    const best = v.videoThumbnails.find((t: any) =>
      t.quality === 'high' || t.quality === 'maxres' || t.url?.includes('hq720') || t.url?.includes('hqdefault')
    );
    thumbUrl = proxiedImageUrl(best?.url || v.videoThumbnails[0]?.url || thumbUrl, vidId);
  } else if (v.thumbnail && !v.thumbnail.includes('mqdefault.jpg')) {
    thumbUrl = proxiedImageUrl(v.thumbnail, vidId);
  }

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

  const locale = regionCode === 'VN' ? 'vi' : 'en';
  const relTime = formatRelativeTime(v.publishedText || v.upload_date, v.published, locale);

  return {
    id: vidId,
    title: v.title || 'Untitled',
    uploader: v.author || v.uploader || v.channelTitle || 'Unknown Creator',
    channel_id: v.authorId || v.channel_id || '',
    thumbnail: thumbUrl,
    duration: dur,
    view_count: v.viewCount ?? v.view_count ?? 0,
    upload_date: relTime || v.publishedText || v.upload_date || '',
    publishedAt: relTime || v.publishedText || '',
    avatar_url: avatar,
  };
}

export default function ClientHomePage() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category') || 'All';
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [shorts, setShorts] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentCategory, setCurrentCategory] = useState(categoryParam);
  const [regionCode, setRegionCode] = useState('VN');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showClusterExpanded, setShowClusterExpanded] = useState(false);
  const [activeSubTopic, setActiveSubTopic] = useState('');
  const [clusterVideos, setClusterVideos] = useState<VideoData[]>([]);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [isShelfHidden, setIsShelfHidden] = useState(false);
  const [dismissedTopics, setDismissedTopics] = useState<string[]>([]);

  // Load preferences and choose dynamic initial subtopic on mount
  useEffect(() => {
    try {
      const hidden = localStorage.getItem('kv_hide_explore_shelf') === 'true';
      setIsShelfHidden(hidden);
      const dismissed: string[] = JSON.parse(localStorage.getItem('kv_dismissed_subtopics') || '[]');
      if (Array.isArray(dismissed)) setDismissedTopics(dismissed);

      const candidateTopics = getCategoryTopics(currentCategory, regionCode)
        .filter((t) => !dismissed.includes(t));

      if (candidateTopics.length > 0) {
        let chosenTopic = '';
        // 1. Try matching with recent watch history
        try {
          const history = JSON.parse(localStorage.getItem('kvtube_history') || '[]');
          if (Array.isArray(history) && history.length > 0) {
            const recentTitles = history
              .slice(0, 15)
              .map((h: any) => (h.title || '').toLowerCase())
              .join(' ');
            const matched = candidateTopics.find((topic) => {
              const words = topic.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
              return words.some((w: string) => recentTitles.includes(w));
            });
            if (matched) chosenTopic = matched;
          }
        } catch {}

        // 2. Pick a random candidate topic for fresh variety if no watch history match
        if (!chosenTopic) {
          const randomIndex = Math.floor(Math.random() * candidateTopics.length);
          chosenTopic = candidateTopics[randomIndex];
        }

        setActiveSubTopic(chosenTopic);
      }
    } catch {}
  }, []);

  const currentCategoryTopics = getCategoryTopics(currentCategory, regionCode);
  const availableSubTopics = currentCategoryTopics.filter((t) => !dismissedTopics.includes(t));

  // Sync activeSubTopic if available subtopics change (and activeSubTopic was set but no longer valid)
  useEffect(() => {
    if (activeSubTopic && availableSubTopics.length > 0 && !availableSubTopics.includes(activeSubTopic)) {
      setActiveSubTopic(availableSubTopics[0]);
    }
  }, [availableSubTopics, activeSubTopic]);

  // Fetch videos for the inline Explore Topics cluster
  useEffect(() => {
    if (isShelfHidden || !activeSubTopic) return;
    let cancelled = false;
    setClusterLoading(true);

    searchVideosClient(activeSubTopic, 9)
      .then((items) => {
        if (!cancelled) {
          setClusterVideos(items || []);
          setClusterLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[ExploreTopicsShelf] Failed to fetch cluster videos:', err);
        if (!cancelled) setClusterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSubTopic, isShelfHidden]);

  const handleSelectSubTopic = (subTopic: string) => {
    setActiveSubTopic(subTopic);
  };

  const handleHideShelf = () => {
    setIsShelfHidden(true);
    try {
      localStorage.setItem('kv_hide_explore_shelf', 'true');
    } catch {}
  };

  const handleDismissTopic = (topic: string) => {
    const updated = [...dismissedTopics, topic];
    setDismissedTopics(updated);
    try {
      localStorage.setItem('kv_dismissed_subtopics', JSON.stringify(updated));
    } catch {}
    const remaining = availableSubTopics.filter((t) => t !== topic);
    if (remaining.length > 0) {
      setActiveSubTopic(remaining[0]);
    }
  };

  const chipsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (chipsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = chipsRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  const scrollChips = (dir: 'left' | 'right') => {
    if (chipsRef.current) {
      const amount = dir === 'left' ? -260 : 260;
      chipsRef.current.scrollBy({ left: amount, behavior: 'smooth' });
      setTimeout(checkScroll, 300);
    }
  };

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

  // Fetch shorts for the home Shorts shelf
  useEffect(() => {
    async function loadShorts() {
      try {
        const query = regionCode === 'VN' ? '#shorts việt nam' : '#shorts trending';
        const items = await invidious.search(query, {
          page: 1,
          type: 'video',
          duration: 'short',
          region: regionCode,
        });

        if (Array.isArray(items) && items.length > 0) {
          const filtered = items.filter(
            (v: any) => (!v.lengthSeconds || v.lengthSeconds <= 95) && (v.videoId || v.id)
          );
          const list = filtered.length >= 5 ? filtered : items.filter((v: any) => v.videoId || v.id);

          const mapped: ShortItem[] = list.slice(0, 10).map((v: any, i: number) => {
            const vidId = v.videoId || v.id;
            return {
              id: vidId,
              title: v.title,
              uploader: v.author || v.uploader || 'Creator',
              thumbnail: vidId
                ? `https://i.ytimg.com/vi_webp/${vidId}/hqdefault.webp`
                : (v.videoThumbnails?.[0]?.url || v.thumbnail || ''),
              view_count: v.viewCount ?? v.view_count,
              isNew: i === 0 || i === 4,
            };
          });

          if (mapped.length > 0) {
            setShorts(mapped);
          }
        }
      } catch (err) {
        console.error('Failed to load shorts for shelf:', err);
      }
    }
    loadShorts();
  }, [regionCode]);

  // Fetch videos for selected category directly via Invidious backend
  const fetchFeed = useCallback(async (categoryId: string, pageNum: number): Promise<VideoData[]> => {
    const cat = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
    const rc = getRegionContent(regionCode);

    try {
      let items: any[] = [];

      if (cat.id === 'All' && pageNum > 1) {
        items = await invidious.search(rc.trending, {
          page: pageNum,
          type: 'video',
          region: regionCode,
          date: 'month',
          sort_by: 'upload_date',
        });
        if (Array.isArray(items)) {
          items = items.filter(isUsableFreshVideo);
        }
        if (!items || items.length === 0) {
          items = await invidious.search(rc.trending, {
            page: pageNum,
            type: 'video',
            region: regionCode,
            date: 'month',
            sort_by: 'view_count',
          });
          if (Array.isArray(items)) {
            items = items.filter(isUsableFreshVideo);
          }
        }
      } else if (cat.id === 'All') {
        const [latestRes, popularRes, trendingRes] = await Promise.allSettled([
          invidious.search(rc.trending, {
            page: 1,
            type: 'video',
            region: regionCode,
            date: 'month',
            sort_by: 'upload_date',
          }),
          invidious.search(rc.trending, {
            page: 1,
            type: 'video',
            region: regionCode,
            date: 'month',
            sort_by: 'view_count',
          }),
          invidious.getTrending(regionCode),
        ]);
        const latest =
          latestRes.status === 'fulfilled'
            ? (latestRes.value || []).filter(isUsableFreshVideo)
            : [];
        const popular =
          popularRes.status === 'fulfilled'
            ? (popularRes.value || []).filter(isUsableFreshVideo)
            : [];
        const trendingNow =
          trendingRes.status === 'fulfilled'
            ? (trendingRes.value || []).filter(isUsableTrendingVideo)
            : [];

        const seen = new Set<string>();
        const merged: any[] = [];
        let li = 0;
        let pi = 0;
        let ti = 0;
        const total = latest.length + popular.length + trendingNow.length;
        const targetCount = Math.min(total, 40);

        while (merged.length < targetCount) {
          for (let k = 0; k < 2 && li < latest.length; k++) {
            const id = latest[li].videoId || latest[li].id;
            if (id && !seen.has(id)) {
              seen.add(id);
              merged.push(latest[li]);
            }
            li++;
          }
          if (pi < popular.length) {
            const id = popular[pi].videoId || popular[pi].id;
            if (id && !seen.has(id)) {
              seen.add(id);
              merged.push(popular[pi]);
            }
            pi++;
          }
          if (ti < trendingNow.length) {
            const id = trendingNow[ti].videoId || trendingNow[ti].id;
            if (id && !seen.has(id)) {
              seen.add(id);
              merged.push(trendingNow[ti]);
            }
            ti++;
          }
          if (li >= latest.length && pi >= popular.length && ti >= trendingNow.length) break;
        }
        items = merged;
      } else if (cat.id === 'Live') {
        const localizedQuery = rc.categories['Live'] || 'live stream';
        items = await invidious.search(localizedQuery, {
          page: pageNum,
          type: 'video',
          region: regionCode,
          features: 'live',
        });
        if (!items || items.length === 0) {
          items = await invidious.search(localizedQuery, {
            page: pageNum,
            type: 'video',
            region: regionCode,
          });
        }
        if (Array.isArray(items)) {
          items = items.filter((v: any) => (v.videoId || v.id) && v.title);
        }
      } else {
        // Resolve localized query from region content first, then fallback to category query or cat.searchQuery
        const localizedQuery =
          rc.categories[cat.id] || cat.searchQuery || categoryQuery(regionCode, cat.id);

        items = await invidious.search(localizedQuery, {
          page: pageNum,
          type: 'video',
          region: regionCode,
        });
        if (Array.isArray(items)) {
          const fresh = items.filter(isUsableFreshVideo);
          items =
            fresh.length >= 4
              ? fresh
              : items.filter((v: any) => (v.videoId || v.id) && v.title && !v.liveNow);
        }
      }

      return items.map((v) => mapInvidiousVideo(v, regionCode));
    } catch (err) {
      console.error('Error in fetchFeed:', err);
      return [];
    }
  }, [regionCode]);

  // Load feed on category or region change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(1);
    setHasMore(true);

    fetchFeed(currentCategory, 1)
      .then((res) => {
        if (!cancelled) {
          setVideos(res);
          setLoading(false);
          if (res.length === 0) setHasMore(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentCategory, regionCode, fetchFeed]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const newVideos = await fetchFeed(currentCategory, nextPage);
      if (newVideos.length > 0) {
        let addedCount = 0;
        setVideos((prev) => {
          const existingIds = new Set(prev.map((v) => v.id));
          const filtered = newVideos.filter((v) => !existingIds.has(v.id));
          addedCount = filtered.length;
          return [...prev, ...filtered];
        });
        setPage(nextPage);
        if (addedCount === 0) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[HomePage] Failed to load more videos:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, fetchFeed, currentCategory]);

  const handleCategoryClick = (catId: string) => {
    setCurrentCategory(catId);
    const url = new URL(window.location.href);
    url.searchParams.set('category', catId);
    window.history.pushState({}, '', url);

    const nextTopics = getCategoryTopics(catId, regionCode).filter(
      (t) => !dismissedTopics.includes(t)
    );
    if (nextTopics.length > 0) {
      setActiveSubTopic(nextTopics[0]);
    }
  };

  return (
    <div className="home-page-container">
      {/* Category Pills / Topic Chips Row matching YouTube */}
      <div className="yt-chips-container">
        {canScrollLeft && (
          <div className="yt-chips-arrow-wrapper left">
            <button
              type="button"
              className="yt-chips-arrow-btn"
              onClick={() => scrollChips('left')}
              title="Previous"
            >
              <IoChevronBack size={18} />
            </button>
          </div>
        )}

        <div
          ref={chipsRef}
          onScroll={checkScroll}
          className="yt-chips-scrollable"
        >
          {CATEGORIES.map((cat) => {
            const isActive = currentCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryClick(cat.id)}
                className={`yt-topic-chip ${isActive ? 'active' : ''}`}
              >
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {canScrollRight && (
          <div className="yt-chips-arrow-wrapper right">
            <button
              type="button"
              className="yt-chips-arrow-btn"
              onClick={() => scrollChips('right')}
              title="Next"
            >
              <IoChevronForward size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Videos Grid with YouTube Shorts Shelf interweaved */}
      {loading ? (
        <div className="home-video-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="yt-skeleton-card">
              <div className="yt-skeleton-thumb" />
              <div className="yt-skeleton-meta">
                <div className="yt-skeleton-avatar" />
                <div className="yt-skeleton-lines">
                  <div className="yt-skeleton-line title" />
                  <div className="yt-skeleton-line sub" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="yt-no-videos">
          <h3>No videos found</h3>
          <p>Select another category or refresh.</p>
          <button
            onClick={() => handleCategoryClick('All')}
            className="yt-reload-btn"
          >
            Go to All
          </button>
        </div>
      ) : (
        <>
          {/* Row 1: Top video cards */}
          <div className="home-video-grid">
            {videos.slice(0, 3).map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>

          {/* Explore More Topics in-feed shelf (matching screenshot) */}
          {page === 1 && !isShelfHidden && availableSubTopics.length > 0 && (
            <>
              <ExploreTopicsShelf
                topics={availableSubTopics}
                activeTopic={activeSubTopic}
                onSelectTopic={handleSelectSubTopic}
                onHideShelf={handleHideShelf}
                onDismissTopic={handleDismissTopic}
              />

              {/* Row 2: Cluster video cards */}
              <div className="home-video-grid">
                {clusterLoading || !activeSubTopic ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={`cluster-skel-${i}`} className="yt-skeleton-card">
                      <div className="yt-skeleton-thumb" />
                      <div className="yt-skeleton-meta">
                        <div className="yt-skeleton-avatar" />
                        <div className="yt-skeleton-lines">
                          <div className="yt-skeleton-line title" />
                          <div className="yt-skeleton-line sub" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : clusterVideos.length > 0 ? (
                  clusterVideos.slice(0, showClusterExpanded ? 6 : 3).map((v) => (
                    <VideoCard key={`cluster-${v.id}`} video={v} />
                  ))
                ) : (
                  videos.slice(3, 6).map((v) => (
                    <VideoCard key={`cluster-fallback-${v.id}`} video={v} />
                  ))
                )}
              </div>

              {/* Inline Show More Cluster Divider */}
              {(clusterVideos.length > 3 || (!clusterLoading && videos.length > 6)) && (
                <div className="yt-cluster-divider">
                  <div className="yt-cluster-line" />
                  <button
                    type="button"
                    className="yt-cluster-show-more-btn"
                    onClick={() => setShowClusterExpanded(!showClusterExpanded)}
                  >
                    <span>{showClusterExpanded ? 'Show fewer' : 'Show more'}</span>
                    <IoChevronDown
                      size={18}
                      style={{
                        transform: showClusterExpanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    />
                  </button>
                  <div className="yt-cluster-line" />
                </div>
              )}
            </>
          )}

          {/* YouTube Shorts Shelf */}
          {page === 1 && <ShortsShelf shorts={shorts} />}

          {/* Row 3 onwards: Regular video cards */}
          <div className="home-video-grid">
            {videos.slice(3).map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>

          {/* Infinite Scroll Lazy Loading */}
          <InfiniteScrollTrigger
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoading={loadingMore}
            endMessage="No more videos"
          />
        </>
      )}
    </div>
  );
}