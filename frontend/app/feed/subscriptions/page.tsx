'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import VideoCard from '../../components/VideoCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { VideoData } from '../../constants';
import { invidious } from '../../services/invidious';
import { getSubscriptions, subscribe, isSubscribed } from '../../storage';
import {
  IoCloudUploadOutline,
  IoCloudDownloadOutline,
  IoSearchOutline,
  IoCheckmarkCircle,
  IoLayersOutline,
} from 'react-icons/io5';

interface ChannelItem {
  channelId: string;
  channelName: string;
  channelAvatar?: string;
}

const CHANNELS_PER_BATCH = 24;
const VIDEOS_PER_CHANNEL = 12;
const AUTH_FEED_PAGES = 3;

// Map an Invidious feed item to a VideoData card. Returns null when the item
// cannot be turned into a playable video.
const mapAuthFeedItem = (v: any): VideoData | null => {
  const id = v.videoId || v.id;
  if (!id) return null;
  return {
    id,
    title: v.title,
    uploader: v.author || v.uploader || 'Creator',
    channel_id: v.authorId || '',
    thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
    view_count: v.viewCount ?? 0,
    upload_date: v.publishedText || '',
    publishedAt: v.publishedText || '',
    avatar_url: v.authorThumbnails?.[0]?.url || v.authorThumbnail || '',
  };
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<ChannelItem[]>([]);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleChannels, setVisibleChannels] = useState(CHANNELS_PER_BATCH);
  const [hasMore, setHasMore] = useState(false);
  const [usingAuthFeed, setUsingAuthFeed] = useState(false);
  const [authFeedPage, setAuthFeedPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load subscriptions
  const loadSubs = useCallback(async () => {
    let localSubs = getSubscriptions();

    // Try fetching from Invidious auth account if connected
    const token = invidious.getToken();
    if (token) {
      try {
        const invSubs = await invidious.getAuthSubscriptions();
        if (Array.isArray(invSubs) && invSubs.length > 0) {
          const invMapped: ChannelItem[] = invSubs.map((s: any) => ({
            channelId: s.authorId,
            channelName: s.author,
            channelAvatar: s.authorThumbnails?.[0]?.url || '',
          }));

          // Merge without duplicates
          const seen = new Set(localSubs.map((s) => s.channelId));
          invMapped.forEach((s) => {
            if (!seen.has(s.channelId)) {
              localSubs.push({
                channelId: s.channelId,
                channelName: s.channelName,
                channelAvatar: s.channelAvatar || '',
                subscribedAt: Date.now(),
              });
              subscribe(s);
            }
          });
        }
      } catch (e) {
        console.warn('[Subscriptions] Invidious auth subs fetch notice:', e);
      }
    }

    setSubscriptions(localSubs);
    return localSubs;
  }, []);

  // Fetch channel videos from a batch of subscribed channels
  const fetchChannelBatch = useCallback(async (batch: ChannelItem[]): Promise<VideoData[]> => {
    if (!batch || batch.length === 0) return [];

    try {
      const results = await Promise.allSettled(
        batch.map(async (c) => {
          const res = await invidious.getChannelVideos(c.channelId);
          if (Array.isArray(res)) return res.slice(0, VIDEOS_PER_CHANNEL);
          if (res?.videos && Array.isArray(res.videos)) return res.videos.slice(0, VIDEOS_PER_CHANNEL);
          return [];
        })
      );

      const combined: VideoData[] = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          const chName = batch[idx]?.channelName || 'Creator';
          const chId = batch[idx]?.channelId || '';
          r.value.forEach((v: any) => {
            const vidId = v.videoId || v.id;
            if (vidId && v.title) {
              combined.push({
                id: vidId,
                title: v.title,
                uploader: v.author || chName,
                channel_id: chId,
                thumbnail:
                  v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`,
                duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : (v.duration || ''),
                view_count: v.viewCount ?? v.view_count ?? 0,
                upload_date: v.publishedText || '',
                avatar_url:
                  batch[idx]?.channelAvatar ||
                  v.authorThumbnails?.[0]?.url ||
                  v.authorThumbnail ||
                  (chId ? `/api/channel-avatar?id=${encodeURIComponent(chId)}` : ''),
              });
            }
          });
        }
      });

      // Sort by upload date or views
      combined.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      return combined;
    } catch (e) {
      console.error('[Subscriptions] Failed to fetch channel videos:', e);
      return [];
    }
  }, []);

  // Fetch full subscriptions feed
  const fetchSubscriptionsFeed = useCallback(async (subs: ChannelItem[]) => {
    setLoading(true);
    setVideos([]);
    setHasMore(false);

    // 1. Try Invidious authenticated feed (multiple pages for more videos)
    const token = invidious.getToken();
    if (token) {
      setUsingAuthFeed(false);
      setAuthFeedPage(0);
      try {
        const authFeed: VideoData[] = [];
        const seen = new Set<string>();
        let fetchedPages = 0;
        for (let p = 1; p <= AUTH_FEED_PAGES; p++) {
          let page: any[];
          try {
            page = await invidious.getAuthFeed(p);
          } catch {
            break;
          }
          if (!Array.isArray(page) || page.length === 0) break;
          fetchedPages = p;
          page.forEach((v: any) => {
            const item = mapAuthFeedItem(v);
            if (!item || seen.has(item.id)) return;
            seen.add(item.id);
            authFeed.push(item);
          });
        }
        if (authFeed.length > 0) {
          setVideos(authFeed);
          setUsingAuthFeed(true);
          setAuthFeedPage(fetchedPages);
          setHasMore(fetchedPages >= AUTH_FEED_PAGES);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[Subscriptions] Invidious auth feed notice:', e);
      }
    }

    // 2. Fetch channel videos from all subscribed channels
    if (!subs || subs.length === 0) {
      setVideos([]);
      setLoading(false);
      return;
    }

    const batch = subs.slice(0, CHANNELS_PER_BATCH);
    const combined = await fetchChannelBatch(batch);
    setVideos(combined);
    setVisibleChannels(CHANNELS_PER_BATCH);
    setHasMore(subs.length > CHANNELS_PER_BATCH);
    setLoading(false);
  }, [fetchChannelBatch]);

  // Load more videos — either the next page of the Invidious auth feed, or the
  // next batch of subscribed channels.
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      if (usingAuthFeed) {
        const next = authFeedPage + 1;
        let page: any[] = [];
        try {
          page = await invidious.getAuthFeed(next);
        } catch {
          // fall through, treat as end of feed
        }
        if (!Array.isArray(page) || page.length === 0) {
          setHasMore(false);
          return;
        }
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          const merged = [...prev];
          page.forEach((v: any) => {
            const item = mapAuthFeedItem(v);
            if (!item || seen.has(item.id)) return;
            seen.add(item.id);
            merged.push(item);
          });
          return merged;
        });
        setAuthFeedPage(next);
      } else {
        const start = visibleChannels;
        const end = Math.min(start + CHANNELS_PER_BATCH, subscriptions.length);
        const batch = subscriptions.slice(start, end);
        const newVideos = await fetchChannelBatch(batch);
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          const merged = [...prev];
          newVideos.forEach((v) => {
            if (!seen.has(v.id)) {
              seen.add(v.id);
              merged.push(v);
            }
          });
          return merged;
        });
        setVisibleChannels(end);
        setHasMore(end < subscriptions.length);
      }
    } catch (e) {
      console.error('[Subscriptions] Failed to load more videos:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, usingAuthFeed, authFeedPage, visibleChannels, subscriptions, fetchChannelBatch]);

  useEffect(() => {
    loadSubs().then((subs) => {
      fetchSubscriptionsFeed(subs);
    });
  }, [loadSubs, fetchSubscriptionsFeed]);

  // Handle Subscriptions File Import (Invidious JSON / Google Takeout CSV / OPML)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportStatus('Reading subscription file...');

    try {
      const text = await file.text();
      const channels = invidious.parseSubscriptions(text);

      if (channels.length === 0) {
        setImportStatus('No valid channels found. Supported: Invidious JSON, Google Takeout CSV, OPML.');
        setTimeout(() => setImportStatus(null), 5000);
        return;
      }

      setImportStatus(`Importing ${channels.length} channels...`);

      for (const ch of channels) {
        subscribe({
          channelId: ch.channelId,
          channelName: ch.channelName,
          channelAvatar: ch.channelAvatar,
        });
      }

      // Check if Invidious Auth Token is saved in localStorage to push to Invidious account
      const token = invidious.getToken();
      if (token) {
        setImportStatus(`Pushing ${channels.length} channels to Invidious account...`);
        for (const ch of channels.slice(0, 50)) {
          await invidious.pushSubscriptionToInvidious(ch.channelId, token);
        }
      }

      const updated = await loadSubs();
      setImportStatus(`✓ Successfully imported ${channels.length} channels!`);
      fetchSubscriptionsFeed(updated);
      setTimeout(() => setImportStatus(null), 4000);
    } catch (err: any) {
      setImportStatus(`Import failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Export current subscriptions to Invidious JSON
  const handleExport = () => {
    const subs = getSubscriptions();
    const data = subs.map((s) => ({
      authorId: s.channelId,
      author: s.channelName,
      authorThumbnails: s.channelAvatar ? [{ url: s.channelAvatar }] : [],
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invidious_subscriptions_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredVideos = videos.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (v.title || '').toLowerCase().includes(q) || (v.uploader || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '16px 24px 60px' }}>
      {/* Header with Title and Import / Export Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--yt-text-primary)', margin: '0 0 4px' }}>
            Subscriptions Feed
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', margin: 0 }}>
            {subscriptions.length} channels subscribed · Powered by Invidious
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '20px',
              backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: importing ? 'wait' : 'pointer',
            }}
          >
            <IoCloudUploadOutline size={18} />
            <span>{importing ? 'Importing...' : 'Import'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.opml,.xml,.txt"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </label>

          {subscriptions.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
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
                cursor: 'pointer',
              }}
            >
              <IoCloudDownloadOutline size={18} />
              <span>Export</span>
            </button>
          )}
        </div>
      </div>

      {/* Import Status Banner */}
      {importStatus && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '14px',
            backgroundColor: importStatus.startsWith('✓') ? 'rgba(0, 200, 83, 0.15)' : 'var(--yt-surface)',
            border: importStatus.startsWith('✓') ? '1px solid #00c853' : '1px solid var(--yt-border)',
            color: importStatus.startsWith('✓') ? '#00c853' : 'var(--yt-text-primary)',
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {importStatus.startsWith('✓') && <IoCheckmarkCircle size={18} />}
          <span>{importStatus}</span>
        </div>
      )}

      {/* Subscribed Channels Avatars Rail */}
      {subscriptions.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '12px',
            overflowX: 'auto',
            padding: '8px 0 16px',
            marginBottom: '24px',
            borderBottom: '1px solid var(--yt-border)',
            scrollbarWidth: 'none',
            alignItems: 'center',
          }}
        >
          {subscriptions.map((ch) => (
            <Link
              key={ch.channelId}
              href={`/channel/${ch.channelId}`}
              title={ch.channelName}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px 4px 4px',
                borderRadius: '24px',
                border: '1px solid var(--yt-border)',
                backgroundColor: 'var(--yt-surface)',
                color: 'var(--yt-text-primary)',
                textDecoration: 'none',
                flexShrink: 0,
                transition: 'background-color 0.2s',
              }}
            >
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--md-sys-color-primary, var(--yt-hover))',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '13px',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <img
                  src={ch.channelAvatar || `/api/channel-avatar?id=${encodeURIComponent(ch.channelId)}`}
                  alt={ch.channelName}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (el.dataset.fallback !== '1') {
                      el.dataset.fallback = '1';
                      el.src = `/api/channel-avatar?id=${encodeURIComponent(ch.channelId)}`;
                    } else {
                      el.style.display = 'none';
                    }
                  }}
                />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 500, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ch.channelName}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Video Feed */}
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
              <div style={{ height: '14px', borderRadius: '6px', backgroundColor: 'var(--yt-hover)', width: '80%' }} />
            </div>
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--yt-text-secondary)' }}>
          <h3 style={{ fontSize: '20px', color: 'var(--yt-text-primary)', marginBottom: '8px', fontWeight: 700 }}>
            No Subscriptions Yet
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '520px', margin: '0 auto 24px', lineHeight: 1.6 }}>
            Import your subscriptions from Invidious/Google Takeout, or subscribe to popular channels below to start populating your feed.
          </p>

          {/* Quick Subscribe Recommendations */}
          <div style={{ maxWidth: '800px', margin: '0 auto 32px', textAlign: 'left' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--yt-text-primary)', marginBottom: '14px' }}>
              Suggested Channels
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              {[
                {
                  channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
                  channelName: 'Google for Developers',
                },
                {
                  channelId: 'UCsBjURrPoezykLs9EqgamOA',
                  channelName: 'Fireship',
                },
                {
                  channelId: 'UCBJycsmduvYEL83R_U4JriQ',
                  channelName: 'Marques Brownlee',
                },
                {
                  channelId: 'UCsXVk37bltHxD1rDPwtNM8Q',
                  channelName: 'Kurzgesagt – In a Nutshell',
                },
                {
                  channelId: 'UCHnyfMqiRRG1u-2MsSQLbXA',
                  channelName: 'Veritasium',
                },
                {
                  channelId: 'UC295-Dw_tDNtZXFeAPAW6Aw',
                  channelName: '5-Minute Crafts',
                },
              ].map((rec) => (
                <div
                  key={rec.channelId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '16px',
                    backgroundColor: 'var(--yt-surface)',
                    border: '1px solid var(--yt-border)',
                    gap: '12px',
                  }}
                >
                  <Link
                    href={`/channel/${rec.channelId}`}
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--yt-text-primary)',
                      textDecoration: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {rec.channelName}
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      subscribe({
                        channelId: rec.channelId,
                        channelName: rec.channelName,
                        channelAvatar: '',
                      });
                      const updated = await loadSubs();
                      fetchSubscriptionsFeed(updated);
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '16px',
                      backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Subscribe
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                borderRadius: '20px',
                backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <IoCloudUploadOutline size={18} />
              <span>Import Subscriptions</span>
            </button>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '10px 24px',
                borderRadius: '20px',
                backgroundColor: 'var(--yt-surface)',
                border: '1px solid var(--yt-border)',
                color: 'var(--yt-text-primary)',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Explore Home
            </Link>
          </div>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--yt-text-secondary)' }}>
          <p>No videos found for the selected channel/query.</p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px',
            }}
          >
            {filteredVideos.map((v) => (
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
    </div>
  );
}
