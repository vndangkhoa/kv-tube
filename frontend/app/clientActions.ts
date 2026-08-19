'use client';

import { VideoData } from './constants';
import { invidious } from './services/invidious';

// Client-side Caching Engine
const CLIENT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

function getClientCache<T>(key: string, ttlMs: number = CLIENT_CACHE_TTL_MS): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`kvc_${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > ttlMs) {
      sessionStorage.removeItem(`kvc_${key}`);
      return null;
    }
    return entry.val as T;
  } catch {
    return null;
  }
}

function setClientCache<T>(key: string, val: T): void {
  if (typeof window === 'undefined' || !val) return;
  try {
    sessionStorage.setItem(
      `kvc_${key}`,
      JSON.stringify({ ts: Date.now(), val })
    );
  } catch {
    try { sessionStorage.clear(); } catch {}
  }
}

// Transform raw backend / Invidious data to unified VideoData
export function transformVideo(raw: any): VideoData {
  if (!raw) {
    return {
      id: '',
      title: 'Untitled',
      thumbnail: '',
      uploader: 'Unknown',
      duration: '',
      view_count: 0,
      upload_date: '',
    };
  }

  const vidId = raw.videoId || raw.id || '';
  let thumb = `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`;
  if (Array.isArray(raw.videoThumbnails) && raw.videoThumbnails.length > 0) {
    // Pick low-res lightweight thumbnail (mqdefault: ~15KB) for 5x faster network loading
    const mq = raw.videoThumbnails.find((t: any) => t.quality === 'medium' || t.url?.includes('mqdefault'));
    thumb = mq?.url || raw.videoThumbnails[0]?.url || thumb;
  } else if (raw.thumbnail) {
    thumb = typeof raw.thumbnail === 'string'
      ? raw.thumbnail.replace('/maxresdefault.jpg', '/mqdefault.jpg').replace('/sddefault.jpg', '/mqdefault.jpg')
      : raw.thumbnail;
  }

  let dur = '';
  if (typeof raw.lengthSeconds === 'number' && raw.lengthSeconds > 0) {
    const mins = Math.floor(raw.lengthSeconds / 60);
    const secs = raw.lengthSeconds % 60;
    dur = `${mins}:${secs.toString().padStart(2, '0')}`;
  } else if (raw.duration) {
    dur = String(raw.duration);
  }

  const avatar =
    raw.authorThumbnails?.[0]?.url ||
    raw.authorThumbnails?.[raw.authorThumbnails.length - 1]?.url ||
    raw.authorThumbnail ||
    raw.avatar_url ||
    raw.channelAvatar ||
    '';

  return {
    id: vidId,
    title: raw.title || 'Untitled Video',
    thumbnail: thumb,
    channelTitle: raw.author || raw.uploader || raw.channelTitle || 'Unknown Creator',
    channelId: raw.authorId || raw.channel_id || raw.channelId || '',
    uploader: raw.author || raw.uploader || raw.channelTitle || 'Unknown Creator',
    viewCount: raw.viewCount ? raw.viewCount.toLocaleString() : (raw.view_count ? String(raw.view_count) : '0'),
    view_count: raw.viewCount ?? raw.view_count ?? 0,
    publishedAt: raw.publishedText || raw.upload_date || '',
    upload_date: raw.publishedText || raw.upload_date || '',
    duration: dur,
    description: raw.description || '',
    avatar_url: avatar,
  };
}

// Search videos using Invidious with client cache
export async function searchVideosClient(query: string, limit: number = 20): Promise<VideoData[]> {
  if (!query) return [];
  const cacheKey = `srch_${query}_${limit}`;
  const cached = getClientCache<VideoData[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const res = await invidious.search(query, { page: 1 });
    if (Array.isArray(res) && res.length > 0) {
      const transformed = res.map(transformVideo).filter((v) => v.id && v.title).slice(0, limit);
      setClientCache(cacheKey, transformed);
      return transformed;
    }
  } catch (error) {
    console.warn('[searchVideosClient] Invidious search error:', error);
  }

  return [];
}

// Home feed using Invidious Popular/Trending with client cache
export async function getHomeFeedClient(limit: number = 30, offset: number = 0): Promise<{ videos: VideoData[]; hasMore: boolean }> {
  const cacheKey = `home_${limit}_${offset}`;
  const cached = getClientCache<{ videos: VideoData[]; hasMore: boolean }>(cacheKey, 2 * 60 * 1000);
  if (offset === 0 && cached && cached.videos.length > 0) return cached;

  try {
    const items = await invidious.getPopular();
    if (Array.isArray(items) && items.length > 0) {
      const videos = items.map(transformVideo).filter((v) => v.id && v.title).slice(0, limit);
      const page = { videos, hasMore: videos.length >= limit };
      if (offset === 0 && videos.length > 0) {
        setClientCache(cacheKey, page);
      }
      return page;
    }
  } catch (error) {
    console.warn('[getHomeFeedClient] Invidious popular fetch error:', error);
  }

  return { videos: [], hasMore: false };
}

// Get video details using Invidious with YouTube oEmbed fallback
export async function getVideoDetailsClient(videoId: string): Promise<VideoData | null> {
  if (!videoId) return null;
  const cacheKey = `vdet_${videoId}`;
  const cached = getClientCache<VideoData>(cacheKey);
  if (cached) return cached;

  // 1. Try Invidious Video Details API
  try {
    const inv = await invidious.getVideo(videoId);
    if (inv && (inv.videoId || (inv as any).id)) {
      const transformed = transformVideo(inv);
      if (transformed.id && transformed.title) {
        setClientCache(cacheKey, transformed);
        return transformed;
      }
    }
  } catch (err) {
    console.warn('[getVideoDetailsClient] Invidious getVideo notice:', err);
  }

  // 2. Invidious Video Search Fallback (100% Invidious)
  try {
    const searchRes = await invidious.search(videoId, { type: 'video' });
    if (Array.isArray(searchRes) && searchRes.length > 0) {
      const match = searchRes.find((v) => (v.videoId || v.id) === videoId) || searchRes[0];
      if (match) {
        const fallbackVideo = transformVideo(match);
        setClientCache(cacheKey, fallbackVideo);
        return fallbackVideo;
      }
    }
  } catch {}

  return {
    id: videoId,
    title: 'YouTube Video',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channelTitle: 'YouTube',
    channelId: '',
    uploader: 'YouTube',
    viewCount: '',
    publishedAt: '',
    duration: '',
    description: '',
  };
}

// Get related videos using Invidious
export async function getRelatedVideosClient(videoId: string, limit: number = 15): Promise<VideoData[]> {
  if (!videoId) return [];
  const cacheKey = `rel_${videoId}_${limit}`;
  const cached = getClientCache<VideoData[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const video = await invidious.getVideo(videoId);
    if (video && Array.isArray(video.recommendedVideos) && video.recommendedVideos.length > 0) {
      const transformed = video.recommendedVideos
        .map(transformVideo)
        .filter((v) => v.id && v.title)
        .slice(0, limit);
      setClientCache(cacheKey, transformed);
      return transformed;
    }
  } catch {}

  // Fallback search
  try {
    const fallbackResults = await searchVideosClient('trending recommended videos', limit);
    if (fallbackResults.length > 0) return fallbackResults;
  } catch {}

  return [];
}

// Get trending videos using Invidious
export async function getTrendingVideosClient(regionCode: string = 'VN', limit: number = 20): Promise<VideoData[]> {
  const cacheKey = `trnd_${regionCode}_${limit}`;
  const cached = getClientCache<VideoData[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const res = await invidious.getTrending(regionCode);
    if (Array.isArray(res) && res.length > 0) {
      const transformed = res.map(transformVideo).filter((v) => v.id && v.title).slice(0, limit);
      setClientCache(cacheKey, transformed);
      return transformed;
    }
  } catch {}

  return [];
}

// Get comments using Invidious
export async function getCommentsClient(videoId: string, limit: number = 20): Promise<any[]> {
  if (!videoId) return [];
  const cacheKey = `cmts_${videoId}_${limit}`;
  const cached = getClientCache<any[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const res = await invidious.getComments(videoId);
    if (res && Array.isArray(res.comments) && res.comments.length > 0) {
      const transformed = res.comments.slice(0, limit).map((c) => ({
        id: c.commentId,
        text: c.contentHtml || c.content,
        author: c.author,
        authorId: c.authorId,
        authorThumbnail: c.authorThumbnails?.[0]?.url || '',
        likes: c.likeCount || 0,
        published: c.publishedText || 'recently',
        isReply: false,
      }));
      setClientCache(cacheKey, transformed);
      return transformed;
    }
  } catch {}

  return [];
}

// Get channel info using Invidious
export async function getChannelInfoClient(channelId: string): Promise<any | null> {
  if (!channelId) return null;
  const cacheKey = `chinfo_${channelId}`;
  const cached = getClientCache<any>(cacheKey);
  if (cached) return cached;

  try {
    const data = await invidious.getChannel(channelId);
    if (data) {
      const transformed = {
        id: data.authorId || channelId,
        title: data.author || 'Unknown Channel',
        avatar: data.authorThumbnails?.[data.authorThumbnails.length - 1]?.url || '',
        banner: data.authorBanners?.[data.authorBanners.length - 1]?.url || '',
        subscriberCount: data.subCount || 0,
        description: data.description || '',
      };
      setClientCache(cacheKey, transformed);
      return transformed;
    }
  } catch {}

  return null;
}

// Get channel videos using Invidious
export async function getChannelVideosClient(channelId: string, limit: number = 30): Promise<VideoData[]> {
  if (!channelId) return [];
  const cacheKey = `chvids_${channelId}_${limit}`;
  const cached = getClientCache<VideoData[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const res = await invidious.getChannelVideos(channelId);
    const list = Array.isArray(res) ? res : res?.videos || [];
    if (Array.isArray(list) && list.length > 0) {
      const transformed = list.map(transformVideo).filter((v) => v.id && v.title).slice(0, limit);
      setClientCache(cacheKey, transformed);
      return transformed;
    }
  } catch {}

  return [];
}

export async function getChannelVideosBatchClient(
  channelIds: string[],
  limit: number = 30
): Promise<Record<string, VideoData[]>> {
  if (channelIds.length === 0) return {};
  const result: Record<string, VideoData[]> = {};
  await Promise.allSettled(
    channelIds.map(async (cid) => {
      const vids = await getChannelVideosClient(cid, limit);
      if (vids.length > 0) result[cid] = vids;
    })
  );
  return result;
}

// Get video stats map
export async function getVideoStatsClient(videoIds: string[]): Promise<Record<string, { view_count?: number; viewCount?: string; upload_date?: string }>> {
  if (!videoIds || videoIds.length === 0) return {};
  const result: Record<string, { view_count?: number; viewCount?: string; upload_date?: string }> = {};
  return result;
}

// Subscriptions feed from Invidious
export async function getSubscriptionsFeedClient(): Promise<VideoData[]> {
  try {
    const feed = await invidious.getAuthFeed(1);
    if (Array.isArray(feed)) {
      return feed.map(transformVideo).filter((v) => v.id && v.title);
    }
  } catch {}
  return [];
}

// Fetch more videos for pagination
export async function fetchMoreVideosClient(
  currentCategory: string,
  regionLabel: string,
  page: number
): Promise<VideoData[]> {
  const q = `${currentCategory === 'All' ? 'trending popular videos' : currentCategory}`;
  return searchVideosClient(q, 20);
}
