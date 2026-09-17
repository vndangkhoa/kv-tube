'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  IoHeart,
  IoHeartOutline,
  IoShareOutline,
  IoVolumeMute,
  IoVolumeHigh,
  IoArrowUp,
  IoArrowDown,
  IoMusicalNotes,
  IoPlay,
  IoPause,
  IoExpand,
  IoContract,
  IoThumbsDownOutline,
  IoThumbsDown,
  IoThumbsUpOutline,
  IoThumbsUp,
  IoChatbubbleEllipsesOutline,
  IoClose,
  IoFilterOutline,
  IoPin,
  IoSend,
  IoRepeatOutline,
} from 'react-icons/io5';
import LoadingSpinner from '../components/LoadingSpinner';
import { invidious } from '../services/invidious';
import { isSubscribed, toggleSubscription } from '../storage';

export interface SoundInfo {
  title?: string;
  thumbnail?: string;
  author?: string;
  audioPivotToken?: string;
}

interface ShortVideo {
  id: string;
  title: string;
  uploader: string;
  channelId?: string;
  channelAvatar?: string;
  thumbnail: string;
  view_count?: number;
  lengthSeconds?: number;
  commentCount?: number;
  sound?: SoundInfo;
}

const REGION_SHORTS_TERMS: Record<string, string[]> = {
  VN: [
    '#shorts viral việt nam',
    'shorts hài hước triệu view',
    'shorts xu hướng việt nam viral',
    'shorts giải trí triệu view',
    'shorts ẩm thực việt nam triệu view',
  ],
  US: [
    '#shorts viral trending',
    'trending viral shorts',
    'funny viral shorts',
    'shorts comedy trending viral',
  ],
  JP: [
    '#shorts 日本 バズる',
    'shorts 面白い トレンド',
    'shorts アニメ バズる',
  ],
  KR: [
    '#shorts 한국 쇼츠 인기',
    'shorts 재미있는 유행',
    'shorts 케이팝 viral',
  ],
  GLOBAL: [
    '#shorts viral trending',
    'trending viral shorts',
    'funny viral shorts',
    'shorts comedy viral',
  ],
};

function getTermsForRegion(region: string): string[] {
  return REGION_SHORTS_TERMS[region.toUpperCase()] || REGION_SHORTS_TERMS.VN || REGION_SHORTS_TERMS.US;
}

function formatViews(views?: number): string {
  if (!views) return '35K';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
  if (views >= 1000) return (views / 1000).toFixed(0) + 'K';
  return views.toString();
}

