'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo } from 'react';
import VideoCard from '../../components/VideoCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { VideoData } from '../../constants';
import { invidious } from '../../services/invidious';
import { getHistory, removeFromHistory, clearHistory, HistoryItem } from '../../storage';
import {
  IoTimeOutline,
  IoTrashOutline,
  IoSearchOutline,
  IoCloseOutline,
  IoCheckmarkCircle,
  IoGridOutline,
  IoListOutline,
  IoEyeOutline,
  IoCalendarOutline,
  IoRefreshOutline,
  IoCloudDoneOutline,
} from 'react-icons/io5';

function formatViews(views?: number | string): string {
  if (!views || views === '0' || views === 0) return '0 views';
  const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, '') || '0');
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M views';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K views';
  return num.toLocaleString() + ' views';
}

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function getDateGroup(timestamp?: number): string {
  if (!timestamp) return 'Earlier';
  const now = new Date();
  const date = new Date(timestamp);

  if (now.toDateString() === date.toDateString()) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) return 'Yesterday';

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return 'This week';
  if (diffDays < 30) return 'This month';
  return 'Earlier';
}

export default function HistoryPage() {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [clearedNotice, setClearedNotice] = useState(false);
  const [hasInvidiousToken, setHasInvidiousToken] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);

    // 1. Local Storage History
    const localItems = getHistory(150);

    // 2. Fetch Invidious History if Token exists
    const token = invidious.getToken();
    setHasInvidiousToken(!!token);

    if (token) {
      try {
        const invHistory = await invidious.getAllAuthHistory(25);
        if (Array.isArray(invHistory) && invHistory.length > 0) {
          const localMap = new Map(localItems.map((h) => [h.videoId, h]));

          const invMapped: HistoryItem[] = invHistory.map((v: any) => {
            const vidId = v.videoId || v.id;
            const existing = localMap.get(vidId);
            let watched = Date.now();
            if (existing?.watchedAt) {
              watched = existing.watchedAt;
            } else if (v.watchedAt) {
              watched = typeof v.watchedAt === 'number' && v.watchedAt < 10000000000 ? v.watchedAt * 1000 : Number(v.watchedAt);
            } else if (v.time) {
              watched = typeof v.time === 'number' && v.time < 10000000000 ? v.time * 1000 : Number(v.time);
            }

            return {
              videoId: vidId,
              title: v.title || existing?.title || 'Untitled Video',
              thumbnail:
                existing?.thumbnail ||
                v.videoThumbnails?.[0]?.url ||
                `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`,
              channelTitle: v.author || v.uploader || existing?.channelTitle || 'Creator',
              channelId: v.authorId || v.channel_id || existing?.channelId || '',
              channelAvatar:
                v.authorThumbnails?.[0]?.url ||
                v.authorThumbnails?.[v.authorThumbnails.length - 1]?.url ||
                v.authorThumbnail ||
                existing?.channelAvatar ||
                '',
              duration: v.lengthSeconds
                ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}`
                : existing?.duration || '',
              viewCount: v.viewCount ?? existing?.viewCount ?? 0,
              uploadDate: v.publishedText || existing?.uploadDate || '',
              watchedAt: watched,
            };
          });

          // Merge unique items with priority to latest watched
          const seen = new Set<string>();
          const combined: HistoryItem[] = [];
          for (const item of [...invMapped, ...localItems]) {
            if (!seen.has(item.videoId)) {
              seen.add(item.videoId);
              combined.push(item);
            }
          }

          // Sort by watched time descending
          combined.sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));

          // Save merged back to storage for instant offline access
          try {
            localStorage.setItem('kvtube_history', JSON.stringify(combined.slice(0, 150)));
          } catch {}

          setHistoryItems(combined);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[HistoryPage] Invidious history fetch notice:', e);
      }
    }

    setHistoryItems(localItems);
    setLoading(false);
  }, []);

  const handleSyncInvidious = async () => {
    setSyncing(true);
    await loadHistory();
    setSyncing(false);
  };

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRemoveItem = async (e: React.MouseEvent, videoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromHistory(videoId);
    setHistoryItems((prev) => prev.filter((item) => item.videoId !== videoId));

    if (hasInvidiousToken) {
      invidious.removeAuthHistory(videoId).catch(() => {});
    }
  };

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear all watch history?')) {
      clearHistory();
      setHistoryItems([]);
      setClearedNotice(true);
      setTimeout(() => setClearedNotice(false), 4000);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return historyItems;
    const q = searchQuery.toLowerCase();
    return historyItems.filter(
      (item) =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.channelTitle || '').toLowerCase().includes(q)
    );
  }, [historyItems, searchQuery]);

  // Group by date
  const groupedItems = useMemo(() => {
    const groups: { [key: string]: HistoryItem[] } = {};
    const order = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

    for (const item of filteredItems) {
      const group = getDateGroup(item.watchedAt);
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    }

    return order
      .filter((grp) => groups[grp] && groups[grp].length > 0)
      .map((grp) => ({ title: grp, items: groups[grp] }));
  }, [filteredItems]);

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '16px 24px 60px' }}>
      {/* Top Header & Search / Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
          borderBottom: '1px solid var(--yt-border)',
          paddingBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
              color: 'var(--md-sys-color-primary, var(--yt-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <IoTimeOutline size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--yt-text-primary)', margin: '0 0 2px' }}>
              Watch History
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{filteredItems.length} {filteredItems.length === 1 ? 'video' : 'videos'} recorded</span>
              {hasInvidiousToken && (
                <>
                  <span>·</span>
                  <span style={{ color: 'var(--md-sys-color-primary, var(--yt-blue))', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <IoCloudDoneOutline size={14} /> Invidious Sync Active
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Sync Invidious Button */}
          {hasInvidiousToken && (
            <button
              type="button"
              onClick={handleSyncInvidious}
              disabled={syncing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '20px',
                backgroundColor: 'var(--yt-surface)',
                border: '1px solid var(--yt-border)',
                color: 'var(--yt-text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: syncing ? 'wait' : 'pointer',
                transition: 'all 0.2s',
              }}
              title="Sync latest Invidious watch history"
            >
              <IoRefreshOutline size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              <span>{syncing ? 'Syncing...' : 'Sync History'}</span>
            </button>
          )}

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
          </div>

          {/* Clear History Button */}
          {historyItems.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '20px',
                backgroundColor: 'transparent',
                border: '1px solid var(--yt-border)',
                color: 'var(--yt-text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--yt-brand-red)';
                (e.currentTarget as HTMLElement).style.color = 'var(--yt-brand-red)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--yt-border)';
                (e.currentTarget as HTMLElement).style.color = 'var(--yt-text-secondary)';
              }}
            >
              <IoTrashOutline size={16} />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Cleared Notice */}
      {clearedNotice && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '14px',
            backgroundColor: 'rgba(0, 200, 83, 0.15)',
            border: '1px solid #00c853',
            color: '#00c853',
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <IoCheckmarkCircle size={18} />
          <span>Watch history has been cleared successfully.</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner text="Loading Watch History..." />
        </div>
      ) : filteredItems.length === 0 ? (
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
            <IoTimeOutline size={32} />
          </div>
          <h3 style={{ fontSize: '18px', color: 'var(--yt-text-primary)', marginBottom: '8px' }}>
            {searchQuery ? 'No matching videos found in history' : 'No watch history yet'}
          </h3>
          <p style={{ fontSize: '14px', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
            Videos you watch on KV-Tube will appear here with full playback progress.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              borderRadius: '24px',
              backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
              color: '#ffffff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            Explore Videos
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {groupedItems.map((group) => (
            <div key={group.title}>
              {/* Date Group Heading */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  color: 'var(--yt-text-primary)',
                  fontSize: '16px',
                  fontWeight: 700,
                }}
              >
                <IoCalendarOutline size={18} color="var(--md-sys-color-primary, var(--yt-blue))" />
                <span>{group.title}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--yt-text-secondary)' }}>
                  ({group.items.length})
                </span>
              </div>
              {/* Items in Grid or List */}
              {viewMode === 'grid' ? (
                <div
                  className="history-video-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {group.items.map((item) => {
                    const videoData: VideoData = {
                      id: item.videoId,
                      title: item.title,
                      uploader: item.channelTitle,
                      channelTitle: item.channelTitle,
                      channelId: item.channelId,
                      channel_id: item.channelId,
                      thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
                      duration: item.duration || '',
                      view_count: typeof item.viewCount === 'number' ? item.viewCount : 0,
                      upload_date: item.watchedAt ? `Watched ${formatRelativeTime(item.watchedAt)}` : item.uploadDate || '',
                      publishedAt: item.uploadDate || '',
                      avatar_url: item.channelAvatar || (item.channelId ? `/api/channel-avatar?id=${encodeURIComponent(item.channelId)}` : ''),
                    };

                    return (
                      <div
                        key={`${item.videoId}-${item.watchedAt}`}
                        style={{ position: 'relative' }}
                      >
                        <VideoCard video={videoData} />
                        {/* Quick Remove Button */}
                        <button
                          type="button"
                          onClick={(e) => handleRemoveItem(e, item.videoId)}
                          style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(0, 0, 0, 0.72)',
                            border: 'none',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 6,
                            backdropFilter: 'blur(6px)',
                            transition: 'all 0.15s ease',
                          }}
                          title="Remove from history"
                        >
                          <IoCloseOutline size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* List View (Clean horizontal strip) */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {group.items.map((item) => {
                    const thumbUrl = item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
                    const avatarUrl = item.channelAvatar || (item.channelId ? `/api/channel-avatar?id=${encodeURIComponent(item.channelId)}` : '');
                    return (
                      <div
                        key={`${item.videoId}-${item.watchedAt}`}
                        className="history-list-item"
                        style={{
                          display: 'flex',
                          gap: '14px',
                          alignItems: 'flex-start',
                          padding: '8px',
                          borderRadius: '16px',
                          transition: 'background-color 0.2s',
                          position: 'relative',
                        }}
                      >
                        {/* 16:9 Thumbnail */}
                        <Link
                          href={`/watch?v=${item.videoId}`}
                          style={{
                            position: 'relative',
                            width: '180px',
                            aspectRatio: '16/9',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            backgroundColor: '#121212',
                            flexShrink: 0,
                            display: 'block',
                          }}
                        >
                          <img
                            src={thumbUrl}
                            alt={item.title}
                            loading="lazy"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              transition: 'transform 0.3s ease',
                            }}
                          />
                          {item.duration && (
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
                                borderRadius: '6px',
                                backdropFilter: 'blur(4px)',
                              }}
                            >
                              {item.duration}
                            </span>
                          )}
                        </Link>

                        {/* Video Info Details with Channel Avatar */}
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '36px' }}>
                          <Link
                            href={`/watch?v=${item.videoId}`}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                          >
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

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            {/* Avatar */}
                            <div
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--yt-hover)',
                                overflow: 'hidden',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 700,
                                position: 'relative',
                              }}
                            >
                              <span>{item.channelTitle.charAt(0).toUpperCase()}</span>
                              {avatarUrl && (
                                <img
                                  src={avatarUrl.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(avatarUrl)}` : avatarUrl}
                                  alt=""
                                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                />
                              )}
                            </div>

                            <Link
                              href={item.channelId ? `/channel/${item.channelId}` : `/watch?v=${item.videoId}`}
                              style={{
                                color: 'var(--yt-text-secondary)',
                                textDecoration: 'none',
                                fontSize: '13px',
                                fontWeight: 500,
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--yt-text-primary)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--yt-text-secondary)'; }}
                            >
                              {item.channelTitle}
                            </Link>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', marginTop: '4px' }}>
                            {item.viewCount ? `${formatViews(item.viewCount)} • ` : ''}
                            {item.watchedAt ? `Watched ${formatRelativeTime(item.watchedAt)}` : ''}
                          </div>
                        </div>

                        {/* Remove Action Button */}
                        <button
                          type="button"
                          onClick={(e) => handleRemoveItem(e, item.videoId)}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: 'var(--yt-text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          title="Remove from history"
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--yt-hover)';
                            (e.currentTarget as HTMLElement).style.color = 'var(--yt-brand-red)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                            (e.currentTarget as HTMLElement).style.color = 'var(--yt-text-secondary)';
                          }}
                        >
                          <IoCloseOutline size={20} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        @media (max-width: 600px) {
          .history-video-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .history-list-item {
            flex-direction: column !important;
          }
          .history-list-item a:first-child {
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
