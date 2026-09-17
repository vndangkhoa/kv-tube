'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import VideoCard from '../../components/VideoCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { VideoData } from '../../constants';
import {
  getHistory,
  getSavedVideos,
  getLikedVideos,
  getDownloads,
  getLocalPlaylists,
  HistoryItem,
  SavedVideo,
  LikedVideo,
  DownloadItem,
  LocalPlaylist,
} from '../../storage';
import {
  IoTimeOutline,
  IoBookmarkOutline,
  IoThumbsUpOutline,
  IoDownloadOutline,
  IoListOutline,
  IoChevronForwardOutline,
  IoPersonCircleOutline,
} from 'react-icons/io5';

export default function LibraryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saved, setSaved] = useState<SavedVideo[]>([]);
  const [liked, setLiked] = useState<LikedVideo[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setHistory(getHistory(8));
      setSaved(getSavedVideos(8));
      setLiked(getLikedVideos(8));
      setDownloads(getDownloads(8));
      setPlaylists(getLocalPlaylists().slice(0, 8));
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner text="Preparing your library..." />
      </div>
    );
  }

  const mapVideo = (v: { videoId: string; title: string; thumbnail: string; channelTitle?: string; channelId?: string; duration?: string }): VideoData => ({
    id: v.videoId,
    title: v.title,
    thumbnail: v.thumbnail || `https://i.ytimg.com/vi_webp/${v.videoId}/hqdefault.webp`,
    uploader: v.channelTitle || 'Creator',
    channelTitle: v.channelTitle || 'Creator',
    channelId: v.channelId || '',
    duration: v.duration || '',
    viewCount: '',
  });

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '24px 24px 60px' }}>
      {/* Profile & Library Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          paddingBottom: '24px',
          borderBottom: '1px solid var(--yt-border, rgba(255,255,255,0.1))',
          marginBottom: '32px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--md-sys-color-primary-container, rgba(62,166,255,0.15))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--md-sys-color-primary, #3ea6ff)',
          }}
        >
          <IoPersonCircleOutline size={48} />
        </div>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, margin: '0 0 6px', color: 'var(--yt-text-primary)' }}>
            You
          </h1>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--yt-text-secondary)', flexWrap: 'wrap' }}>
            <span><b>{history.length}</b> in history</span>
            <span>•</span>
            <span><b>{saved.length}</b> watch later</span>
            <span>•</span>
            <span><b>{liked.length}</b> liked</span>
            <span>•</span>
            <span><b>{playlists.length}</b> playlists</span>
            <span>•</span>
            <span><b>{downloads.length}</b> downloads</span>
          </div>
        </div>
      </div>

      {/* 1. History Shelf */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Link
            href="/feed/history"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              color: 'var(--yt-text-primary)',
            }}
          >
            <IoTimeOutline size={22} color="var(--md-sys-color-primary, #3ea6ff)" />
            <span style={{ fontSize: '18px', fontWeight: 700 }}>History</span>
            <IoChevronForwardOutline size={16} style={{ opacity: 0.6 }} />
          </Link>
          <Link
            href="/feed/history"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--md-sys-color-primary, #3ea6ff)',
              textDecoration: 'none',
            }}
          >
            See all
          </Link>
        </div>

        {history.length === 0 ? (
          <p style={{ color: 'var(--yt-text-secondary)', fontSize: '14px', margin: 0 }}>No watch history recorded yet.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {history.slice(0, 4).map((h) => (
              <VideoCard key={h.videoId} video={mapVideo(h)} />
            ))}
          </div>
        )}
      </div>

      {/* 2. Watch Later Shelf */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Link
            href="/feed/watch-later"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              color: 'var(--yt-text-primary)',
            }}
          >
            <IoBookmarkOutline size={22} color="#3ea6ff" />
            <span style={{ fontSize: '18px', fontWeight: 700 }}>Watch Later</span>
            <IoChevronForwardOutline size={16} style={{ opacity: 0.6 }} />
          </Link>
          <Link
            href="/feed/watch-later"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--md-sys-color-primary, #3ea6ff)',
              textDecoration: 'none',
            }}
          >
            See all
          </Link>
        </div>

        {saved.length === 0 ? (
          <p style={{ color: 'var(--yt-text-secondary)', fontSize: '14px', margin: 0 }}>No saved videos yet.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {saved.slice(0, 4).map((s) => (
              <VideoCard key={s.videoId} video={mapVideo(s)} />
            ))}
          </div>
        )}
      </div>

      {/* 3. Liked Videos Shelf */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Link
            href="/feed/liked"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              color: 'var(--yt-text-primary)',
            }}
          >
            <IoThumbsUpOutline size={22} color="#ef4444" />
            <span style={{ fontSize: '18px', fontWeight: 700 }}>Liked Videos</span>
            <IoChevronForwardOutline size={16} style={{ opacity: 0.6 }} />
          </Link>
          <Link
            href="/feed/liked"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--md-sys-color-primary, #3ea6ff)',
              textDecoration: 'none',
            }}
          >
            See all
          </Link>
        </div>

        {liked.length === 0 ? (
          <p style={{ color: 'var(--yt-text-secondary)', fontSize: '14px', margin: 0 }}>No liked videos yet.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {liked.slice(0, 4).map((l) => (
              <VideoCard key={l.videoId} video={mapVideo(l)} />
            ))}
          </div>
        )}
      </div>

      {/* 4. Playlists Shelf */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Link
            href="/playlists"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              color: 'var(--yt-text-primary)',
            }}
          >
            <IoListOutline size={22} color="#a855f7" />
            <span style={{ fontSize: '18px', fontWeight: 700 }}>Playlists</span>
            <IoChevronForwardOutline size={16} style={{ opacity: 0.6 }} />
          </Link>
          <Link
            href="/playlists"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--md-sys-color-primary, #3ea6ff)',
              textDecoration: 'none',
            }}
          >
            See all
          </Link>
        </div>

        {playlists.length === 0 ? (
          <p style={{ color: 'var(--yt-text-secondary)', fontSize: '14px', margin: 0 }}>No playlists created yet.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {playlists.slice(0, 4).map((p) => (
              <Link
                key={p.id}
                href={`/playlist?list=${p.id}`}
                style={{
                  textDecoration: 'none',
                  borderRadius: '10px',
                  backgroundColor: 'var(--yt-hover-bg, rgba(255,255,255,0.04))',
                  padding: '12px',
                  border: '1px solid var(--yt-border, rgba(255,255,255,0.06))',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '8px',
                    backgroundColor: '#1f242c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IoListOutline size={24} color="#a855f7" />
                </div>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px', color: 'var(--yt-text-primary)' }}>
                    {p.title}
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                    {p.videos.length} videos
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 5. Downloads Shelf */}
      {downloads.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <Link
              href="/downloads"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                textDecoration: 'none',
                color: 'var(--yt-text-primary)',
              }}
            >
              <IoDownloadOutline size={22} color="#38bdf8" />
              <span style={{ fontSize: '18px', fontWeight: 700 }}>Downloads</span>
              <IoChevronForwardOutline size={16} style={{ opacity: 0.6 }} />
            </Link>
            <Link
              href="/downloads"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--md-sys-color-primary, #3ea6ff)',
                textDecoration: 'none',
              }}
            >
              See all
            </Link>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {downloads.slice(0, 4).map((d) => (
              <VideoCard
                key={d.id}
                video={{
                  id: d.videoId,
                  title: d.title,
                  thumbnail: d.thumbnail || `https://i.ytimg.com/vi_webp/${d.videoId}/hqdefault.webp`,
                  uploader: d.channelTitle || 'Creator',
                  channelTitle: d.channelTitle || 'Creator',
                  duration: d.quality,
                  viewCount: '',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
