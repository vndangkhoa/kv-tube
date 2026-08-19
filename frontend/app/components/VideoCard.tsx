'use client';

import Link from 'next/link';
import { useState, useCallback, memo, useEffect } from 'react';
import { VideoData } from '@/app/constants';
import { proxiedThumb, proxiedImageUrl } from '@/app/utils';
import { isVideoSaved, toggleSaveVideo } from '@/app/storage';
import LoadingSpinner from './LoadingSpinner';
import { IoBookmarkOutline, IoBookmark, IoTimeOutline, IoCheckmarkCircle } from 'react-icons/io5';

function formatViews(views: number): string {
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
  if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
  return views ? views.toString() : '0';
}

function getStableRelativeTime(id: string): string {
  const times = ['2 hours ago', '5 hours ago', '1 day ago', '3 days ago', '1 week ago', '2 weeks ago', '1 month ago'];
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return times[hash % times.length];
}

const DEFAULT_THUMBNAIL =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect fill="%231a1a1a" width="320" height="180"/%3E%3Cpath fill="%23444" d="M140 65v50l40-25z"/%3E%3C/svg%3E';

function getThumbFallbacks(id: string): string[] {
  return [
    proxiedThumb(id, 'hqdefault'),
    proxiedThumb(id, 'mqdefault'),
    proxiedThumb(id, 'default'),
  ];
}

function isValidThumbUrl(url: string): boolean {
  if (!url || url === DEFAULT_THUMBNAIL) return false;
  return url.includes('i.ytimg.com/vi/') || url.includes('i.ytimg.com/vi_webp/');
}