// Deterministic material palette for author avatars when thumbnail is unavailable
function getAvatarColor(name: string): string {
  const colors = [
    '#e53935', '#d81b60', '#8e24aa', '#5e35b1',
    '#3949ab', '#1e88e5', '#0288d1', '#0097a7',
    '#00897b', '#43a047', '#689f38', '#f57c00',
    '#e64a19', '#5d4037', '#455a64'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Global Set to prevent duplicate shorts from appearing in the feed
const globalSeenIds = new Set<string>();

async function fetchUniqueShorts(page: number, region: string = 'VN'): Promise<ShortVideo[]> {
  const terms = getTermsForRegion(region);
  const queryIndex = (page - 1) % terms.length;
  const query = terms[queryIndex];

  try {
    const results = await invidious.search(query, {
      page: Math.floor((page - 1) / terms.length) + 1,
      type: 'video',
      duration: 'short',
      sort_by: 'relevance',
      region: region,
    });

    if (Array.isArray(results) && results.length > 0) {
      const filtered: ShortVideo[] = [];

      for (const v of results) {
        const vidId = v.videoId || v.id;
        if (!vidId || globalSeenIds.has(vidId)) continue;

        // Ensure duration is short (under 65 seconds and over 4 seconds)
        if (v.lengthSeconds && (v.lengthSeconds > 65 || v.lengthSeconds < 4)) continue;

        // Exclude videos with negligible view count (under 1000 views) to avoid obscure drone/test uploads
        if (v.viewCount !== undefined && v.viewCount < 1000) continue;

        // Exclude widescreen non-shorts (trailers, official music videos, short films)
        const lowerTitle = (v.title || '').toLowerCase();
        const isWidescreen = /trailer|teaser|official\s+mv|official\s+music\s+video|music\s+video|short\s+film|phim\s+ngắn/i.test(lowerTitle);
        if (isWidescreen && !lowerTitle.includes('#short')) continue;

        globalSeenIds.add(vidId);
        filtered.push({
          id: vidId,
          title: v.title || 'Short Video',
          uploader: v.author || v.uploader || 'Creator',
          channelId: v.authorId || v.channel_id || '',
          channelAvatar: v.authorThumbnails?.[v.authorThumbnails.length - 1]?.url,
          thumbnail: vidId
            ? `https://i.ytimg.com/vi_webp/${vidId}/hqdefault.webp`
            : (v.videoThumbnails?.[0]?.url || v.thumbnail || ''),
          view_count: v.viewCount ?? v.view_count ?? 38000,
          lengthSeconds: v.lengthSeconds || 30,
          commentCount: v.commentCount ?? v.comment_count,
        });
      }

      if (filtered.length > 0) return filtered;
    }
  } catch (e) {
    console.warn('[Shorts] Invidious search failed for query:', query, e);
  }

  // Secondary fallback with viral shorts query
  try {
    const backupResults = await invidious.search(`#shorts viral ${region}`, {
      page: page + 1,
      type: 'video',
      duration: 'short',
      sort_by: 'relevance',
      region: region,
    });

    if (Array.isArray(backupResults)) {
      const filteredBackup: ShortVideo[] = [];
      for (const v of backupResults) {
        const vidId = v.videoId || v.id;
        if (!vidId || globalSeenIds.has(vidId)) continue;
        if (v.lengthSeconds && (v.lengthSeconds > 65 || v.lengthSeconds < 4)) continue;
        if (v.viewCount !== undefined && v.viewCount < 1000) continue;

        const lowerTitle = (v.title || '').toLowerCase();
        const isWidescreen = /trailer|teaser|official\s+mv|official\s+music\s+video|music\s+video|short\s+film|phim\s+ngắn/i.test(lowerTitle);
        if (isWidescreen && !lowerTitle.includes('#short')) continue;

        globalSeenIds.add(vidId);
        filteredBackup.push({
          id: vidId,
          title: v.title || 'Shorts',
          uploader: v.author || 'Creator',
          channelId: v.authorId || '',
          channelAvatar: v.authorThumbnails?.[0]?.url,
          thumbnail: vidId
            ? `https://i.ytimg.com/vi_webp/${vidId}/hqdefault.webp`
            : (v.videoThumbnails?.[0]?.url || v.thumbnail || ''),
          view_count: v.viewCount ?? 45000,
          lengthSeconds: v.lengthSeconds || 30,
          commentCount: v.commentCount ?? v.comment_count,
        });
      }
      return filteredBackup;
    }
  } catch {}

  return [];
}

interface CommentItem {
  id: string;
  author: string;
  authorId?: string;
  authorThumbnail?: string;
  authorIsChannelOwner?: boolean;
  text: string;
  likes: number;
  published: string;
  isPinned?: boolean;
  replyCount?: number;
  userLiked?: boolean;
  userDisliked?: boolean;
}

function cleanCommentText(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function ShortsCommentsPanel({
  videoId,
  uploader,
  onClose,
  onUpdateCount,
}: {
  videoId: string;
  uploader: string;
  onClose: () => void;
  onUpdateCount?: (count: number) => void;
}) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [continuation, setContinuation] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState<'top' | 'new'>('top');
  const [inputVal, setInputVal] = useState('');
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setLoading(true);
      setContinuation(undefined);
      try {
        const res = await invidious.getComments(videoId, undefined, sortBy);
        if (isCancelled) return;
        if (res && Array.isArray(res.comments)) {
          const list: CommentItem[] = res.comments.map((c) => ({
            id: c.commentId || String(Math.random()),
            author: c.author || 'Viewer',
            authorId: c.authorId,
            authorThumbnail:
              c.authorThumbnails?.[c.authorThumbnails.length - 1]?.url ||
              c.authorThumbnails?.[0]?.url ||
              '',
            authorIsChannelOwner: !!c.authorIsChannelOwner,
            text: cleanCommentText(c.contentHtml || c.content),
            likes: c.likeCount || 0,
            published: c.publishedText || 'recently',
            isPinned: !!c.isPinned,
            replyCount: c.replies?.replyCount || 0,
          }));
          setComments(list);
          setContinuation(res.continuation);
          const count = list.length;
          setTotalCount(count);
          if (onUpdateCount) onUpdateCount(count);
        } else {
          setComments([]);
          setTotalCount(0);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[ShortsComments] Failed to load comments:', err);
          setComments([]);
          setTotalCount(0);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    load();
    return () => {
      isCancelled = true;
    };
  }, [videoId, sortBy, onUpdateCount]);

  const loadMore = async () => {
    if (!continuation || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await invidious.getComments(videoId, continuation, sortBy);
      if (res && Array.isArray(res.comments) && res.comments.length > 0) {
        const moreList: CommentItem[] = res.comments.map((c) => ({
          id: c.commentId || String(Math.random()),
          author: c.author || 'Viewer',
          authorId: c.authorId,
          authorThumbnail:
            c.authorThumbnails?.[c.authorThumbnails.length - 1]?.url ||
            c.authorThumbnails?.[0]?.url ||
            '',
          authorIsChannelOwner: !!c.authorIsChannelOwner,
          text: cleanCommentText(c.contentHtml || c.content),
          likes: c.likeCount || 0,
          published: c.publishedText || 'recently',
          isPinned: !!c.isPinned,
          replyCount: c.replies?.replyCount || 0,
        }));
        setComments((prev) => [...prev, ...moreList]);
        setContinuation(res.continuation);
      } else {
        setContinuation(undefined);
      }
    } catch (e) {
      console.warn('[ShortsComments] Failed to load more comments:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    const newComment: CommentItem = {
      id: `local-${Date.now()}`,
      author: 'You',
      authorThumbnail: '',
      text: inputVal.trim(),
      likes: 0,
      published: 'Just now',
      isPinned: false,
    };
    setComments((prev) => [newComment, ...prev]);
    setTotalCount((prev) => (prev !== null ? prev + 1 : 1));
    setInputVal('');
  };

  const toggleCommentLike = (id: string) => {
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const wasLiked = c.userLiked;
          return {
            ...c,
            userLiked: !wasLiked,
            userDisliked: false,
            likes: wasLiked ? c.likes - 1 : c.likes + 1,
          };
        }
        return c;
      })
    );
  };

  const toggleCommentDislike = (id: string) => {
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const wasDisliked = c.userDisliked;
          return {
            ...c,
            userDisliked: !wasDisliked,
            userLiked: false,
            likes: c.userLiked ? c.likes - 1 : c.likes,
          };
        }
        return c;
      })
    );
  };

  return (
    <div
      className="shorts-comments-content"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--yt-surface, #0f0f0f)',
        color: 'var(--yt-text-primary, #ffffff)',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--yt-border, rgba(255, 255, 255, 0.12))',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--yt-text-primary, #ffffff)' }}>Comments</span>
          {totalCount !== null && (
            <span style={{ fontSize: '13px', color: 'var(--yt-text-secondary, rgba(255, 255, 255, 0.65))', fontWeight: 600 }}>
              {totalCount}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setSortBy((prev) => (prev === 'top' ? 'new' : 'top'))}
            title={sortBy === 'top' ? 'Switch to Newest comments' : 'Switch to Top comments'}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--yt-text-primary, #0f0f0f)',
              padding: '6px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
              transition: 'all 0.2s',
            }}
          >
            <IoFilterOutline size={20} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close comments"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--yt-text-primary, #0f0f0f)',
              padding: '6px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
              transition: 'all 0.2s',
            }}
          >
            <IoClose size={22} />
          </button>
        </div>
      </div>

      {/* Body: Scrollable Comments Feed */}
      <div
        className="shorts-comments-body"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', opacity: 0.7 }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--yt-hover, #e5e5e5)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: '38%', height: '12px', backgroundColor: 'var(--yt-hover, #e5e5e5)', borderRadius: '4px', marginBottom: '8px' }} />
                  <div style={{ width: '90%', height: '12px', backgroundColor: 'var(--yt-hover, #e5e5e5)', borderRadius: '4px', marginBottom: '6px' }} />
                  <div style={{ width: '60%', height: '12px', backgroundColor: 'var(--yt-hover, #e5e5e5)', borderRadius: '4px' }} />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--yt-text-secondary, #606060)' }}>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--yt-text-primary, #0f0f0f)' }}>No comments yet</p>
            <p style={{ margin: '6px 0 0', fontSize: '13px', opacity: 0.85 }}>Be the first to share your thoughts!</p>
          </div>
        ) : (
          comments.map((c) => {
            const cleanAuthor = (c.author || 'Viewer').replace(/^@+/, '');
            const initial = cleanAuthor.charAt(0).toUpperCase() || 'V';
            const avatarBg = getAvatarColor(cleanAuthor);
            const cleanUploader = (uploader || '').replace(/^@+/, '');

            return (
              <div key={c.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                {/* Author Avatar */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: c.authorThumbnail ? 'transparent' : avatarBg,
                    overflow: 'hidden',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: '#ffffff',
                  }}
                >
                  {c.authorThumbnail ? (
                    <img src={c.authorThumbnail} alt={cleanAuthor} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    initial
                  )}
                </div>

                {/* Comment Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Pinned label if pinned */}
                  {c.isPinned && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--yt-text-secondary, #606060)',
                        marginBottom: '4px',
                      }}
                    >
                      <IoPin size={13} style={{ transform: 'rotate(45deg)' }} />
                      <span>Pinned by @{cleanUploader}</span>
                    </div>
                  )}

                  {/* Author Name + Badge + Published */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--yt-text-primary, #0f0f0f)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '180px',
                      }}
                    >
                      @{cleanAuthor}
                    </span>
                  {c.authorIsChannelOwner && (
                    <span
                      style={{
                        fontSize: '10px',
                        backgroundColor: 'var(--yt-hover, rgba(0, 0, 0, 0.08))',
                        color: 'var(--yt-text-secondary, #606060)',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 600,
                      }}
                    >
                      Author
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--yt-text-secondary, #606060)' }}>
                    {c.published}
                  </span>
                </div>

                {/* Comment Text */}
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    lineHeight: '1.45',
                    color: 'var(--yt-text-primary, #0f0f0f)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {c.text}
                </p>

                {/* Actions: Likes, Dislike, Reply */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
                  {/* Like Button */}
                  <button
                    type="button"
                    onClick={() => toggleCommentLike(c.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: c.userLiked ? '#ff0033' : 'var(--yt-text-secondary, #606060)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {c.userLiked ? <IoThumbsUp size={14} /> : <IoThumbsUpOutline size={14} />}
                    {c.likes > 0 && <span style={{ fontWeight: 600 }}>{formatViews(c.likes)}</span>}
                  </button>

                  {/* Dislike Button */}
                  <button
                    type="button"
                    onClick={() => toggleCommentDislike(c.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: c.userDisliked ? '#ff0033' : 'var(--yt-text-secondary, #606060)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    {c.userDisliked ? <IoThumbsDown size={14} /> : <IoThumbsDownOutline size={14} />}
                  </button>

                  {/* Reply Button */}
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--yt-text-secondary, #606060)',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    Reply
                  </button>
                </div>

                {/* Replies Count */}
                {c.replyCount && c.replyCount > 0 ? (
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--yt-blue, #065fd4)',
                      cursor: 'pointer',
                    }}
                  >
                    ▾ {c.replyCount} {c.replyCount === 1 ? 'reply' : 'replies'}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })
      )}

        {continuation && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              style={{
                backgroundColor: 'var(--yt-hover, #f2f2f2)',
                border: 'none',
                color: 'var(--yt-blue, #065fd4)',
                padding: '8px 18px',
                borderRadius: '18px',
                cursor: loadingMore ? 'default' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {loadingMore ? 'Loading more comments...' : 'Load more comments'}
            </button>
          </div>
        )}
      </div>

      {/* Sticky Bottom Comment Input Bar */}
      <form
        onSubmit={handlePost}
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--yt-border, rgba(255, 255, 255, 0.12))',
          backgroundColor: 'var(--yt-surface, #ffffff)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: 'var(--yt-hover, #e5e5e5)',
            color: 'var(--yt-text-primary, #0f0f0f)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          Y
        </div>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Add a comment..."
          style={{
            flex: 1,
            backgroundColor: 'var(--yt-hover, rgba(0, 0, 0, 0.05))',
            border: '1px solid var(--yt-border, rgba(0, 0, 0, 0.12))',
            borderRadius: '20px',
            padding: '8px 14px',
            color: 'var(--yt-text-primary, #0f0f0f)',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!inputVal.trim()}
          style={{
            background: inputVal.trim() ? 'var(--md-sys-color-primary, #ff0033)' : 'transparent',
            border: 'none',
            color: inputVal.trim() ? '#ffffff' : 'var(--yt-text-secondary, rgba(0, 0, 0, 0.3))',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputVal.trim() ? 'pointer' : 'default',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
        >
          <IoSend size={15} style={{ marginLeft: inputVal.trim() ? '2px' : '0' }} />
        </button>
      </form>
    </div>
  );
}

interface SoundPivotVideo {
  id: string;
  title: string;
  thumbnail: string;
  views?: string;
}

interface SoundPivotData {
  sound?: {
    title?: string;
    author?: string;
    thumbnail?: string;
    audioPivotToken?: string;
  };
  videos: SoundPivotVideo[];
}

function ShortsSoundPanel({
  video,
  onClose,
  onSelectShort,
}: {
  video: ShortVideo;
  onClose: () => void;
  onSelectShort: (shortId: string) => void;
}) {
  const [data, setData] = useState<SoundPivotData>({ videos: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchPivot() {
      setLoading(true);
      try {
        const res = await fetch('/api/shorts/sound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: video.id,
            continuationToken: video.sound?.audioPivotToken,
            soundTitle: video.sound?.title || video.title,
          }),
        });
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.warn('Failed to load sound pivot:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPivot();
    return () => {
      cancelled = true;
    };
  }, [video]);

  const cleanUploader = (video.uploader || 'Creator').replace(/^@+/, '');
  const soundTitle = data.sound?.title || video.sound?.title || `Original Sound · ${cleanUploader}`;
  const soundAuthor = data.sound?.author || cleanUploader;
  const soundThumb = data.sound?.thumbnail || video.sound?.thumbnail || video.channelAvatar;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--yt-text-primary, #ffffff)', overflow: 'hidden' }}>
      {/* Sound Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--yt-border, rgba(255,255,255,0.12))',
          backgroundColor: 'var(--yt-surface, #181818)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: '#272727',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {soundThumb ? (
              <img src={soundThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <IoMusicalNotes size={22} color="#ffffff" />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                fontSize: '15px',
                fontWeight: 700,
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={soundTitle}
            >
              {soundTitle}
            </h3>
            <p
              style={{
                fontSize: '12px',
                color: 'var(--yt-text-secondary, #aaaaaa)',
                margin: '2px 0 0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {soundAuthor} • {loading ? 'Loading...' : `${data.videos.length} shorts`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close"
        >
          <IoClose size={22} />
        </button>
      </div>

      {/* Body: Grid of shorts sharing this sound */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '220px' }}>
            <LoadingSpinner />
          </div>
        ) : data.videos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--yt-text-secondary, #aaaaaa)' }}>
            <IoMusicalNotes size={36} style={{ opacity: 0.5, marginBottom: '8px' }} />
            <p style={{ margin: 0, fontSize: '14px' }}>No additional videos found using this sound yet.</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
            }}
          >
            {data.videos.map((v) => (
              <div
                key={v.id}
                onClick={() => onSelectShort(v.id)}
                style={{
                  position: 'relative',
                  aspectRatio: '9 / 16',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  backgroundColor: '#202020',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                title={v.title}
              >
                <img
                  src={v.thumbnail}
                  alt={v.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 6px 6px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {v.views && <span>{v.views}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShortCard({
  video,
  isActive,
  muted,
  toggleMute,
  isCommentsOpen,
  toggleComments,
  closeComments,
  isSoundOpen,
  onOpenSound,
  closeSound,
  onSelectShort,
}: {
  video: ShortVideo;
  isActive: boolean;
  muted: boolean;
  toggleMute: () => void;
  isCommentsOpen: boolean;
  toggleComments: () => void;
  closeComments: () => void;
  isSoundOpen?: boolean;
  onOpenSound?: (video: ShortVideo) => void;
  closeSound?: () => void;
  onSelectShort?: (shortId: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likeCount, setLikeCount] = useState(
    video.view_count ? Math.floor(video.view_count * 0.08) : 5200
  );
  const [commentCount, setCommentCount] = useState<number>(
    video.commentCount || (video.view_count ? Math.max(12, Math.floor(video.view_count * 0.003)) : 125)
  );
  const [heartAnim, setHeartAnim] = useState(false);
  const [isSub, setIsSub] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [hudIcon, setHudIcon] = useState<'play' | 'pause' | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hudTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  const sendPlayerCommand = useCallback((func: string, args: any = '') => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func,
            args,
          }),
          '*'
        );
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (video.channelId) {
      setIsSub(isSubscribed(video.channelId));
    }
  }, [video.channelId]);

  // Synchronize playback when current active short changes
  useEffect(() => {
    if (isActive) {
      setIsPlaying(true);
      sendPlayerCommand(muted ? 'mute' : 'unMute');
      sendPlayerCommand('playVideo');
    } else {
      sendPlayerCommand('pauseVideo');
      setIsPlaying(false);
    }
  }, [isActive, sendPlayerCommand]);

  // Synchronize mute state
  useEffect(() => {
    if (isActive) {
      sendPlayerCommand(muted ? 'mute' : 'unMute');
    }
  }, [muted, isActive, sendPlayerCommand]);

  const triggerHud = (type: 'play' | 'pause') => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    setHudIcon(type);
    hudTimerRef.current = setTimeout(() => {
      setHudIcon(null);
    }, 600);
  };

  const togglePlayPause = () => {
    if (!isActive) return;
    if (isPlaying) {
      sendPlayerCommand('pauseVideo');
      setIsPlaying(false);
      triggerHud('pause');
    } else {
      sendPlayerCommand('playVideo');
      setIsPlaying(true);
      triggerHud('play');
    }
  };

  const handleCardClick = () => {
    if (clickTimerRef.current) {
      // Double tap detected -> like
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      if (!liked) {
        setLiked(true);
        setLikeCount((prev) => prev + 1);
        if (disliked) setDisliked(false);
      }
      setHeartAnim(true);
      setTimeout(() => setHeartAnim(false), 700);
    } else {
      // Wait to disambiguate single tap from double tap
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        togglePlayPause();
      }, 260);
    }
  };

  const handleToggleSub = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!video.channelId) return;
    const next = toggleSubscription({
      channelId: video.channelId,
      channelName: video.uploader,
      channelAvatar: video.channelAvatar,
    });
    setIsSub(next);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: video.title,
          url: `${window.location.origin}/watch?v=${video.id}`,
        });
      } else {
        await navigator.clipboard.writeText(`${window.location.origin}/watch?v=${video.id}`);
        alert('Shorts video link copied!');
      }
    } catch {}
  };

  const cleanUploader = (video.uploader || 'Creator').replace(/^@+/, '');
  const [avatarError, setAvatarError] = useState(false);
  const resolvedAvatar =
    video.channelAvatar ||
    (video.channelId
      ? `/api/channel-avatar?id=${encodeURIComponent(video.channelId)}`
      : cleanUploader
      ? `/api/channel-avatar?id=@${encodeURIComponent(cleanUploader)}`
      : '');

  // Embed URL for flawless vertical video playback with audio & JS control API
  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${video.id}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&enablejsapi=1`;

  return (
    <div className="short-card-container">
      {/* Responsive Full-View / Frame Container */}
      <div onClick={handleCardClick} className="short-video-wrapper">
        {/* Ambient Blur Backdrop (fills letterbox gaps with smooth colored ambiance) */}
        <div
          style={{
            position: 'absolute',
            inset: '-10%',
            backgroundImage: `url(${video.thumbnail})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(36px) brightness(0.65)',
            transform: 'scale(1.15)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />

        {/* Active Iframe Video Player with Full Viewport Coverage */}
        {isActive ? (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        ) : (
          <img
            src={video.thumbnail}
            alt={video.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              position: 'relative',
              zIndex: 2,
            }}
          />
        )}

        {/* Center Play/Pause Animated HUD */}
        {hudIcon && (
          <div className="short-hud-anim">
            {hudIcon === 'pause' ? <IoPause size={46} /> : <IoPlay size={46} />}
          </div>
        )}

        {/* Double-Tap Heart Animation */}
        {heartAnim && (
          <div className="short-heart-anim">
            <IoHeart size={84} />
          </div>
        )}

        {/* Top Sound Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="short-sound-btn"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <IoVolumeMute size={22} /> : <IoVolumeHigh size={22} />}
        </button>

        {/* Full-Width Seamless Bottom Gradient */}
        <div className="short-bottom-gradient" />

        {/* Bottom Info Overlay */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="short-bottom-info"
        >
          {/* Channel Author & Subscribe Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Link
              href={video.channelId ? `/channel/${video.channelId}` : `/watch?v=${video.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#ffffff',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: getAvatarColor(cleanUploader),
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                {resolvedAvatar && !avatarError ? (
                  <img
                    src={resolvedAvatar}
                    alt={cleanUploader}
                    onError={() => setAvatarError(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  cleanUploader?.[0]?.toUpperCase() || 'C'
                )}
              </div>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '15px',
                  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                  maxWidth: '160px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                @{cleanUploader}
              </span>
            </Link>

            {video.channelId && (
              <button
                type="button"
                onClick={handleToggleSub}
                style={{
                  padding: '5px 14px',
                  borderRadius: '18px',
                  border: 'none',
                  backgroundColor: isSub ? 'rgba(255,255,255,0.25)' : '#ffffff',
                  color: isSub ? '#ffffff' : '#000000',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(6px)',
                  transition: 'all 0.2s',
                }}
              >
                {isSub ? 'Subscribed' : 'Subscribe'}
              </button>
            )}
          </div>

          {/* Title */}
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 500,
              lineHeight: '1.4',
              margin: '0 0 8px',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            {video.title}
          </h3>

          {/* Audio Track / Sound Pill */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenSound?.(video);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '3px 8px',
              margin: '-3px -8px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#ffffff',
              opacity: 0.9,
              cursor: 'pointer',
              maxWidth: '260px',
              textAlign: 'left',
              transition: 'background-color 0.2s, opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            title="Click to view other videos using this sound"
          >
            <IoMusicalNotes size={14} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {video.sound?.title || `Original Sound · ${cleanUploader}`}
            </span>
          </button>
        </div>

        {/* Real-time YouTube Red Playback Progress Bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
            zIndex: 25,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              backgroundColor: '#ff0000',
              animation: isActive ? `shortsProgressBar ${video.lengthSeconds || 30}s linear infinite` : 'none',
              animationPlayState: isPlaying ? 'running' : 'paused',
              transformOrigin: 'left center',
            }}
          />
        </div>
      </div>

      {/* Right Actions Toolbar (Beside video on desktop, bottom-right floating on mobile) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="short-actions-toolbar"
      >
        {/* Like Button */}
        <button
          type="button"
          onClick={() => {
            setLiked(!liked);
            setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
            if (!liked && disliked) setDisliked(false);
          }}
          className="short-action-btn"
          title="Like"
        >
          <div className={`short-action-circle ${liked ? 'active-like' : ''}`}>
            {liked ? <IoThumbsUp size={22} /> : <IoThumbsUpOutline size={22} />}
          </div>
          <span className="short-action-label">{formatViews(likeCount)}</span>
        </button>

        {/* Dislike Button */}
        <button
          type="button"
          onClick={() => {
            setDisliked(!disliked);
            if (!disliked && liked) {
              setLiked(false);
              setLikeCount((prev) => prev - 1);
            }
          }}
          className="short-action-btn"
          title="Dislike"
        >
          <div className={`short-action-circle ${disliked ? 'active-dislike' : ''}`}>
            {disliked ? <IoThumbsDown size={22} /> : <IoThumbsDownOutline size={22} />}
          </div>
          <span className="short-action-label">Dislike</span>
        </button>

        {/* Comments Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleComments();
          }}
          className="short-action-btn"
          title="Comments"
        >
          <div className={`short-action-circle ${isCommentsOpen ? 'active-comments' : ''}`}>
            <IoChatbubbleEllipsesOutline size={22} />
          </div>
          <span className="short-action-label">{formatViews(commentCount)}</span>
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={handleShare}
          className="short-action-btn"
          title="Share"
        >
          <div className="short-action-circle">
            <IoShareOutline size={22} />
          </div>
          <span className="short-action-label">Share</span>
        </button>

        {/* Remix Button (Official YouTube Shorts Feature) */}
        <button
          type="button"
          onClick={handleShare}
          className="short-action-btn"
          title="Remix"
        >
          <div className="short-action-circle">
            <IoRepeatOutline size={24} />
          </div>
          <span className="short-action-label">Remix</span>
        </button>

        {/* Sound / Channel Album Thumbnail Badge */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenSound?.(video);
          }}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '2px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
            cursor: 'pointer',
            marginTop: '6px',
            flexShrink: 0,
            backgroundColor: '#1f1f1f',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.18s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          title={`Sound: ${video.sound?.title || `Original Sound - ${cleanUploader}`}`}
        >
          {video.sound?.thumbnail || (resolvedAvatar && !avatarError) ? (
            <img
              src={video.sound?.thumbnail || resolvedAvatar}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <IoMusicalNotes size={20} color="#ffffff" />
          )}
        </button>
      </div>

      {/* Desktop Comments Panel */}
      {isCommentsOpen && (
        <div className="shorts-desktop-comments-wrapper">
          <ShortsCommentsPanel
            videoId={video.id}
            uploader={video.uploader}
            onClose={closeComments}
            onUpdateCount={(cnt) => setCommentCount(cnt)}
          />
        </div>
      )}

      {/* Mobile Comments Bottom Sheet Modal */}
      {isCommentsOpen && (
        <div className="shorts-mobile-comments-modal">
          <div className="shorts-mobile-backdrop" onClick={closeComments} />
          <div className="shorts-mobile-sheet">
            <div className="shorts-mobile-drag-handle" />
            <ShortsCommentsPanel
              videoId={video.id}
              uploader={video.uploader}
              onClose={closeComments}
              onUpdateCount={(cnt) => setCommentCount(cnt)}
            />
          </div>
        </div>
      )}

      {/* Desktop Sound Panel (docked to the right of the action toolbar in flex row) */}
      {isSoundOpen && (
        <div className="shorts-desktop-comments-wrapper">
          <ShortsSoundPanel
            video={video}
            onClose={closeSound || (() => {})}
            onSelectShort={onSelectShort || (() => {})}
          />
        </div>
      )}

      {/* Mobile Sound Bottom Sheet Modal */}
      {isSoundOpen && (
        <div className="shorts-mobile-comments-modal">
          <div className="shorts-mobile-backdrop" onClick={closeSound} />
          <div className="shorts-mobile-sheet" style={{ height: '75vh' }}>
            <div className="shorts-mobile-drag-handle" />
            <ShortsSoundPanel
              video={video}
              onClose={closeSound || (() => {})}
              onSelectShort={onSelectShort || (() => {})}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ShortsPageContent() {
  const searchParams = useSearchParams();
  const urlShortId = searchParams.get('id');

  const [shorts, setShorts] = useState<ShortVideo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [muted, setMuted] = useState(false);
  const [currentRegion, setCurrentRegion] = useState('VN');
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isSoundOpen, setIsSoundOpen] = useState(false);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Read active region and listen to region changes
  useEffect(() => {
    const saved = (typeof window !== 'undefined' ? localStorage.getItem('kv_region') : null) || 'VN';
    setCurrentRegion(saved);

    const handleRegionChange = (e: any) => {
      if (e.detail?.region) {
        setCurrentRegion(e.detail.region);
      }
    };
    window.addEventListener('regionchange', handleRegionChange);
    return () => window.removeEventListener('regionchange', handleRegionChange);
  }, []);

  const loadInitialShorts = useCallback(async (region: string) => {
    setLoading(true);
    globalSeenIds.clear();
    if (urlShortId) {
      globalSeenIds.add(urlShortId);
    }

    // 1. Try authentic YouTube Shorts sequence feed API
    try {
      const res = await fetch(`/api/shorts/feed?region=${encodeURIComponent(region)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.shorts) && data.shorts.length > 0) {
          for (const v of data.shorts) {
            globalSeenIds.add(v.id);
          }

          let initialList = [...data.shorts];
          if (urlShortId && !initialList.some((s) => s.id === urlShortId)) {
            initialList = [
              {
                id: urlShortId,
                title: 'Short Video',
                uploader: 'Creator',
                thumbnail: `https://i.ytimg.com/vi/${urlShortId}/hqdefault.jpg`,
                channelAvatar: `/api/channel-avatar?id=@Creator`,
                view_count: 35000,
              },
              ...initialList,
            ];
          }

          setShorts(initialList);
          setContinuationToken(data.continuation || null);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('[Shorts] /api/shorts/feed initial load failed, falling back to Invidious', e);
    }

    // 2. Resilient fallback to Invidious search
    const batch1 = await fetchUniqueShorts(1, region);
    const batch2 = await fetchUniqueShorts(2, region);
    let combined = [...batch1, ...batch2];
    if (urlShortId && !combined.some((s) => s.id === urlShortId)) {
      combined = [
        {
          id: urlShortId,
          title: 'Short Video',
          uploader: 'Creator',
          thumbnail: `https://i.ytimg.com/vi/${urlShortId}/hqdefault.jpg`,
          channelAvatar: `/api/channel-avatar?id=@Creator`,
          view_count: 35000,
        },
        ...combined,
      ];
    }
    setShorts(combined);
    setPage(3);
    setLoading(false);
  }, [urlShortId]);

  useEffect(() => {
    loadInitialShorts(currentRegion);
  }, [currentRegion, loadInitialShorts]);

  // Pre-fetch rich sound & direct high-res avatar for currently active short
  useEffect(() => {
    const current = shorts[currentIndex];
    if (!current || current.sound) return;

    let cancelled = false;
    fetch(`/api/shorts/sound?videoId=${encodeURIComponent(current.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.sound) {
          setShorts((prev) => {
            const copy = [...prev];
            if (copy[currentIndex] && copy[currentIndex].id === current.id) {
              copy[currentIndex] = {
                ...copy[currentIndex],
                sound: data.sound,
                channelAvatar: data.channelAvatar || copy[currentIndex].channelAvatar,
                channelId: data.channelId || copy[currentIndex].channelId,
                uploader: data.channelName || copy[currentIndex].uploader,
              };
            }
            return copy;
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentIndex, shorts]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;

    // 1. Try continuation token with authentic Shorts sequence
    if (continuationToken) {
      try {
        const res = await fetch(
          `/api/shorts/feed?region=${encodeURIComponent(currentRegion)}&continuation=${encodeURIComponent(continuationToken)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.shorts) && data.shorts.length > 0) {
            const newShorts: ShortVideo[] = [];
            for (const v of data.shorts) {
              if (!globalSeenIds.has(v.id)) {
                globalSeenIds.add(v.id);
                newShorts.push(v);
              }
            }
            if (newShorts.length > 0) {
              setShorts((prev) => [...prev, ...newShorts]);
              setContinuationToken(data.continuation || null);
              loadingMoreRef.current = false;
              return;
            }
          }
        }
      } catch (e) {
        console.warn('[Shorts] loadMore via continuation failed, falling back to Invidious', e);
      }
    }

    // 2. Resilient fallback to Invidious search
    const nextPage = page + 1;
    const more = await fetchUniqueShorts(nextPage, currentRegion);
    if (more.length > 0) {
      setShorts((prev) => [...prev, ...more]);
      setPage(nextPage);
    }
    loadingMoreRef.current = false;
  }, [continuationToken, currentRegion, page]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = containerRef.current;
    const index = Math.round(scrollTop / clientHeight);
    if (index !== currentIndex && index < shorts.length) {
      setCurrentIndex(index);
    }
    // Pre-fetch next shorts when reaching within 2 videos of the end
    if (scrollHeight - scrollTop - clientHeight < 1000) {
      loadMore();
    }
  };

  const scrollTo = (dir: 'next' | 'prev') => {
    if (!containerRef.current) return;
    const h = containerRef.current.clientHeight;
    if (dir === 'next' && currentIndex < shorts.length - 1) {
      containerRef.current.scrollBy({ top: h, behavior: 'smooth' });
    } else if (dir === 'prev' && currentIndex > 0) {
      containerRef.current.scrollBy({ top: -h, behavior: 'smooth' });
    }
  };

  const handleSelectShortFromSound = (selectedId: string) => {
    setIsSoundOpen(false);

    const existingIdx = shorts.findIndex((s) => s.id === selectedId);
    if (existingIdx !== -1) {
      setCurrentIndex(existingIdx);
      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: existingIdx * containerRef.current.clientHeight,
          behavior: 'smooth',
        });
      }
      return;
    }

    const newShort: ShortVideo = {
      id: selectedId,
      title: 'Short Video',
      uploader: 'Creator',
      thumbnail: `https://i.ytimg.com/vi/${selectedId}/hqdefault.jpg`,
      channelAvatar: `/api/channel-avatar?id=@Creator`,
      view_count: 50000,
    };

    const nextIdx = currentIndex + 1;
    setShorts((prev) => {
      const updated = [...prev];
      updated.splice(nextIdx, 0, newShort);
      return updated;
    });

    setTimeout(() => {
      setCurrentIndex(nextIdx);
      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: nextIdx * containerRef.current.clientHeight,
          behavior: 'smooth',
        });
      }
    }, 60);
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'Escape' && (isCommentsOpen || isSoundOpen)) {
        e.preventDefault();
        setIsCommentsOpen(false);
        setIsSoundOpen(false);
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setIsCommentsOpen((prev) => !prev);
        setIsSoundOpen(false);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollTo('next');
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollTo('prev');
      }
      if (e.key === 'm') {
        e.preventDefault();
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentIndex, shorts.length, isCommentsOpen, isSoundOpen]);

  if (loading && shorts.length === 0) {
    return (
      <div
        style={{
          height: 'calc(100vh - var(--yt-header-height))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <LoadingSpinner text={`Loading ${currentRegion} Shorts...`} fullScreen={false} size="large" />
      </div>
    );
  }

  return (
    <div
      className="shorts-page-container"
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - var(--yt-header-height))',
        backgroundColor: 'var(--yt-background, #ffffff)',
      }}
    >
      <style jsx global>{`
        /* Base styles for action buttons */
        .short-action-btn {
          background: none;
          border: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          text-decoration: none;
          padding: 0;
          transition: transform 0.15s ease;
        }

        .short-action-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background-color: var(--yt-hover, #f2f2f2);
          color: var(--yt-text-primary, #0f0f0f);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s, transform 0.15s ease;
          border: 1px solid var(--yt-border, #e5e5e5);
        }

        .short-action-circle:hover {
          background-color: var(--yt-active, #e5e5e5);
          transform: scale(1.06);
        }

        .short-action-circle.active-like {
          background-color: var(--md-sys-color-primary, #ff0033);
          color: #ffffff;
        }

        .short-action-circle.active-dislike {
          background-color: rgba(255, 45, 85, 0.25);
          color: #ff2d55;
        }

        .short-action-circle.active-comments {
          background-color: var(--yt-active, #e5e5e5);
          box-shadow: 0 0 12px rgba(0, 0, 0, 0.15);
        }

        .short-action-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--yt-text-primary, #0f0f0f);
        }

        .short-sound-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background-color: rgba(0, 0, 0, 0.65);
          color: #ffffff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 30;
          backdrop-filter: blur(8px);
        }

        @keyframes hudPopFade {
          0% {
            transform: translate(-50%, -50%) scale(0.6);
            opacity: 0;
          }
          40% {
            transform: translate(-50%, -50%) scale(1.15);
            opacity: 0.95;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.25);
            opacity: 0;
          }
        }

        .short-hud-anim {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 76px;
          height: 76px;
          border-radius: 50%;
          background-color: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 26;
          pointer-events: none;
          animation: hudPopFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }

        .short-heart-anim {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) scale(1.3);
          color: #ff2d55;
          z-index: 25;
          animation: bounce 0.6s ease;
          filter: drop-shadow(0 4px 16px rgba(0,0,0,0.6));
          pointer-events: none;
        }

        .short-bottom-gradient {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 280px;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.08) 75%, transparent 100%);
          pointer-events: none;
          z-index: 15;
        }

        /* Mobile Full Viewport Coverage with 64px MobileNav Safe Area */
        @media (max-width: 768px) {
          .shorts-page-container {
            height: calc(100vh - 120px) !important;
            height: calc(100dvh - var(--yt-header-height) - 64px) !important;
          }
          .short-card-container {
            height: calc(100vh - 120px) !important;
            height: calc(100dvh - var(--yt-header-height) - 64px) !important;
            display: block !important;
            position: relative !important;
            padding: 0 !important;
            scroll-snap-align: start !important;
            scroll-snap-stop: always !important;
            overflow: hidden !important;
          }
          .short-video-wrapper {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .short-bottom-info {
            position: absolute !important;
            bottom: 14px !important;
            left: 0 !important;
            right: 0 !important;
            padding-bottom: 0 !important;
            padding-left: 14px !important;
            padding-right: 74px !important;
            z-index: 22 !important;
          }
          .short-actions-toolbar {
            position: absolute !important;
            bottom: 14px !important;
            right: 10px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 12px !important;
            align-items: center !important;
            z-index: 30 !important;
          }
          .short-action-circle {
            background-color: rgba(0, 0, 0, 0.65) !important;
            backdrop-filter: blur(8px) !important;
            color: #ffffff !important;
            border: none !important;
          }
          .short-action-label {
            color: #ffffff !important;
            text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8) !important;
          }
          .shorts-desktop-nav {
            display: none !important;
          }
          .shorts-desktop-comments-wrapper {
            display: none !important;
          }
          .shorts-mobile-comments-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
          }
          .shorts-mobile-backdrop {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(2px);
          }
          .shorts-mobile-sheet {
            position: relative;
            width: 100%;
            height: 72vh;
            background-color: var(--yt-surface, #0f0f0f);
            border-top: 1px solid var(--yt-border, rgba(255, 255, 255, 0.15));
            border-radius: 16px 16px 0 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.85);
            animation: slideUpMobile 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .shorts-mobile-drag-handle {
            width: 36px;
            height: 4px;
            border-radius: 2px;
            background-color: rgba(255, 255, 255, 0.35);
            margin: 8px auto 0 auto;
            flex-shrink: 0;
          }
        }

        /* Desktop Clean Center 9:16 View */
        @media (min-width: 769px) {
          .short-card-container {
            height: calc(100vh - var(--yt-header-height)) !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 16px !important;
            padding: 4px 0 12px 0 !important;
            max-width: 100vw;
            box-sizing: border-box;
            scroll-snap-align: start !important;
            scroll-snap-stop: always !important;
          }
          .short-video-wrapper {
            position: relative;
            height: calc(100vh - var(--yt-header-height) - 16px) !important;
            max-height: calc(100vh - var(--yt-header-height) - 16px) !important;
            aspect-ratio: 9 / 16 !important;
            width: auto !important;
            border-radius: 12px !important;
            overflow: hidden !important;
            background-color: #000000 !important;
            box-shadow: 0 10px 36px rgba(0, 0, 0, 0.4) !important;
            flex-shrink: 0;
            user-select: none;
          }
          .short-bottom-info {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 0 18px 22px 18px !important;
            color: #ffffff;
            z-index: 20;
          }
          .short-actions-toolbar {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 16px !important;
            align-self: flex-end !important;
            margin-bottom: 24px !important;
            flex-shrink: 0;
            z-index: 25;
          }
          .shorts-desktop-nav {
            display: flex !important;
          }
          .shorts-mobile-comments-modal {
            display: none !important;
          }
          .shorts-desktop-comments-wrapper {
            width: clamp(340px, 30vw, 420px);
            height: calc(100vh - var(--yt-header-height) - 16px) !important;
            max-height: 890px !important;
            background-color: var(--yt-surface, #ffffff);
            border: 1px solid var(--yt-border, #e5e5e5);
            border-radius: 16px;
            box-shadow: var(--yt-shadow-lg, 0 10px 36px rgba(0, 0, 0, 0.15));
            display: flex;
            flex-direction: column;
            overflow: hidden;
            flex-shrink: 0;
            animation: fadeInDesktop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 35;
          }
        }

        /* Overlay comments on desktop when viewport width is constrained so the video never shrinks */
        @media (min-width: 769px) and (max-width: 1240px) {
          .shorts-desktop-comments-wrapper {
            position: fixed !important;
            right: 24px !important;
            top: calc(var(--yt-header-height) + 8px) !important;
            bottom: 12px !important;
            height: auto !important;
            max-height: calc(100vh - var(--yt-header-height) - 20px) !important;
            width: 380px !important;
            max-width: calc(100vw - 48px) !important;
            box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45) !important;
            z-index: 50 !important;
          }
        }

        @keyframes slideUpMobile {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        @keyframes fadeInDesktop {
          from {
            opacity: 0;
            transform: translateX(16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes shortsProgressBar {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }

        .shorts-comments-body::-webkit-scrollbar {
          width: 6px;
        }
        .shorts-comments-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .shorts-comments-body::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        .shorts-comments-body::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.4);
        }
      `}</style>

      {/* Scrollable Shorts Feed */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
        }}
      >
        {shorts.map((video, idx) => (
          <ShortCard
            key={video.id}
            video={video}
            isActive={idx === currentIndex}
            muted={muted}
            toggleMute={() => setMuted((m) => !m)}
            isCommentsOpen={idx === currentIndex && isCommentsOpen}
            toggleComments={() => {
              setIsCommentsOpen((prev) => !prev);
              setIsSoundOpen(false);
            }}
            closeComments={() => setIsCommentsOpen(false)}
            isSoundOpen={idx === currentIndex && isSoundOpen}
            onOpenSound={() => {
              setIsSoundOpen(true);
              setIsCommentsOpen(false);
            }}
            closeSound={() => setIsSoundOpen(false)}
            onSelectShort={handleSelectShortFromSound}
          />
        ))}
      </div>

      {/* Desktop Floating Navigation Controls (Previous / Next) - Hidden on Mobile */}
      <div
        className="shorts-desktop-nav"
        style={{
          position: 'fixed',
          right: '32px',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 40,
        }}
      >
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={() => scrollTo('prev')}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              backgroundColor: 'var(--yt-surface, #ffffff)',
              border: '1px solid var(--yt-border, #e5e5e5)',
              color: 'var(--yt-text-primary, #0f0f0f)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--yt-shadow-lg, 0 4px 16px rgba(0, 0, 0, 0.12))',
              transition: 'all 0.2s ease',
            }}
            title="Previous short (Arrow Up / k)"
          >
            <IoArrowUp size={22} />
          </button>
        )}
        <button
          type="button"
          onClick={() => scrollTo('next')}
          disabled={currentIndex >= shorts.length - 1}
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: 'var(--yt-surface, #ffffff)',
            border: '1px solid var(--yt-border, #e5e5e5)',
            color: 'var(--yt-text-primary, #0f0f0f)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: currentIndex >= shorts.length - 1 ? 'not-allowed' : 'pointer',
            opacity: currentIndex >= shorts.length - 1 ? 0.35 : 1,
            boxShadow: 'var(--yt-shadow-lg, 0 4px 16px rgba(0, 0, 0, 0.12))',
            transition: 'all 0.2s ease',
          }}
          title="Next short (Arrow Down / j)"
        >
          <IoArrowDown size={22} />
        </button>
      </div>
    </div>
  );
}

export default function ShortsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ height: 'calc(100vh - var(--yt-header-height))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </div>
      }
    >
      <ShortsPageContent />
    </Suspense>
  );
}
