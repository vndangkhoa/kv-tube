'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { invidious } from '../services/invidious';
import { VideoData } from '../constants';
import VideoCard from '../components/VideoCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { isSubscribed, toggleSubscription } from '../storage';
import {
  IoFilterOutline,
  IoSearchOutline,
  IoVideocamOutline,
  IoPersonOutline,
  IoListOutline,
  IoGridOutline,
  IoCloseOutline,
  IoCheckmark,
  IoPersonAddOutline,
  IoTimeOutline,
  IoEyeOutline,
  IoCalendarOutline,
} from 'react-icons/io5';

function formatSubscribers(count?: number): string {
  if (!count) return '';
  if (count >= 1000000) return (count / 1000000).toFixed(2) + 'M subscribers';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K subscribers';
  return count + ' subscribers';
}

function formatViews(views?: number | string): string {
  if (!views || views === '0' || views === 0) return '0 views';
  const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, '') || '0');
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M views';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K views';
  return num.toLocaleString() + ' views';
}

export default function ClientSearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Search Filters
  const [filterType, setFilterType] = useState<'all' | 'video' | 'channel' | 'playlist'>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'upload_date' | 'view_count' | 'rating'>('relevance');
  const [dateFilter, setDateFilter] = useState<'' | 'hour' | 'today' | 'week' | 'month' | 'year'>('');
  const [durationFilter, setDurationFilter] = useState<'' | 'short' | 'medium' | 'long'>('');

  const [subscribedMap, setSubscribedMap] = useState<{ [channelId: string]: boolean }>({});

  const executeSearch = useCallback(
    async (q: string, pageNum: number, append: boolean = false) => {
      if (!q.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const region = (typeof window !== 'undefined' ? localStorage.getItem('kv_region') : null) || 'VN';

        const searchOptions: any = {
          page: pageNum,
          sort_by: sortBy,
          type: filterType === 'all' ? undefined : filterType,
          region,
        };

        if (dateFilter) searchOptions.date = dateFilter;
        if (durationFilter) searchOptions.duration = durationFilter;

        const data = await invidious.search(q, searchOptions);
        const list = Array.isArray(data) ? data : [];

        if (append) {
          setResults((prev) => {
            const seen = new Set(prev.map((item) => item.videoId || item.authorId || item.playlistId));
            const newUnique = list.filter(
              (item) => !seen.has(item.videoId || item.authorId || item.playlistId)
            );
            return [...prev, ...newUnique];
          });
        } else {
          setResults(list);
        }

        setHasMore(list.length >= 15);
      } catch (e) {
        console.error('[Search] Invidious search failed:', e);
        if (!append) setResults([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filterType, sortBy, dateFilter, durationFilter]
  );

  useEffect(() => {
    setPage(1);
    executeSearch(query, 1, false);
  }, [query, executeSearch]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    executeSearch(query, nextPage, true);
  };

  const handleToggleSub = (e: React.MouseEvent, channel: { channelId: string; channelName: string; channelAvatar?: string }) => {
    e.preventDefault();
    e.stopPropagation();
    const next = toggleSubscription(channel);
    setSubscribedMap((prev) => ({ ...prev, [channel.channelId]: next }));
  };

  const hasActiveFilters = filterType !== 'all' || sortBy !== 'relevance' || dateFilter !== '' || durationFilter !== '';

  const resetFilters = () => {
    setFilterType('all');
    setSortBy('relevance');
    setDateFilter('');
    setDurationFilter('');
  };

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '16px 24px 60px' }}>
      {/* Search Header & Unified Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '20px',
          borderBottom: '1px solid var(--yt-border)',
          paddingBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
              color: 'var(--md-sys-color-primary, var(--yt-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <IoSearchOutline size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--yt-text-primary)', margin: '0 0 2px' }}>
              Results for &quot;<span style={{ color: 'var(--md-sys-color-primary, var(--yt-blue))' }}>{query}</span>&quot;
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              {loading ? 'Searching...' : `${results.length} results found`}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filter Toggle Button */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '20px',
              border: '1px solid var(--yt-border)',
              backgroundColor: showFilters || hasActiveFilters ? 'var(--md-sys-color-primary, var(--yt-blue))' : 'var(--yt-surface)',
              color: showFilters || hasActiveFilters ? '#ffffff' : 'var(--yt-text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <IoFilterOutline size={16} />
            <span>Filters</span>
            {hasActiveFilters && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#fff' }} />}
          </button>

          {/* View Toggle */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--yt-surface)',
              border: '1px solid var(--yt-border)',
              borderRadius: '20px',
              padding: '2px',
            }}
          >
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '6px 12px',
                borderRadius: '18px',
                border: 'none',
                backgroundColor: viewMode === 'grid' ? 'var(--yt-hover)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 600,
              }}
              title="Grid View"
            >
              <IoGridOutline size={16} />
              <span>Grid</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '6px 12px',
                borderRadius: '18px',
                border: 'none',
                backgroundColor: viewMode === 'list' ? 'var(--yt-hover)' : 'transparent',
                color: viewMode === 'list' ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 600,
              }}
              title="List View"
            >
              <IoListOutline size={16} />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Invidious Search Filters Tray */}
      {showFilters && (
        <div
          style={{
            backgroundColor: 'var(--yt-surface)',
            border: '1px solid var(--yt-border)',
            borderRadius: '20px',
            padding: '20px 24px',
            marginBottom: '28px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '20px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Type */}
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Type
            </span>
            {(['all', 'video', 'channel', 'playlist'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  background: filterType === t ? 'var(--yt-hover)' : 'transparent',
                  border: 'none',
                  color: filterType === t ? 'var(--md-sys-color-primary, var(--yt-blue))' : 'var(--yt-text-primary)',
                  fontWeight: filterType === t ? 700 : 400,
                  fontSize: '13px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {t === 'all' ? 'All Types' : t + 's'}
              </button>
            ))}
          </div>

          {/* Sort By */}
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Sort By
            </span>
            {[
              { id: 'relevance', label: 'Relevance' },
              { id: 'upload_date', label: 'Upload date' },
              { id: 'view_count', label: 'View count' },
              { id: 'rating', label: 'Rating' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSortBy(s.id as any)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  background: sortBy === s.id ? 'var(--yt-hover)' : 'transparent',
                  border: 'none',
                  color: sortBy === s.id ? 'var(--md-sys-color-primary, var(--yt-blue))' : 'var(--yt-text-primary)',
                  fontWeight: sortBy === s.id ? 700 : 400,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Upload Date */}
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Upload Date
            </span>
            {[
              { id: '', label: 'Anytime' },
              { id: 'hour', label: 'Last hour' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This week' },
              { id: 'month', label: 'This month' },
              { id: 'year', label: 'This year' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDateFilter(d.id as any)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  background: dateFilter === d.id ? 'var(--yt-hover)' : 'transparent',
                  border: 'none',
                  color: dateFilter === d.id ? 'var(--md-sys-color-primary, var(--yt-blue))' : 'var(--yt-text-primary)',
                  fontWeight: dateFilter === d.id ? 700 : 400,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Duration */}
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Duration
            </span>
            {[
              { id: '', label: 'Any duration' },
              { id: 'short', label: 'Under 4 minutes' },
              { id: 'medium', label: '4 - 20 minutes' },
              { id: 'long', label: 'Over 20 minutes' },
            ].map((dur) => (
              <button
                key={dur.id}
                type="button"
                onClick={() => setDurationFilter(dur.id as any)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  background: durationFilter === dur.id ? 'var(--yt-hover)' : 'transparent',
                  border: 'none',
                  color: durationFilter === dur.id ? 'var(--md-sys-color-primary, var(--yt-blue))' : 'var(--yt-text-primary)',
                  fontWeight: durationFilter === dur.id ? 700 : 400,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {dur.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Feed */}
      {loading ? (
        <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner text="Searching Invidious..." />
        </div>
      ) : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--yt-text-secondary)' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--yt-hover)',
              color: 'var(--yt-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <IoSearchOutline size={32} />
          </div>
          <h3 style={{ fontSize: '18px', color: 'var(--yt-text-primary)', marginBottom: '8px' }}>
            No results found for &quot;{query}&quot;
          </h3>
          <p style={{ fontSize: '14px', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
            Try checking your spelling or using different, more general keywords.
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              style={{
                padding: '10px 24px',
                borderRadius: '24px',
                backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Unified Grid View matching Home / Trending / Subscriptions */
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px',
            }}
          >
            {results.map((item, index) => {
              const itemType = item.type || (item.authorId && !item.videoId ? 'channel' : 'video');

              // 1. Channel Card in Grid
              if (itemType === 'channel') {
                let avatar =
                  item.authorThumbnails?.[item.authorThumbnails.length - 1]?.url ||
                  item.authorThumbnails?.[0]?.url ||
                  item.authorThumbnail ||
                  item.avatar_url ||
                  item.thumbnail ||
                  '';
                if (avatar.startsWith('//')) avatar = 'https:' + avatar;
                if (avatar.startsWith('/ggpht') || avatar.startsWith('/yt')) avatar = 'https://yt3.ggpht.com' + avatar;
                if (!avatar && item.authorId) avatar = `/api/channel-avatar?id=${encodeURIComponent(item.authorId)}`;
                const avatarSrc = avatar
                  ? avatar.includes('googleusercontent.com') || avatar.includes('ggpht.com')
                    ? avatar
                    : avatar.startsWith('http')
                      ? `/api/proxy?url=${encodeURIComponent(avatar)}`
                      : avatar
                  : '';
                const isSub = subscribedMap[item.authorId] ?? isSubscribed(item.authorId);
                return (
                  <div
                    key={item.authorId || index}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      padding: '24px 16px',
                      backgroundColor: 'var(--yt-surface)',
                      border: '1px solid var(--yt-border)',
                      borderRadius: '16px',
                      gap: '12px',
                    }}
                  >
                    <Link
                      href={`/channel/${item.authorId}`}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                    >
                      <div
                        style={{
                          width: '84px',
                          height: '84px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--yt-hover)',
                          color: 'var(--yt-text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '28px',
                          overflow: 'hidden',
                          marginBottom: '10px',
                          position: 'relative',
                          flexShrink: 0,
                        }}
                      >
                        <span>{(item.author || 'C').charAt(0).toUpperCase()}</span>
                        {avatarSrc && (
                          <img
                            src={avatarSrc}
                            alt={item.author}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              const img = e.currentTarget as HTMLImageElement;
                              if (item.authorId && !img.src.includes('/api/channel-avatar?id=')) {
                                img.src = `/api/channel-avatar?id=${encodeURIComponent(item.authorId)}`;
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
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--yt-text-primary)', margin: '0 0 4px' }}>
                        {item.author}
                      </h3>
                      <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                        {formatSubscribers(item.subCount)} {item.videoCount ? `· ${item.videoCount} videos` : ''}
                      </span>
                    </Link>

                    <button
                      type="button"
                      onClick={(e) => handleToggleSub(e, { channelId: item.authorId, channelName: item.author, channelAvatar: avatar })}
                      style={{
                        padding: '6px 18px',
                        borderRadius: '20px',
                        border: 'none',
                        backgroundColor: isSub ? 'var(--yt-hover)' : 'var(--md-sys-color-primary, var(--yt-blue))',
                        color: isSub ? 'var(--yt-text-primary)' : '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {isSub ? <><IoCheckmark size={14} /> Subscribed</> : <><IoPersonAddOutline size={14} /> Subscribe</>}
                    </button>
                  </div>
                );
              }

              // 2. Playlist Card in Grid
              if (itemType === 'playlist') {
                return (
                  <Link
                    key={item.playlistId || index}
                    href={`/playlist?list=${item.playlistId}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      textDecoration: 'none',
                      backgroundColor: 'var(--yt-surface)',
                      borderRadius: '16px',
                      padding: '8px',
                      border: '1px solid var(--yt-border)',
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: '12px', backgroundColor: 'var(--yt-hover)', position: 'relative', overflow: 'hidden' }}>
                      {item.playlistThumbnail && (
                        <img src={item.playlistThumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 600, gap: '6px' }}>
                        <IoListOutline size={18} /> {item.videoCount || 0} videos
                      </div>
                    </div>
                    <div style={{ padding: '0 4px 4px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: '0 0 4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.title}
                      </h3>
                      <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                        {item.author} · Playlist
                      </span>
                    </div>
                  </Link>
                );
              }

              // 3. Video Card in Grid
              const vidId = item.videoId || item.id;
              const thumbs = item.videoThumbnails;
              const thumbUrl = `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`;
              const dur = item.lengthSeconds ? `${Math.floor(item.lengthSeconds / 60)}:${(item.lengthSeconds % 60).toString().padStart(2, '0')}` : '';

              const mappedVideo: VideoData = {
                id: vidId,
                title: item.title || 'Untitled',
                uploader: item.author || 'Creator',
                thumbnail: thumbUrl,
                duration: dur,
                view_count: item.viewCount ?? 0,
                upload_date: item.publishedText || '',
                publishedAt: item.publishedText || '',
                channel_id: item.authorId || '',
                avatar_url:
                  item.authorThumbnails?.[0]?.url ||
                  item.authorThumbnails?.[item.authorThumbnails.length - 1]?.url ||
                  item.authorThumbnail ||
                  '',
              };

              return <VideoCard key={vidId || index} video={mappedVideo} />;
            })}
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
                }}
              >
                {loadingMore ? <LoadingSpinner size="small" color="white" /> : 'Load More Results'}
              </button>
            </div>
          )}
        </>
      ) : (
        /* Classic List View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {results.map((item, index) => {
            const itemType = item.type || (item.authorId && !item.videoId ? 'channel' : 'video');

            if (itemType === 'channel') {
              let avatar =
                item.authorThumbnails?.[item.authorThumbnails.length - 1]?.url ||
                item.authorThumbnails?.[0]?.url ||
                item.authorThumbnail ||
                item.avatar_url ||
                item.thumbnail ||
                '';
              if (avatar.startsWith('//')) avatar = 'https:' + avatar;
              if (avatar.startsWith('/ggpht') || avatar.startsWith('/yt')) avatar = 'https://yt3.ggpht.com' + avatar;
              if (!avatar && item.authorId) avatar = `/api/channel-avatar?id=${encodeURIComponent(item.authorId)}`;
              const avatarSrc = avatar
                ? avatar.includes('googleusercontent.com') || avatar.includes('ggpht.com')
                  ? avatar
                  : avatar.startsWith('http')
                    ? `/api/proxy?url=${encodeURIComponent(avatar)}`
                    : avatar
                : '';

              return (
                <Link
                  key={item.authorId || index}
                  href={`/channel/${item.authorId}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    padding: '16px 20px',
                    backgroundColor: 'var(--yt-surface)',
                    border: '1px solid var(--yt-border)',
                    borderRadius: '16px',
                    textDecoration: 'none',
                  }}
                >
                  <div
                    style={{
                      width: '68px',
                      height: '68px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--yt-hover)',
                      color: 'var(--yt-text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '24px',
                      overflow: 'hidden',
                      position: 'relative',
                      flexShrink: 0,
                    }}
                  >
                    <span>{(item.author || 'C').charAt(0).toUpperCase()}</span>
                    {avatarSrc && (
                      <img
                        src={avatarSrc}
                        alt={item.author}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          if (item.authorId && !img.src.includes('/api/channel-avatar?id=')) {
                            img.src = `/api/channel-avatar?id=${encodeURIComponent(item.authorId)}`;
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
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: '0 0 4px' }}>
                      {item.author}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                      {formatSubscribers(item.subCount)} {item.videoCount ? `· ${item.videoCount} videos` : ''}
                    </div>
                  </div>
                </Link>
              );
            }

            const vidId = item.videoId || item.id;
            const thumbUrl = `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`;
            const dur = item.lengthSeconds ? `${Math.floor(item.lengthSeconds / 60)}:${(item.lengthSeconds % 60).toString().padStart(2, '0')}` : '';

            return (
              <div
                key={vidId || index}
                style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: '16px',
                  backgroundColor: 'var(--yt-surface)',
                  border: '1px solid var(--yt-border)',
                }}
              >
                <Link
                  href={`/watch?v=${vidId}`}
                  style={{
                    position: 'relative',
                    width: '240px',
                    aspectRatio: '16/9',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundColor: '#000000',
                    flexShrink: 0,
                    display: 'block',
                  }}
                >
                  <img src={thumbUrl} alt={item.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {dur && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '6px',
                        right: '6px',
                        backgroundColor: 'rgba(0, 0, 0, 0.82)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {dur}
                    </span>
                  )}
                </Link>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/watch?v=${vidId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <h3
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        margin: '0 0 6px',
                        color: 'var(--yt-text-primary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: '1.35',
                      }}
                    >
                      {item.title}
                    </h3>
                  </Link>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                    <Link
                      href={item.authorId ? `/channel/${item.authorId}` : `/watch?v=${vidId}`}
                      style={{ color: 'var(--yt-text-secondary)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {item.author}
                    </Link>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {item.viewCount ? <span>{formatViews(item.viewCount)}</span> : null}
                      {item.publishedText && (
                        <>
                          <span>·</span>
                          <span>{item.publishedText}</span>
                        </>
                      )}
                    </div>

                    {item.description && (
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '12px',
                          color: 'var(--yt-text-secondary)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: '1.4',
                        }}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
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
                }}
              >
                {loadingMore ? 'Loading more...' : 'Load More Results'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
