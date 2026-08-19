'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { invidious, InvidiousPlaylist } from '../services/invidious';
import VideoCard from '../components/VideoCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { VideoData } from '../constants';
import { IoListOutline, IoPlayOutline } from 'react-icons/io5';

function PlaylistContent() {
  const searchParams = useSearchParams();
  const listId = searchParams.get('list') || '';
  const [playlist, setPlaylist] = useState<InvidiousPlaylist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!listId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await invidious.getPlaylist(listId);
        if (active && data) {
          setPlaylist(data);
        }
      } catch (e) {
        console.error('[Playlist] Failed to load playlist:', e);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [listId]);

  if (loading) {
    return (
      <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner text="Loading Playlist..." />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
        <h2>Playlist Not Found</h2>
        <p>Could not fetch playlist details from Invidious.</p>
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

  const videos: VideoData[] = (playlist.videos || []).map((v) => ({
    id: v.videoId,
    title: v.title,
    uploader: v.author || playlist.author || 'Creator',
    thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
    view_count: 0,
    upload_date: '',
    publishedAt: '',
  }));

  const firstVideoId = videos[0]?.id;

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '16px 24px 60px' }}>
      {/* Header Info */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          marginBottom: '32px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <IoListOutline size={22} color="var(--md-sys-color-primary, var(--yt-blue))" />
            <span style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', fontWeight: 600 }}>Playlist</span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--yt-text-primary)', margin: '0 0 6px' }}>
            {playlist.title}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', margin: 0 }}>
            {playlist.author} · {playlist.videoCount} videos
          </p>
        </div>

        {firstVideoId && (
          <Link
            href={`/watch?v=${firstVideoId}&list=${playlist.playlistId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              borderRadius: '24px',
              backgroundColor: 'var(--md-sys-color-primary, var(--yt-blue))',
              color: '#ffffff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            <IoPlayOutline size={20} />
            <span>Play All</span>
          </Link>
        )}
      </div>

      {/* Videos Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
    </div>
  );
}

export default function PlaylistPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner text="Loading Playlist..." />
        </div>
      }
    >
      <PlaylistContent />
    </Suspense>
  );
}
