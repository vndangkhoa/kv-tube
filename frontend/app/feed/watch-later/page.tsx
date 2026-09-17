'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import VideoCard from '../../components/VideoCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { VideoData } from '../../constants';
import { getSavedVideos, unsaveVideo, clearSavedVideos, SavedVideo } from '../../storage';
import {
  IoTimeOutline,
  IoTrashOutline,
  IoPlayOutline,
  IoSearchOutline,
  IoCloseOutline,
  IoBookmarkOutline,
} from 'react-icons/io5';

export default function WatchLaterPage() {
  const [savedList, setSavedList] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadSaved = () => {
    setLoading(true);
    try {
      const items = getSavedVideos(200);
      setSavedList(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSaved();
  }, []);

  const handleRemove = (e: React.MouseEvent, videoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    unsaveVideo(videoId);
    setSavedList((prev) => prev.filter((item) => item.videoId !== videoId));
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to remove all saved videos?')) {
      clearSavedVideos();
      setSavedList([]);
    }
  };

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return savedList;
    const q = searchQuery.toLowerCase();
    return savedList.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.channelTitle && v.channelTitle.toLowerCase().includes(q))
    );
  }, [savedList, searchQuery]);

  const mappedVideos: VideoData[] = useMemo(() => {
    return filteredVideos.map((v) => ({
      id: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail || `https://i.ytimg.com/vi_webp/${v.videoId}/hqdefault.webp`,
      uploader: v.channelTitle || 'Creator',
      channelTitle: v.channelTitle || 'Creator',
      channelId: v.channelId || '',
      duration: v.duration || '',
      viewCount: '',
    }));
  }, [filteredVideos]);

  const firstVideoId = mappedVideos[0]?.id;

  if (loading) {
    return (
      <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner text="Loading your Watch Later videos..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '24px 24px 60px' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '20px',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--yt-border, rgba(255,255,255,0.1))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, rgba(62,166,255,0.15))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--md-sys-color-primary, #3ea6ff)',
            }}
          >
            <IoTimeOutline size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px', color: 'var(--yt-text-primary)' }}>
              Watch Later
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', margin: 0 }}>
              {savedList.length} {savedList.length === 1 ? 'video' : 'videos'} saved to your private library
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {firstVideoId && (
            <Link
              href={`/watch?v=${firstVideoId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '24px',
                backgroundColor: 'var(--md-sys-color-primary, #3ea6ff)',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              <IoPlayOutline size={18} />
              <span>Play All</span>
            </Link>
          )}

          {savedList.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '24px',
                border: '1px solid var(--yt-border, rgba(255,255,255,0.15))',
                backgroundColor: 'transparent',
                color: 'var(--yt-text-secondary)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              <IoTrashOutline size={16} />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Filter Strip */}
      {savedList.length > 0 && (
        <div style={{ marginBottom: '24px', maxWidth: '450px', position: 'relative' }}>
          <IoSearchOutline
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--yt-text-secondary)',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved videos..."
            style={{
              width: '100%',
              padding: '10px 36px 10px 38px',
              borderRadius: '20px',
              border: '1px solid var(--yt-border, rgba(255,255,255,0.15))',
              backgroundColor: 'var(--yt-search-bg, rgba(255,255,255,0.06))',
              color: 'var(--yt-text-primary)',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--yt-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <IoCloseOutline size={18} />
            </button>
          )}
        </div>
      )}

      {/* Grid or Empty State */}
      {mappedVideos.length === 0 ? (
        <div
          style={{
            padding: '80px 24px',
            textAlign: 'center',
            color: 'var(--yt-text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <IoBookmarkOutline size={48} style={{ opacity: 0.5, marginBottom: '8px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--yt-text-primary)', margin: 0 }}>
            {searchQuery ? 'No matching saved videos found' : 'No videos in Watch Later'}
          </h2>
          <p style={{ fontSize: '14px', maxWidth: '400px', margin: 0 }}>
            {searchQuery
              ? 'Try searching with another keyword.'
              : 'Click the "Save" bookmark button while watching any video to queue it here.'}
          </p>
          <Link
            href="/"
            style={{
              marginTop: '16px',
              display: 'inline-block',
              padding: '10px 20px',
              borderRadius: '20px',
              backgroundColor: 'var(--md-sys-color-primary, #3ea6ff)',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            Explore Videos
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {mappedVideos.map((v) => (
            <div key={v.id} style={{ position: 'relative' }}>
              <VideoCard video={v} />
              <button
                type="button"
                onClick={(e) => handleRemove(e, v.id)}
                title="Remove from Watch Later"
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: 'rgba(0,0,0,0.75)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  cursor: 'pointer',
                  zIndex: 10,
                  transition: 'background 0.2s',
                }}
              >
                <IoTrashOutline size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