function VideoCard({
  video,
  hideChannelAvatar,
}: {
  video: VideoData;
  hideChannelAvatar?: boolean;
}) {
  const relativeTime = video.upload_date || video.publishedAt || getStableRelativeTime(video.id);
  const [isNavigating, setIsNavigating] = useState(false);
  const [thumbError, setThumbError] = useState(0);
  const [saved, setSaved] = useState(false);
  const [watchProgress, setWatchProgress] = useState<number | null>(null);

  const destination = video.list_id
    ? `/watch?v=${video.id}&list=${video.list_id}`
    : `/watch?v=${video.id}`;

  // Check saved state and watch progress on client mount
  useEffect(() => {
    if (video.id) {
      setSaved(isVideoSaved(video.id));
      try {
        const savedTime = localStorage.getItem(`kv_pos_${video.id}`);
        const savedDur = localStorage.getItem(`kv_dur_${video.id}`);
        if (savedTime && savedDur) {
          const p = (parseFloat(savedTime) / parseFloat(savedDur)) * 100;
          if (p > 5 && p < 98) setWatchProgress(p);
        }
      } catch {}
    }
  }, [video.id]);

  const handleToggleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextState = toggleSaveVideo({
      videoId: video.id,
      title: video.title,
      channelTitle: video.uploader || video.channelTitle || '',
      thumbnail: video.thumbnail || proxiedThumb(video.id),
    });
    setSaved(nextState);
  };

  let rawThumb = video.thumbnail || (video.id ? `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg` : DEFAULT_THUMBNAIL);
  if (typeof rawThumb === 'string') {
    rawThumb = rawThumb.replace('/maxresdefault.jpg', '/mqdefault.jpg').replace('/sddefault.jpg', '/mqdefault.jpg');
  }
  let thumbnailSrc = rawThumb;
  if (thumbError === 1 && video.id) {
    thumbnailSrc = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  } else if (thumbError >= 2 && video.id) {
    thumbnailSrc = `/api/proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`)}`;
  }

  const handleImageError = useCallback(() => {
    setThumbError((prev) => prev + 1);
  }, []);

  const channelName = video.uploader || video.channelTitle || 'Unknown';
  const channelId = video.channel_id || video.channelId;
  const rawAvatar = video.avatar_url || video.channelAvatar;
  let avatarSrc = '';
  if (rawAvatar && rawAvatar.startsWith('http')) {
    avatarSrc = `/api/proxy?url=${encodeURIComponent(rawAvatar)}`;
  } else if (rawAvatar && rawAvatar.startsWith('//')) {
    avatarSrc = `/api/proxy?url=${encodeURIComponent('https:' + rawAvatar)}`;
  } else if (rawAvatar && (rawAvatar.startsWith('/') || rawAvatar.startsWith('data:'))) {
    avatarSrc = rawAvatar;
  } else if (channelId) {
    avatarSrc = `/api/channel-avatar?id=${encodeURIComponent(channelId)}`;
  }

  return (
    <div
      className="card-hover-lift"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        marginBottom: '16px',
        borderRadius: '20px',
        padding: '8px',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        backgroundColor: 'transparent',
      }}
    >
      {/* Thumbnail Container */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: '16px', overflow: 'hidden' }}>
        <Link
          href={destination}
          onClick={() => setIsNavigating(true)}
          style={{ position: 'relative', display: 'block', width: '100%', height: '100%', overflow: 'hidden' }}
        >
          <img
            src={thumbnailSrc}
            alt={video.title}
            loading="lazy"
            decoding="async"
            onError={handleImageError}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: '#121212',
              transition: 'transform 0.3s ease',
            }}
          />

          {/* Duration Pill (Material 3) */}
          {video.duration && !video.is_mix && (
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.82)',
                backdropFilter: 'blur(8px)',
                color: '#ffffff',
                padding: '3px 8px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.4px',
              }}
            >
              {video.duration}
            </div>
          )}

          {/* Watch Progress Bar */}
          {watchProgress !== null && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.3)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${watchProgress}%`,
                  backgroundColor: 'var(--md-sys-color-primary, var(--yt-brand-red))',
                }}
              />
            </div>
          )}

          {/* Navigation Spinner */}
          {isNavigating && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
            >
              <LoadingSpinner color="white" />
            </div>
          )}
        </Link>

        {/* Floating Quick Action Button (Save/Bookmark) */}
        <button
          type="button"
          onClick={handleToggleSave}
          title={saved ? 'Remove from Saved' : 'Save Video'}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            border: 'none',
            color: saved ? 'var(--md-sys-color-primary, var(--yt-blue))' : '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 5,
            transition: 'transform 0.15s ease, background-color 0.2s',
          }}
        >
          {saved ? <IoBookmark size={16} /> : <IoBookmarkOutline size={16} />}
        </button>
      </div>

      {/* Info Section */}
      <div style={{ display: 'flex', gap: '12px', padding: '0 4px' }}>
        {/* Channel Avatar */}
        {!hideChannelAvatar && (
          <Link
            href={channelId ? `/channel/${channelId}` : '#'}
            style={{ flexShrink: 0, textDecoration: 'none' }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--yt-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {/* Fallback Letter */}
              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--yt-text-primary)', zIndex: 1 }}>
                {channelName.charAt(0).toUpperCase()}
              </span>

              {/* Real Channel Avatar Image */}
              {avatarSrc && (
                <img
                  src={avatarSrc}
                  alt={channelName}
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
                    zIndex: 2,
                  }}
                />
              )}
            </div>
          </Link>
        )}

        {/* Video Title & Metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <Link href={destination} style={{ textDecoration: 'none' }}>
            <h3
              className="truncate-2-lines"
              style={{
                fontSize: '15px',
                fontWeight: 600,
                lineHeight: '20px',
                margin: 0,
                color: 'var(--yt-text-primary)',
                letterSpacing: '-0.1px',
              }}
            >
              {video.title}
            </h3>
          </Link>

          <div style={{ marginTop: '4px' }}>
            {video.channel_id ? (
              <Link
                href={`/channel/${video.channel_id}`}
                style={{
                  fontSize: '13px',
                  color: 'var(--yt-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                <span>{channelName}</span>
                <IoCheckmarkCircle size={14} style={{ color: 'var(--yt-text-secondary)' }} />
              </Link>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', fontWeight: 500 }}>
                {channelName}
              </div>
            )}

            <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', marginTop: '2px' }}>
              {formatViews(video.view_count ?? 0)} views • {relativeTime}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(VideoCard);
