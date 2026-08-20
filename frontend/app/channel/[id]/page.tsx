'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { invidious, InvidiousChannel } from '../../services/invidious';
import VideoCard from '../../components/VideoCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { VideoData } from '../../constants';
import { isSubscribed, toggleSubscription } from '../../storage';
import {
  IoVideocamOutline,
  IoFlashOutline,
  IoRadioOutline,
  IoListOutline,
  IoChatbubblesOutline,
  IoSearchOutline,
  IoCheckmarkCircle,
  IoPersonAddOutline,
  IoCheckmark,
} from 'react-icons/io5';

type ChannelTab = 'videos' | 'shorts' | 'streams' | 'playlists' | 'community' | 'search';

function formatSubscribers(count: number): string {
  if (!count) return '';
  if (count >= 1000000) return (count / 1000000).toFixed(2) + 'M subscribers';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K subscribers';
  return count + ' subscribers';
}

function mapInvidiousVideo(v: any, authorName: string): VideoData {
  const vidId = v.videoId || v.id || '';
  const thumbs = v.videoThumbnails;
  let thumbUrl = `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const mq = thumbs.find((t: any) => t.quality === 'medium' || t.url?.includes('mqdefault'));
    thumbUrl = mq?.url || thumbs[0]?.url || thumbUrl;
  }

  let dur = '';
  if (typeof v.lengthSeconds === 'number' && v.lengthSeconds > 0) {
    const mins = Math.floor(v.lengthSeconds / 60);
    const secs = v.lengthSeconds % 60;
    dur = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  return {
    id: vidId,
    title: v.title || 'Untitled',
    uploader: v.author || authorName || 'Creator',
    channel_id: v.authorId || '',
    thumbnail: thumbUrl,
    duration: dur,
    view_count: v.viewCount ?? v.view_count ?? 0,
    upload_date: v.publishedText || '',
    publishedAt: v.publishedText || '',
  };
}

export default function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const channelId = decodeURIComponent(resolvedParams.id);

  const [channel, setChannel] = useState<InvidiousChannel | null>(null);
  const [activeTab, setActiveTab] = useState<ChannelTab>('videos');
  const [tabItems, setTabItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortVideos, setSortVideos] = useState<'newest' | 'popular' | 'oldest'>('newest');

  // Load Channel Details
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const info = await invidious.getChannel(channelId);
        if (active && info) {
          setChannel(info);
          setSubscribed(isSubscribed(channelId));
        }
      } catch (e) {
        console.error('[Channel] Failed to load channel:', e);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [channelId]);

  // Load Tab Content
  const loadTabContent = useCallback(async (tab: ChannelTab, sort: 'newest' | 'popular' | 'oldest', query?: string) => {
    setTabLoading(true);
    try {
      if (tab === 'videos') {
        const res = await invidious.getChannelVideos(channelId, undefined, sort);
        const list = Array.isArray(res) ? res : res?.videos || [];
        setTabItems(list);
      } else if (tab === 'shorts') {
        const res = await invidious.getChannelShorts(channelId);
        const list = Array.isArray(res) ? res : res?.videos || [];
        setTabItems(list);
      } else if (tab === 'streams') {
        const res = await invidious.getChannelStreams(channelId);
        const list = Array.isArray(res) ? res : res?.videos || [];
        setTabItems(list);
      } else if (tab === 'playlists') {
        const res = await invidious.getChannelPlaylists(channelId);
        const list = Array.isArray(res) ? res : res?.playlists || [];
        setTabItems(list);
      } else if (tab === 'community') {
        const res = await invidious.getChannelCommunity(channelId);
        const list = Array.isArray(res) ? res : res?.comments || [];
        setTabItems(list);
      } else if (tab === 'search' && query) {
        const res = await invidious.searchChannel(channelId, query);
        const list = Array.isArray(res) ? res : res?.videos || [];
        setTabItems(list);
      }
    } catch (e) {
      console.warn(`[Channel] Tab ${tab} load error:`, e);
      setTabItems([]);
    } finally {
      setTabLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (activeTab !== 'search') {
      loadTabContent(activeTab, sortVideos);
    }
  }, [activeTab, sortVideos, loadTabContent]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveTab('search');
      loadTabContent('search', sortVideos, searchQuery.trim());
    }
  };

  const handleSubscribeToggle = () => {
    if (!channel) return;
    const next = toggleSubscription({
      channelId,
      channelName: channel.author,
      channelAvatar: channel.authorThumbnails?.[channel.authorThumbnails.length - 1]?.url || '',
    });
    setSubscribed(next);
    if (next) {
      invidious.pushSubscriptionToInvidious(channelId).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner text="Loading Channel..." />
      </div>
    );
  }

  if (!channel) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
        <h2>Channel Not Found</h2>
        <p>Could not load channel details from Invidious instance.</p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            marginTop: '16px',
            padding: '10px 20px',
            borderRadius: '20px',
            backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Return Home
        </Link>
      </div>
    );
  }

  const bannerUrl = channel.authorBanners?.[channel.authorBanners.length - 1]?.url;
  const rawAvatar =
    channel.authorThumbnails?.[channel.authorThumbnails.length - 1]?.url ||
    channel.authorThumbnails?.[0]?.url ||
    (channelId ? `/api/channel-avatar?id=${encodeURIComponent(channelId)}` : '');
  const avatarUrl = rawAvatar
    ? rawAvatar.includes('googleusercontent.com') || rawAvatar.includes('ggpht.com')
      ? rawAvatar.startsWith('//')
        ? 'https:' + rawAvatar
        : rawAvatar
      : rawAvatar.startsWith('http')
        ? `/api/proxy?url=${encodeURIComponent(rawAvatar)}`
        : rawAvatar
    : '';

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Banner */}
      {bannerUrl && (
        <div
          style={{
            width: '100%',
            height: 'clamp(120px, 18vw, 240px)',
            backgroundImage: `url(${bannerUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: 'var(--yt-surface)',
          }}
        />
      )}

      {/* Channel Header Info */}
      <div style={{ padding: '24px 24px 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: 'var(--yt-hover)',
                color: 'var(--yt-text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '28px',
                overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <span>{channel.author[0]?.toUpperCase() || 'C'}</span>
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt={channel.author}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (channelId && !img.src.includes('/api/channel-avatar?id=')) {
                      img.src = `/api/channel-avatar?id=${encodeURIComponent(channelId)}`;
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
              <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--yt-text-primary)', margin: '0 0 6px' }}>
                {channel.author}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span>{formatSubscribers(channel.subCount)}</span>
                {channel.totalViews > 0 && (
                  <>
                    <span>•</span>
                    <span>{channel.totalViews.toLocaleString()} views</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Subscribe Button */}
          <button
            type="button"
            onClick={handleSubscribeToggle}
            style={{
              padding: '10px 24px',
              borderRadius: '24px',
              border: subscribed ? '1px solid var(--yt-border)' : 'none',
              backgroundColor: subscribed ? 'var(--yt-surface)' : 'var(--md-sys-color-primary, var(--yt-text-primary))',
              color: subscribed ? 'var(--yt-text-primary)' : 'var(--md-sys-color-on-primary, var(--yt-background))',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {subscribed ? (
              <>
                <IoCheckmark size={18} />
                <span>Subscribed</span>
              </>
            ) : (
              <>
                <IoPersonAddOutline size={16} />
                <span>Subscribe</span>
              </>
            )}
          </button>
        </div>

        {/* Description snippet */}
        {channel.description && (
          <p
            style={{
              fontSize: '13px',
              color: 'var(--yt-text-secondary)',
              marginTop: '16px',
              maxWidth: '900px',
              lineHeight: '1.5',
              whiteSpace: 'pre-line',
            }}
          >
            {channel.description.slice(0, 300)}
            {channel.description.length > 300 ? '...' : ''}
          </p>
        )}
      </div>

      {/* Tabs Navigation Rail (Videos, Shorts, Live, Playlists, Community, Search) */}
      <div
        style={{
          borderBottom: '1px solid var(--yt-border)',
          padding: '0 24px',
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('videos')}
            style={{
              padding: '12px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'videos' ? '3px solid var(--md-sys-color-primary, var(--yt-blue))' : '3px solid transparent',
              color: activeTab === 'videos' ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <IoVideocamOutline size={18} /> Videos
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shorts')}
            style={{
              padding: '12px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'shorts' ? '3px solid var(--md-sys-color-primary, var(--yt-blue))' : '3px solid transparent',
              color: activeTab === 'shorts' ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <IoFlashOutline size={18} /> Shorts
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('streams')}
            style={{
              padding: '12px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'streams' ? '3px solid var(--md-sys-color-primary, var(--yt-blue))' : '3px solid transparent',
              color: activeTab === 'streams' ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <IoRadioOutline size={18} /> Live
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('playlists')}
            style={{
              padding: '12px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'playlists' ? '3px solid var(--md-sys-color-primary, var(--yt-blue))' : '3px solid transparent',
              color: activeTab === 'playlists' ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <IoListOutline size={18} /> Playlists
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('community')}
            style={{
              padding: '12px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'community' ? '3px solid var(--md-sys-color-primary, var(--yt-blue))' : '3px solid transparent',
              color: activeTab === 'community' ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <IoChatbubblesOutline size={18} /> Community
          </button>
        </div>

        {/* Channel Search Form */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--yt-surface)',
              border: '1px solid var(--yt-border)',
              borderRadius: '20px',
              padding: '4px 12px',
            }}
          >
            <IoSearchOutline size={14} color="var(--yt-text-secondary)" />
            <input
              type="text"
              placeholder={`Search ${channel.author}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--yt-text-primary)',
                fontSize: '12px',
                outline: 'none',
                width: '140px',
              }}
            />
          </div>
        </form>
      </div>

      {/* Tab Content Display */}
      <div style={{ padding: '24px' }}>
        {tabLoading ? (
          <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner text={`Loading ${activeTab}...`} />
          </div>
        ) : activeTab === 'videos' || activeTab === 'shorts' || activeTab === 'streams' || activeTab === 'search' ? (
          tabItems.length === 0 ? (
            <p style={{ color: 'var(--yt-text-secondary)', textAlign: 'center', padding: '40px 0' }}>
              No {activeTab} available for this creator.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '20px',
              }}
            >
              {tabItems.map((v) => {
                const mapped = mapInvidiousVideo(v, channel.author);
                return <VideoCard key={mapped.id} video={mapped} />;
              })}
            </div>
          )
        ) : activeTab === 'playlists' ? (
          tabItems.length === 0 ? (
            <p style={{ color: 'var(--yt-text-secondary)', textAlign: 'center', padding: '40px 0' }}>
              No playlists found.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '20px',
              }}
            >
              {tabItems.map((pl) => (
                <Link
                  key={pl.playlistId}
                  href={`/playlist?list=${pl.playlistId}`}
                  style={{
                    textDecoration: 'none',
                    backgroundColor: 'var(--yt-surface)',
                    border: '1px solid var(--yt-border)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ aspectRatio: '16/9', position: 'relative', backgroundColor: 'var(--yt-hover)' }}>
                    {pl.playlistThumbnail && (
                      <img src={pl.playlistThumbnail} alt={pl.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {pl.videoCount || 0} videos
                    </div>
                  </div>
                  <div style={{ padding: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: '0 0 4px' }}>
                      {pl.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : activeTab === 'community' ? (
          tabItems.length === 0 ? (
            <p style={{ color: 'var(--yt-text-secondary)', textAlign: 'center', padding: '40px 0' }}>
              No community posts available.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px', margin: '0 auto' }}>
              {tabItems.map((post) => (
                <div
                  key={post.commentId || post.id}
                  style={{
                    backgroundColor: 'var(--yt-surface)',
                    border: '1px solid var(--yt-border)',
                    borderRadius: '16px',
                    padding: '20px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--md-sys-color-primary, var(--yt-hover))',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        overflow: 'hidden',
                      }}
                    >
                      {avatarUrl ? <img src={avatarUrl} alt={channel.author} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'C'}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--yt-text-primary)' }}>{channel.author}</div>
                      <div style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>{post.publishedText || ''}</div>
                    </div>
                  </div>
                  <div
                    style={{ fontSize: '14px', color: 'var(--yt-text-primary)', lineHeight: '1.6' }}
                    dangerouslySetInnerHTML={{ __html: post.contentHtml || post.content }}
                  />
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
