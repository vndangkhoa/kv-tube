'use client';

import { VideoData } from './constants';

// Relative API base - Next.js rewrites proxy to Go backend
const API_BASE = '/api';

// Client-side Caching Engine (Offloads ~90% of repeat requests from the server)
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
  } catch (e) {
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
  } catch (e) {
    try { sessionStorage.clear(); } catch (_) {}
  }
}

// Search videos using client cache + backend API
export async function searchVideosClient(query: string, limit: number = 20): Promise<VideoData[]> {
  if (!query) return [];
  const cacheKey = `srch_${query}_${limit}`;
  const cached = getClientCache<VideoData[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      signal: AbortSignal.timeout(8000),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const transformed = data.map(transformVideo).filter((v: VideoData) => v.id && v.title);
        setClientCache(cacheKey, transformed);
        return transformed;
      }
    }
  } catch (error) {
    console.warn('Backend search failed:', error);
  }

  return [];
}
function transformVideo(item: any): VideoData {
  return {
    id: item.id || item.videoId || '',
    title: item.title || 'Untitled',
    thumbnail: item.thumbnail || item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id || item.videoId}/hqdefault.jpg`,
    channelTitle: item.uploader || item.author || item.channelTitle || 'Unknown',
    channelId: item.channel_id || item.channelId || item.authorId || '',
    viewCount: formatViews(item.view_count || item.viewCount || 0),
    publishedAt: formatRelativeTime(item.upload_date || item.publishedText || item.uploaded),
    duration: item.duration || item.lengthSeconds ? `${Math.floor(item.lengthSeconds / 60)}:${item.lengthSeconds % 60}` : '',
    description: item.description || '',
    uploader: item.uploader || item.author,
    uploader_id: item.uploader_id || item.authorId,
    channel_id: item.channel_id || item.authorId,
    view_count: item.view_count || item.viewCount || 0,
    upload_date: item.upload_date,
  };
}

function formatViews(views: number): string {
  if (!views) return '0';
  if (views >= 1000000000) return (views / 1000000000).toFixed(1) + 'B';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
  if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
  return views.toString();
}

export function formatRelativeTime(input: any): string {
  if (!input) return '';
  if (typeof input === 'string' && input.includes('ago')) return input;
  
  let date: Date;
  if (typeof input === 'string' && /^\d{8}$/.test(input)) {
    const year = parseInt(input.slice(0, 4));
    const month = parseInt(input.slice(4, 6)) - 1;
    const day = parseInt(input.slice(6, 8));
    date = new Date(year, month, day);
  } else {
    date = new Date(input);
  }
  
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

// Resolve real upload dates for a batch of video IDs
export async function getVideoDatesClient(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const cacheKey = `dates_${ids.sort().join('_')}`;
  const cached = getClientCache<Record<string, string>>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${API_BASE}/videos/dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return {};
    const data = await response.json();
    if (data && typeof data === 'object') {
      setClientCache(cacheKey, data);
      return data;
    }
    return {};
  } catch (error: any) {
    return {};
  }
}

// Resolve view counts for a batch of video IDs
export async function getVideoStatsClient(
  ids: string[]
): Promise<Record<string, { view_count: number; upload_date: string }>> {
  if (ids.length === 0) return {};
  const cacheKey = `stats_${ids.sort().join('_')}`;
  const cached = getClientCache<Record<string, { view_count: number; upload_date: string }>>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${API_BASE}/videos/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return {};
    const data = await response.json();
    if (data && typeof data === 'object') {
      setClientCache(cacheKey, data);
      return data;
    }
    return {};
  } catch (error: any) {
    return {};
  }
}

// Get video details using client cache + backend API
export async function getVideoDetailsClient(videoId: string): Promise<VideoData | null> {
  if (!videoId) return null;
  const cacheKey = `vdet_${videoId}`;
  const cached = getClientCache<VideoData>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${API_BASE}/video/${videoId}`, {
      signal: AbortSignal.timeout(8000),
    });
    
    if (response.ok) {
      const data = await response.json();
      const transformed = transformVideo(data);
      if (transformed.id) {
        setClientCache(cacheKey, transformed);
        return transformed;
      }
    }
  } catch (error) {
    console.warn('Backend video details failed:', error);
  }

  return null;
}

// Get related videos using client cache + backend API
export async function getRelatedVideosClient(videoId: string, limit: number = 15): Promise<VideoData[]> {
  if (!videoId) return [];
  const cacheKey = `rel_${videoId}_${limit}`;
  const cached = getClientCache<VideoData[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const response = await fetch(`${API_BASE}/video/${videoId}/related?limit=${limit}`, {
      signal: AbortSignal.timeout(8000),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const transformed = data.map(transformVideo).filter((v: VideoData) => v.id && v.title).slice(0, limit);
        setClientCache(cacheKey, transformed);
        return transformed;
      }
    }
  } catch (error) {
    console.warn('Get related videos failed:', error);
  }

  return [];
}

