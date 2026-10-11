'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  IoClose,
  IoInformationCircleOutline,
  IoChatbubbleOutline,
  IoSparklesOutline,
  IoListOutline,
  IoShuffle,
  IoRepeat,
  IoChevronDown,
  IoChevronUp,
  IoSendOutline,
  IoThumbsUpOutline,
  IoThumbsUp,
  IoThumbsDownOutline,
  IoThumbsDown,
  IoEllipsisVertical,
  IoPlay,
  IoCheckmarkCircle,
} from 'react-icons/io5';
import { MdSort } from 'react-icons/md';
import { VideoData } from '../constants';
import { proxiedImageUrl, formatRelativeTime, getThumbnailCascade } from '../utils';
import { getCommentsPageClient } from '../clientActions';
import { usePlayer } from '../context/PlayerContext';

export type WatchRightTab = 'description' | 'comments' | 'playlist' | 'ask';

// Helper to format views
function formatViews(views: string | number | undefined): string {
  if (!views || views === '0' || views === 0) return '0 views';
  const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, '') || '0', 10);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M views';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K views';
  return num.toLocaleString() + ' views';
}

// Convert timestamp (e.g. 02:45 or 1:15:30) to seconds
function parseTimestampToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// Linkify URLs and timestamps in description text
function RichTextContent({ text, onSeek }: { text: string; onSeek?: (seconds: number) => void }) {
  if (!text) return null;

  // Match URLs or timestamps (e.g. 0:45, 12:30, 1:20:15)
  const regex = /(https?:\/\/[^\s]+|\b\d{1,2}:\d{2}(?::\d{2})?\b)/g;
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, index) => {
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--yt-blue)', textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              {part}
            </a>
          );
        }
        if (/^\b\d{1,2}:\d{2}(?::\d{2})?\b$/.test(part)) {
          return (
            <button
              key={index}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSeek) onSeek(parseTimestampToSeconds(part));
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--yt-blue)',
                padding: '0 2px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 'inherit',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              {part}
            </button>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

