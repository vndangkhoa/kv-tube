'use client';

import Link from 'next/link';
import { useState, useCallback, memo, useEffect } from 'react';
import { VideoData } from '@/app/constants';
import { proxiedThumb, getThumbnailCascade } from '@/app/utils';
import { isVideoSaved, toggleSaveVideo } from '@/app/storage';
import LoadingSpinner from './LoadingSpinner';
import { usePlayer } from '@/app/context/PlayerContext';
import { IoEllipsisVertical, IoBookmark, IoBookmarkOutline, IoCheckmarkCircle } from 'react-icons/io5';

function formatViews(views: number): string {
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
  if (views >= 1000) return (views / 1000).toFixed(0) + 'K';
  return views ? views.toString() : '0';
}

function getStableRelativeTime(id: string): string {
  const times = ['2 hours ago', '5 hours ago', '12 hours ago', '15 hours ago', '1 day ago', '3 days ago', '1 week ago', '2 weeks ago'];
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return times[hash % times.length];
}

const DEFAULT_THUMBNAIL =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect fill="%2388888820" width="320" height="180"/%3E%3Cpath fill="%2388888860" d="M140 65v50l40-25z"/%3E%3C/svg%3E';

function VideoCard({
  video,
  hideChannelAvatar,
}: {
  video: VideoData;
  hideChannelAvatar?: boolean;
}) {
  const { setPlayingVideo, setIsPlaying } = usePlayer();
  const rawRel = video.upload_date || video.publishedAt || '';
  const relativeTime = rawRel && !/[\u0600-\u06FF]/.test(rawRel) ? rawRel : getStableRelativeTime(video.id);
  const [isNavigating, setIsNavigating] = useState(false);
  const [thumbError, setThumbError] = useState(0);
  const [saved, setSaved] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [watchProgress, setWatchProgress] = useState<number | null>(null);

  const isMix =
    video.is_mix ||
    video.title?.toLowerCase().startsWith('mix -') ||
    video.title?.toLowerCase().startsWith('mix –') ||
    video.id?.startsWith('RD');

  const destination = video.list_id
    ? `/watch?v=${video.id}&list=${video.list_id}`
    : isMix
    ? `/watch?v=${video.id}&list=RD${video.id}&start_radio=1`
    : `/watch?v=${video.id}`;

  const channelName = video.uploader || video.channelTitle || 'Unknown';
  const channelId = video.channel_id || video.channelId;

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
      thumbnail: video.thumbnail || (video.id ? getThumbnailCascade(video.id, 1) : ''),
    });
    setSaved(nextState);
    setShowMenu(false);
  };

  let thumbnailSrc = DEFAULT_THUMBNAIL;
  if (video.id) {
    if (thumbError > 0) {
      thumbnailSrc = getThumbnailCascade(video.id, thumbError) || DEFAULT_THUMBNAIL;
    } else if (video.thumbnail && !video.thumbnail.includes('mqdefault.jpg')) {
      thumbnailSrc = video.thumbnail;
    } else {
      thumbnailSrc = getThumbnailCascade(video.id, 0);
    }
  } else if (video.thumbnail) {
    thumbnailSrc = video.thumbnail;
  }

  const handleImageError = useCallback(() => {
    setThumbError((prev) => (prev < 5 ? prev + 1 : prev));
  }, []);

  const handleNavigateToWatch = useCallback(() => {
    setIsNavigating(true);
    if (video.id) {
      setPlayingVideo({
        id: video.id,
        title: video.title || '',
        uploader: channelName,
        thumbnail: thumbnailSrc || getThumbnailCascade(video.id, 1),
        duration: video.duration || '',
      });
      setIsPlaying(true);
    }
  }, [video.id, video.title, channelName, thumbnailSrc, video.duration, setPlayingVideo, setIsPlaying]);

  const rawAvatar = video.avatar_url || video.channelAvatar;
  let avatarSrc = '';
  if (rawAvatar && (rawAvatar.includes('googleusercontent.com') || rawAvatar.includes('ggpht.com'))) {
    avatarSrc = rawAvatar.startsWith('//') ? 'https:' + rawAvatar : rawAvatar;
  } else if (rawAvatar && rawAvatar.startsWith('http')) {
    avatarSrc = `/api/proxy?url=${encodeURIComponent(rawAvatar)}`;
  } else if (rawAvatar && rawAvatar.startsWith('//')) {
    avatarSrc = `/api/proxy?url=${encodeURIComponent('https:' + rawAvatar)}`;
  } else if (rawAvatar && (rawAvatar.startsWith('/') || rawAvatar.startsWith('data:'))) {
    avatarSrc = rawAvatar;
  } else if (channelId) {
    avatarSrc = `/api/channel-avatar?id=${encodeURIComponent(channelId)}`;
  }

  return (
    <div className="yt-video-card-container">
      {/* 16:9 Thumbnail with 12px border radius */}
      <div className="yt-card-thumb-wrapper">
        <Link
          href={destination}
          onClick={handleNavigateToWatch}
          className="yt-card-thumb-link"
        >
          <img
            src={thumbnailSrc}
            alt={video.title}
            loading="lazy"
            decoding="async"
            onError={handleImageError}
            className="yt-card-thumb-img"
          />

          {/* Quick Actions (Watch Later / Save) on hover */}
          <div
            className="yt-thumb-quick-actions"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              className="yt-thumb-action-btn"
              onClick={handleToggleSave}
              title={saved ? 'Remove from Saved' : 'Watch later'}
              aria-label={saved ? 'Remove from Saved' : 'Watch later'}
            >
              {saved ? <IoBookmark size={16} /> : <IoBookmarkOutline size={16} />}
            </button>
          </div>

          {/* YouTube Duration Badge or Mix Badge */}
          {isMix ? (
            <div className="yt-card-mix-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
              </svg>
              <span>Mix</span>
            </div>
          ) : video.duration ? (
            <div className="yt-card-duration-badge">{video.duration}</div>
          ) : null}

          {/* Watch Progress Line */}
          {watchProgress !== null && (
            <div className="yt-card-progress-bar-bg">
              <div
                className="yt-card-progress-bar-fill"
                style={{ width: `${watchProgress}%` }}
              />
            </div>
          )}

          {/* Loading Overlay */}
          {isNavigating && (
            <div className="yt-card-loading-overlay">
              <LoadingSpinner color="white" />
            </div>
          )}
        </Link>
      </div>

      {/* Details Row: Avatar + Title/Metadata + 3-dots Menu */}
      <div className="yt-card-details-row">
        {/* Channel Avatar */}
        {!hideChannelAvatar && (
          <Link
            href={channelId ? `/channel/${channelId}` : '#'}
            className="yt-card-avatar-link"
          >
            <div className="yt-card-avatar-circle">
              <span>{channelName.charAt(0).toUpperCase()}</span>
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
                />
              )}
            </div>
          </Link>
        )}

        {/* Text Details */}
        <div className="yt-card-text-container">
          <Link href={destination} onClick={handleNavigateToWatch} className="yt-card-title-link">
            <h3 className="yt-card-title" title={video.title}>
              {video.title}
            </h3>
          </Link>

          <div className="yt-card-metadata-col">
            {isMix ? (
              <div className="yt-card-meta-line" style={{ marginTop: '2px' }}>
                <span>{channelName}, and more</span>
              </div>
            ) : (
              <>
                {video.channel_id ? (
                  <Link
                    href={`/channel/${video.channel_id}`}
                    className="yt-card-channel-link"
                  >
                    <span>{channelName}</span>
                    <IoCheckmarkCircle size={13} className="yt-card-verified-icon" />
                  </Link>
                ) : (
                  <span className="yt-card-channel-name">{channelName}</span>
                )}

                {/* Views and Published Time */}
                <div className="yt-card-meta-line">
                  <span>{formatViews(video.view_count ?? 0)} views</span>
                  <span className="yt-card-meta-dot">•</span>
                  <span>{relativeTime}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3-dots Overflow Menu */}
        <div className="yt-card-menu-container">
          <button
            type="button"
            className="yt-card-menu-btn"
            onClick={() => setShowMenu(!showMenu)}
            title="Action menu"
          >
            <IoEllipsisVertical size={18} />
          </button>

          {showMenu && (
            <div className="yt-card-menu-dropdown">
              <button
                type="button"
                className="yt-card-menu-item"
                onClick={handleToggleSave}
              >
                {saved ? <IoBookmark size={18} /> : <IoBookmarkOutline size={18} />}
                <span>{saved ? 'Remove from Saved' : 'Save to Watch later'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(VideoCard);