// Get trending videos using client cache + region query
export async function getTrendingVideosClient(regionCode: string = 'US', limit: number = 20): Promise<VideoData[]> {
  const cacheKey = `trnd_${regionCode}_${limit}`;
  const cached = getClientCache<VideoData[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  const regionNames: Record<string, string> = {
    'VN': 'Vietnam',
    'US': 'United States',
    'JP': 'Japan',
    'KR': 'South Korea',
    'IN': 'India',
    'GB': 'United Kingdom',
    'DE': 'Germany',
    'FR': 'France',
    'BR': 'Brazil',
    'MX': 'Mexico',
    'CA': 'Canada',
    'AU': 'Australia',
    'GLOBAL': '',
  };
  
  const regionName = regionNames[regionCode] || '';
  const searchQuery = regionName 
    ? `trending ${regionName} 2026` 
    : 'trending videos 2026';
  
  const results = await searchVideosClient(searchQuery, limit);
  if (results.length > 0) {
    setClientCache(cacheKey, results);
  }
  return results;
}

// Get comments using client cache + backend API
export async function getCommentsClient(videoId: string, limit: number = 20): Promise<any[]> {
  if (!videoId) return [];
  const cacheKey = `cmts_${videoId}_${limit}`;
  const cached = getClientCache<any[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const response = await fetch(`${API_BASE}/video/${videoId}/comments?limit=${limit}`, {
      signal: AbortSignal.timeout(8000),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const transformed = data.map((c: any) => ({
          id: c.id,
          text: c.text || c.content,
          author: c.author,
          authorId: c.author_id,
          authorThumbnail: c.author_thumbnail,
          likes: c.likes || 0,
          published: c.timestamp || 'recently',
          isReply: c.is_reply || false,
        }));
        setClientCache(cacheKey, transformed);
        return transformed;
      }
    }
  } catch (error) {
    console.warn('Get comments failed:', error);
  }

  return [];
}

// Get channel info using client cache + backend API
export async function getChannelInfoClient(channelId: string): Promise<any | null> {
  if (!channelId) return null;
  const cacheKey = `chinfo_${channelId}`;
  const cached = getClientCache<any>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${API_BASE}/channel/info?id=${channelId}`, {
      signal: AbortSignal.timeout(8000),
    });
    
    if (response.ok) {
      const data = await response.json();
      const transformed = {
        id: data.id || channelId,
        title: data.title || 'Unknown Channel',
        avatar: data.avatar || '',
        banner: data.banner || '',
        subscriberCount: data.subscriber_count || 0,
        description: data.description || '',
      };
      setClientCache(cacheKey, transformed);
      return transformed;
    }
  } catch (error: any) {
    console.warn('Get channel info failed:', error);
  }

  return null;
}

// Get channel videos using client cache + backend API
export async function getChannelVideosClient(channelId: string, limit: number = 30): Promise<VideoData[]> {
  if (!channelId) return [];
  const cacheKey = `chvids_${channelId}_${limit}`;
  const cached = getClientCache<VideoData[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const response = await fetch(`${API_BASE}/channel/videos?id=${channelId}&limit=${limit}`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const transformed = data.map(transformVideo).filter((v: VideoData) => v.id && v.title);
        setClientCache(cacheKey, transformed);
        return transformed;
      }
    }
  } catch (error: any) {
    console.warn('Get channel videos failed:', error);
  }

  return [];
}

export async function getChannelVideosBatchClient(
  channelIds: string[],
  limit: number = 30
): Promise<Record<string, VideoData[]>> {
  if (channelIds.length === 0) return {};
  try {
    const response = await fetch(`${API_BASE}/channels/videos-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_ids: channelIds, limit }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) return {};

    const data = await response.json();
    if (!data || typeof data !== 'object') return {};

    const result: Record<string, VideoData[]> = {};
    for (const [channelId, videos] of Object.entries(data)) {
      if (Array.isArray(videos)) {
        result[channelId] = videos
          .map(transformVideo)
          .filter((v: VideoData) => v.id && v.title);
      }
    }
    return result;
  } catch (error: any) {
    return {};
  }
}

// Fetch a mixed feed of the latest videos across recently subscribed channels.
export async function getSubscriptionsFeedClient(
  offset: number = 0,
  channels: number = 20,
  perChannel: number = 5
): Promise<VideoData[]> {
  try {
    const response = await fetch(
      `${API_BASE}/subscriptions/feed?offset=${offset}&channels=${channels}&per_channel=${perChannel}`,
      { cache: 'no-store', signal: AbortSignal.timeout(60000) }
    );
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.map(transformVideo).filter((v: VideoData) => v.id && v.title);
  } catch (error: any) {
    return [];
  }
}

// Fetch more videos for pagination
export async function fetchMoreVideosClient(
  currentCategory: string,
  regionLabel: string,
  page: number,
  contextVideoId?: string
): Promise<VideoData[]> {
  const modifiers = ['', 'more', 'new', 'update', 'latest', 'part 2'];
  const modifier = page < modifiers.length ? modifiers[page] : `page ${page}`;
  
  let searchQuery = '';
  
  switch (currentCategory) {
    case 'All':
    case 'Trending':
      searchQuery = `trending ${modifier}`;
      break;
    case 'Music':
      searchQuery = `music ${modifier}`;
      break;
    case 'Gaming':
      searchQuery = `gaming ${modifier}`;
      break;
    case 'News':
      searchQuery = `news ${modifier}`;
      break;
    default:
      searchQuery = `${currentCategory.toLowerCase()} ${modifier}`;
  }
  
  if (regionLabel && regionLabel !== 'Global') {
    searchQuery = `${regionLabel} ${searchQuery}`;
  }
  
  return searchVideosClient(searchQuery, 20);
}