// -------------------------------------------------------------
// 1. Far-Right Vertical Tab Strip (Width: ~64px)
// -------------------------------------------------------------
export function WatchTabStrip({
  activeTab,
  onSelectTab,
  hasPlaylist,
  commentsCount,
}: {
  activeTab: WatchRightTab | null;
  onSelectTab: (tab: WatchRightTab) => void;
  hasPlaylist: boolean;
  commentsCount?: number;
}) {
  const tabs: { id: WatchRightTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'description',
      label: 'Description',
      icon: <IoInformationCircleOutline size={22} />,
    },
    {
      id: 'comments',
      label: 'Comments',
      icon: <IoChatbubbleOutline size={20} />,
      badge: commentsCount && commentsCount > 0 ? (commentsCount > 999 ? `${(commentsCount / 1000).toFixed(0)}K` : String(commentsCount)) : undefined,
    },
    {
      id: 'ask',
      label: 'Ask',
      icon: <IoSparklesOutline size={20} />,
    },
    ...(hasPlaylist
      ? [
          {
            id: 'playlist' as WatchRightTab,
            label: 'Playlist',
            icon: <IoListOutline size={22} />,
          },
        ]
      : []),
  ];

  return (
    <div
      className="watch-tab-strip"
      style={{
        width: '64px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        gap: '12px',
        backgroundColor: 'var(--yt-background)',
        borderLeft: '1px solid var(--yt-border)',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            title={tab.label}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              backgroundColor: isActive ? 'var(--yt-hover)' : 'transparent',
              color: isActive ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
              border: 'none',
              cursor: 'pointer',
              gap: '4px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {tab.icon}
              {tab.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-10px',
                    backgroundColor: 'var(--yt-blue)',
                    color: '#000000',
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: '8px',
                    lineHeight: 1,
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: isActive ? 600 : 500,
                whiteSpace: 'nowrap',
                maxWidth: '52px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------
// 2. Description Panel (Matches Image 1)
// -------------------------------------------------------------
function WatchDescriptionPanel({ video, onSeek }: { video: any; onSeek?: (seconds: number) => void }) {
  if (!video) {
    return <div style={{ padding: '16px', color: 'var(--yt-text-secondary)', fontSize: '14px' }}>Loading description...</div>;
  }

  const rawDescription = video.description || '';
  const channelAvatarUrl =
    video.channelAvatar ||
    video.authorThumbnails?.[0]?.url ||
    video.authorThumbnail ||
    (video.channelId ? `/api/channel-avatar?id=${encodeURIComponent(video.channelId)}` : '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      {/* Video Title in Panel */}
      <h2
        style={{
          fontSize: '16px',
          fontWeight: 700,
          margin: 0,
          color: 'var(--yt-text-primary)',
          lineHeight: '1.4',
        }}
      >
        {video.title}
      </h2>

      {/* Structured Info Card (Matches Screenshot 1) */}
      <div
        style={{
          backgroundColor: 'var(--yt-hover)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          border: '1px solid var(--yt-border)',
        }}
      >
        {/* Views, Relative Time, and Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-primary)' }}>
          <span>{formatViews(video.viewCount || video.view_count)}</span>
          <span>•</span>
          <span>{formatRelativeTime(video.publishedAt || video.upload_date) || video.publishedAt || 'Recently'}</span>
          {Array.isArray(video.tags) &&
            video.tags.slice(0, 4).map((tag: string, i: number) => (
              <span key={i} style={{ color: 'var(--yt-blue)', fontWeight: 500 }}>
                #{tag}
              </span>
            ))}
        </div>

        {/* Channel quick bar */}
        <Link
          href={video.channelId ? `/channel/${video.channelId}` : '#'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
            color: 'inherit',
            padding: '8px 0',
            borderTop: '1px solid var(--yt-border)',
            borderBottom: '1px solid var(--yt-border)',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--yt-active)',
              overflow: 'hidden',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            <span>{(video.channelTitle || video.uploader || 'C').charAt(0).toUpperCase()}</span>
            {channelAvatarUrl && (
              <img
                src={channelAvatarUrl}
                alt={video.channelTitle || ''}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--yt-text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>{video.channelTitle || video.uploader || 'Creator'}</span>
              <IoCheckmarkCircle size={14} color="var(--yt-text-secondary)" />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>
              {video.subCountText || (video.subscriberCount ? `${video.subscriberCount} subscribers` : '')}
            </div>
          </div>
        </Link>

        {/* Full Formatted Description Content */}
        <div
          style={{
            fontSize: '13px',
            color: 'var(--yt-text-primary)',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {rawDescription ? (
            <RichTextContent text={rawDescription} onSeek={onSeek} />
          ) : (
            <span style={{ color: 'var(--yt-text-secondary)', fontStyle: 'italic' }}>No description provided for this video.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 3. Comments Panel (Matches Image 2)
// -------------------------------------------------------------
function WatchCommentsPanel({ videoId }: { videoId: string }) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [continuation, setContinuation] = useState<string | undefined>(undefined);
  const [newComment, setNewComment] = useState('');
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'top' | 'newest'>('top');

  useEffect(() => {
    let isCancelled = false;
    const fetchComments = async () => {
      setLoading(true);
      try {
        const res = await getCommentsPageClient(videoId, undefined, 40);
        if (isCancelled) return;
        setComments(res.comments || []);
        setContinuation(res.continuation);
      } catch (err) {
        if (!isCancelled) console.error('Failed to load comments:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    fetchComments();
    return () => {
      isCancelled = true;
    };
  }, [videoId]);

  const handleLoadMore = async () => {
    if (loadingMore || !continuation) return;
    setLoadingMore(true);
    try {
      const res = await getCommentsPageClient(videoId, continuation, 30);
      setComments((prev) => [...prev, ...(res.comments || [])]);
      setContinuation(res.continuation);
    } catch (err) {
      console.error('Failed to load more comments:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    const optimisticComment = {
      id: `local-${Date.now()}`,
      author: 'You',
      content: newComment.trim(),
      published: 'Just now',
      likeCount: 0,
      isOwner: false,
    };
    setComments((prev) => [optimisticComment, ...prev]);
    setNewComment('');
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--yt-text-secondary)', fontSize: '13px' }}>
        Loading comments...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
      {/* Subheader: Sort control */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-secondary)' }}>
          {comments.length} Comments
        </span>
        <button
          type="button"
          onClick={() => setSortBy((prev) => (prev === 'top' ? 'newest' : 'top'))}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--yt-text-primary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '16px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--yt-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <MdSort size={18} />
          <span>{sortBy === 'top' ? 'Top comments' : 'Newest first'}</span>
        </button>
      </div>

      {/* Add a Comment Input Box (Matches Screenshot 2) */}
      <form onSubmit={handlePostComment} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'var(--yt-active)',
            color: 'var(--yt-text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '13px',
            flexShrink: 0,
          }}
        >
          U
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            type="text"
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--yt-border)',
              color: 'var(--yt-text-primary)',
              fontSize: '13px',
              padding: '6px 0',
              outline: 'none',
            }}
            onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--yt-blue)')}
            onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--yt-border)')}
          />
          {newComment && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setNewComment('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--yt-text-secondary)',
                  padding: '6px 12px',
                  borderRadius: '18px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  backgroundColor: 'var(--yt-blue)',
                  border: 'none',
                  color: '#000000',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '18px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Comment
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Comments List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
        {comments.map((c, idx) => {
          const commentId = c.id || String(idx);
          const isRepliesOpen = expandedReplies[commentId];

          return (
            <div key={commentId} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              {/* Commenter Avatar */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--yt-hover)',
                  overflow: 'hidden',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--yt-text-primary)',
                }}
              >
                {c.authorThumbnails?.[0]?.url ? (
                  <img
                    src={c.authorThumbnails[0].url}
                    alt={c.author || ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  (c.author || 'U').charAt(0).toUpperCase()
                )}
              </div>

              {/* Comment details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--yt-text-primary)' }}>{c.author}</span>
                  {c.isOwner && (
                    <span
                      style={{
                        backgroundColor: 'var(--yt-hover)',
                        color: 'var(--yt-text-secondary)',
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 600,
                      }}
                    >
                      Creator
                    </span>
                  )}
                  <span style={{ color: 'var(--yt-text-secondary)', fontSize: '11px' }}>
                    {formatRelativeTime(c.published) || c.publishedText || 'recently'}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--yt-text-primary)',
                    lineHeight: '1.45',
                    marginTop: '4px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  <RichTextContent text={c.content || c.text || ''} />
                </div>

                {/* Comment Reactions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', color: 'var(--yt-text-secondary)', fontSize: '12px' }}>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <IoThumbsUpOutline size={14} />
                    <span>{c.likeCount > 0 ? c.likeCount : ''}</span>
                  </button>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <IoThumbsDownOutline size={14} />
                  </button>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '11px',
                      padding: 0,
                    }}
                  >
                    Reply
                  </button>
                </div>

                {/* Replies accordion */}
                {Array.isArray(c.replies) && c.replies.length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedReplies((prev) => ({
                          ...prev,
                          [commentId]: !prev[commentId],
                        }))
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--yt-blue)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '4px 0',
                      }}
                    >
                      {isRepliesOpen ? <IoChevronUp size={14} /> : <IoChevronDown size={14} />}
                      <span>
                        {c.replies.length} {c.replies.length === 1 ? 'reply' : 'replies'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {continuation && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--yt-hover)',
              border: 'none',
              borderRadius: '18px',
              color: 'var(--yt-text-primary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              margin: '8px auto',
              display: 'block',
            }}
          >
            {loadingMore ? 'Loading more comments...' : 'Show more comments'}
          </button>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 4. Playlist / Mix Panel (Matches Image 3)
// -------------------------------------------------------------
function WatchPlaylistPanel({
  videos,
  currentIndex,
  onVideoSelect,
  title,
  isShuffle,
  onToggleShuffle,
  isLoop,
  onToggleLoop,
}: {
  videos: VideoData[];
  currentIndex: number;
  onVideoSelect: (video: VideoData, index: number) => void;
  title?: string;
  isShuffle?: boolean;
  onToggleShuffle?: () => void;
  isLoop?: boolean;
  onToggleLoop?: () => void;
}) {
  const activeItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentIndex]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Subheader with Shuffle / Loop Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--yt-border)',
          backgroundColor: 'var(--yt-surface)',
        }}
      >
        <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', fontWeight: 500 }}>
          {currentIndex >= 0 ? `${currentIndex + 1} / ${videos.length}` : `${videos.length} videos`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onToggleShuffle && (
            <button
              type="button"
              onClick={onToggleShuffle}
              title={isShuffle ? 'Shuffle on' : 'Shuffle off'}
              style={{
                background: isShuffle ? 'rgba(62, 166, 255, 0.2)' : 'none',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isShuffle ? 'var(--yt-blue)' : 'var(--yt-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <IoShuffle size={18} />
            </button>
          )}
          {onToggleLoop && (
            <button
              type="button"
              onClick={onToggleLoop}
              title={isLoop ? 'Loop on' : 'Loop off'}
              style={{
                background: isLoop ? 'rgba(62, 166, 255, 0.2)' : 'none',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isLoop ? 'var(--yt-blue)' : 'var(--yt-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <IoRepeat size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Playlist Track List */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {videos.map((v, idx) => {
          const isCurrent = idx === currentIndex;
          return (
            <div
              key={`${v.id}-${idx}`}
              ref={isCurrent ? activeItemRef : undefined}
              onClick={() => onVideoSelect(v, idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: isCurrent ? 'var(--yt-hover)' : 'transparent',
                borderLeft: isCurrent ? '3px solid var(--yt-blue)' : '3px solid transparent',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isCurrent) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseLeave={(e) => {
                if (!isCurrent) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              {/* Playing index or arrow */}
              <div
                style={{
                  width: '20px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: isCurrent ? 'var(--yt-blue)' : 'var(--yt-text-secondary)',
                  fontWeight: isCurrent ? 700 : 500,
                  flexShrink: 0,
                }}
              >
                {isCurrent ? <IoPlay size={12} color="var(--yt-blue)" /> : idx + 1}
              </div>

              {/* Thumbnail */}
              <div
                style={{
                  position: 'relative',
                  width: '90px',
                  height: '50px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  backgroundColor: '#000000',
                  flexShrink: 0,
                }}
              >
                <img
                  src={v.thumbnail ? proxiedImageUrl(v.thumbnail) : getThumbnailCascade(v.id, 1)}
                  alt={v.title}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getThumbnailCascade(v.id, 3);
                  }}
                />
                {v.duration && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '2px',
                      backgroundColor: 'rgba(0,0,0,0.85)',
                      color: '#ffffff',
                      fontSize: '9px',
                      fontWeight: 600,
                      padding: '1px 3px',
                      borderRadius: '3px',
                    }}
                  >
                    {v.duration}
                  </div>
                )}
              </div>

              {/* Video Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: isCurrent ? 600 : 500,
                    color: isCurrent ? 'var(--yt-blue)' : 'var(--yt-text-primary)',
                    lineHeight: '1.3',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {v.title}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--yt-text-secondary)',
                    marginTop: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {v.uploader || (v as any).channelTitle || 'Unknown'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 5. Ask (AI Assistant) Panel
// -------------------------------------------------------------
function WatchAskPanel({ video, onSeek }: { video: any; onSeek?: (seconds: number) => void }) {
  const [messages, setMessages] = useState<Array<{ role: 'ai' | 'user'; text: string }>>([
    {
      role: 'ai',
      text: `Hello! I can help you understand, summarize, or answer questions about "${video?.title || 'this video'}". What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState('');

  const quickPrompts = ['Summarize this video', 'What are key takeaways?', 'Any music/soundtrack list?', 'Who created this?'];

  const handleSendPrompt = (promptText: string) => {
    if (!promptText.trim()) return;
    const userMsg = promptText.trim();
    setInput('');

    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);

    // Simulated responsive answer using video metadata
    setTimeout(() => {
      let reply = '';
      const lower = userMsg.toLowerCase();
      if (lower.includes('summarize') || lower.includes('summary')) {
        reply = `Here is a summary of "${video?.title}":\n\n${video?.description ? video.description.slice(0, 300) + '...' : 'This video was uploaded by ' + (video?.channelTitle || video?.uploader || 'the creator') + '.'}\n\nKey topic: ${video?.tags?.slice(0, 3)?.join(', ') || 'Video content'}.`;
      } else if (lower.includes('takeaway') || lower.includes('key')) {
        reply = `Key takeaways:\n• Creator: ${video?.channelTitle || video?.uploader || 'Unknown'}\n• Published: ${video?.publishedAt || video?.upload_date || 'Recently'}\n• Views: ${formatViews(video?.viewCount || video?.view_count)}`;
      } else if (lower.includes('music') || lower.includes('song') || lower.includes('remix')) {
        reply = `This video appears to feature music by ${video?.channelTitle || video?.uploader}. Check the description for official track credits and streaming links.`;
      } else {
        reply = `Based on the video information, "${video?.title}" has ${formatViews(video?.viewCount || video?.view_count)} and is published by ${video?.channelTitle || video?.uploader}.`;
      }
      setMessages((prev) => [...prev, { role: 'ai', text: reply }]);
    }, 400);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '14px' }}>
      {/* Quick Prompts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {quickPrompts.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSendPrompt(q)}
            style={{
              padding: '6px 12px',
              borderRadius: '16px',
              backgroundColor: 'var(--yt-hover)',
              color: 'var(--yt-text-primary)',
              border: '1px solid var(--yt-border)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--yt-active)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--yt-hover)')}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: '14px',
              backgroundColor: m.role === 'user' ? 'var(--yt-blue)' : 'var(--yt-hover)',
              color: m.role === 'user' ? '#000000' : 'var(--yt-text-primary)',
              fontSize: '13px',
              lineHeight: '1.45',
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Ask a question about this video..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendPrompt(input);
          }}
          style={{
            flex: 1,
            padding: '8px 12px',
            backgroundColor: 'var(--yt-hover)',
            border: '1px solid var(--yt-border)',
            borderRadius: '20px',
            color: 'var(--yt-text-primary)',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => handleSendPrompt(input)}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: 'var(--yt-blue)',
            color: '#000000',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <IoSendOutline size={16} />
        </button>
      </div>
    </div>
  );
}

// Main Exported WatchSidePanel Component
// -------------------------------------------------------------
export default function WatchSidePanel({
  activeTab,
  onSelectTab,
  onClose,
  video,
  videoId,
  mixPlaylist,
  currentIndex,
  onVideoSelect,
  mixTitle,
  isShuffle,
  onToggleShuffle,
  isLoop,
  onToggleLoop,
  commentsCount,
  isMobileSheet = false,
}: {
  activeTab: WatchRightTab | null;
  onSelectTab: (tab: WatchRightTab) => void;
  onClose: () => void;
  video: any;
  videoId: string;
  mixPlaylist: VideoData[];
  currentIndex: number;
  onVideoSelect: (video: VideoData, index: number) => void;
  mixTitle?: string;
  isShuffle?: boolean;
  onToggleShuffle?: () => void;
  isLoop?: boolean;
  onToggleLoop?: () => void;
  commentsCount?: number;
  isMobileSheet?: boolean;
}) {
  const { setCurrentTime } = usePlayer();
  const hasPlaylist = mixPlaylist.length > 0;

  // Header Title
  let title = 'Details';
  if (activeTab === 'description') title = 'Description';
  else if (activeTab === 'comments') title = `Comments ${commentsCount ? commentsCount : ''}`;
  else if (activeTab === 'playlist') title = mixTitle || 'Mix Playlist';
  else if (activeTab === 'ask') title = 'Ask';

  return (
    <div
      className="watch-side-panel-container"
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        width: isMobileSheet ? '100%' : activeTab ? '464px' : '64px',
        transition: 'width 0.2s cubic-bezier(0.05, 0, 0, 1)',
        overflow: 'hidden',
      }}
    >
      {/* 1. Contextual Drawer Panel (Width: 400px when open) */}
      {activeTab && (
        <div
          className="watch-context-drawer"
          style={{
            width: isMobileSheet ? '100%' : '400px',
            height: '100%',
            backgroundColor: 'var(--yt-surface)',
            border: '1px solid var(--yt-border)',
            borderRadius: isMobileSheet ? '16px 16px 0 0' : '16px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Drawer Header (Matches Screenshots 1, 2, 3) */}
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--yt-border)',
              backgroundColor: 'var(--yt-surface)',
              flexShrink: 0,
            }}
          >
            <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--yt-text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </h3>
              {activeTab === 'playlist' && (
                <div style={{ fontSize: '11px', color: 'var(--yt-text-secondary)', marginTop: '2px' }}>
                  Mixes are playlists YouTube makes for you
                </div>
              )}
            </div>

            {/* Close Button (✕) */}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--yt-text-primary)',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--yt-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <IoClose size={22} />
            </button>
          </div>

          {/* Drawer Body (Scrollable independently from main page) */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeTab === 'description' && <WatchDescriptionPanel video={video} onSeek={setCurrentTime} />}
            {activeTab === 'comments' && <WatchCommentsPanel videoId={videoId} />}
            {activeTab === 'playlist' && (
              <WatchPlaylistPanel
                videos={mixPlaylist}
                currentIndex={currentIndex}
                onVideoSelect={onVideoSelect}
                title={mixTitle}
                isShuffle={isShuffle}
                onToggleShuffle={onToggleShuffle}
                isLoop={isLoop}
                onToggleLoop={onToggleLoop}
              />
            )}
            {activeTab === 'ask' && <WatchAskPanel video={video} onSeek={setCurrentTime} />}
          </div>
        </div>
      )}

      {/* 2. Far-Right Vertical Tab Strip (Hidden on Mobile Sheet) */}
      {!isMobileSheet && (
        <WatchTabStrip
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          hasPlaylist={hasPlaylist}
          commentsCount={commentsCount}
        />
      )}
    </div>
  );
}
