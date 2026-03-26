// Client-side YouTube API Service
// Uses YouTube Data API v3 for metadata and search

const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  viewCount: string;
  likeCount: string;
  commentCount: string;
  duration: string;
  tags?: string[];
}

export interface YouTubeSearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  subscriberCount: string;
  videoCount: string;
  customUrl?: string;
}

export interface YouTubeComment {
  id: string;
  text: string;
  author: string;
  authorProfileImage: string;
  publishedAt: string;
  likeCount: number;
  isReply: boolean;
  parentId?: string;
}

// Helper to format ISO 8601 duration to human readable
function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return isoDuration;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Format numbers with K, M suffixes
function formatNumber(num: string | number): string {
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n)) return '0';
  
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M';
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(0) + 'K';
  }
  return n.toString();
}

export class YouTubeAPI {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || YOUTUBE_API_KEY;
    if (!this.apiKey) {
      console.warn('YouTube API key not set. Set NEXT_PUBLIC_YOUTUBE_API_KEY in .env.local');
    }
  }

  private async fetch(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${YOUTUBE_API_BASE}${endpoint}`);
    url.searchParams.set('key', this.apiKey);
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Handle specific quota exceeded error
      if (response.status === 403 && errorData?.error?.reason === 'quotaExceeded') {
        throw new Error('YouTube API quota exceeded. Please try again later or request a quota increase.');
      }
      
      // Handle API key expired error
      if (response.status === 400 && errorData?.error?.reason === 'API_KEY_INVALID') {
        throw new Error('YouTube API key is invalid or expired. Please check your API key.');
      }
      
      throw new Error(`YouTube API error: ${response.status} ${response.statusText} ${JSON.stringify(errorData)}`);
    }
    
    return response.json();
  }

  // Search for videos
  async searchVideos(query: string, maxResults: number = 20): Promise<YouTubeSearchResult[]> {
    const data = await this.fetch('/search', {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: maxResults.toString(),
      order: 'relevance',
    });

    return data.items?.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg`,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
    })) || [];
  }

  // Get video details
  async getVideoDetails(videoId: string): Promise<YouTubeVideo | null> {
    const data = await this.fetch('/videos', {
      part: 'snippet,statistics,contentDetails',
      id: videoId,
    });

    const video = data.items?.[0];
    if (!video) return null;

    return {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      channelTitle: video.snippet.channelTitle,
      channelId: video.snippet.channelId,
      publishedAt: video.snippet.publishedAt,
      viewCount: formatNumber(video.statistics?.viewCount || '0'),
      likeCount: formatNumber(video.statistics?.likeCount || '0'),
      commentCount: formatNumber(video.statistics?.commentCount || '0'),
      duration: formatDuration(video.contentDetails?.duration || ''),
      tags: video.snippet.tags,
    };
  }

  // Get multiple video details
  async getVideosDetails(videoIds: string[]): Promise<YouTubeVideo[]> {
    if (videoIds.length === 0) return [];
    
    // API allows max 50 IDs per request
    const batchSize = 50;
    const results: YouTubeVideo[] = [];
    
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize).join(',');
      const data = await this.fetch('/videos', {
        part: 'snippet,statistics,contentDetails',
        id: batch,
      });

      const videos = data.items?.map((video: any) => ({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
        channelTitle: video.snippet.channelTitle,
        channelId: video.snippet.channelId,
        publishedAt: video.snippet.publishedAt,
        viewCount: formatNumber(video.statistics?.viewCount || '0'),
        likeCount: formatNumber(video.statistics?.likeCount || '0'),
        commentCount: formatNumber(video.statistics?.commentCount || '0'),
        duration: formatDuration(video.contentDetails?.duration || ''),
        tags: video.snippet.tags,
      })) || [];
      
      results.push(...videos);
    }
    
    return results;
  }

  // Get channel details
  async getChannelDetails(channelId: string): Promise<YouTubeChannel | null> {
    const data = await this.fetch('/channels', {
      part: 'snippet,statistics',
      id: channelId,
    });

    const channel = data.items?.[0];
    if (!channel) return null;

    return {
      id: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnail: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
      subscriberCount: formatNumber(channel.statistics?.subscriberCount || '0'),
      videoCount: formatNumber(channel.statistics?.videoCount || '0'),
      customUrl: channel.snippet.customUrl,
    };
  }

  // Get channel videos
  async getChannelVideos(channelId: string, maxResults: number = 30): Promise<YouTubeSearchResult[]> {
    // First get uploads playlist ID
    const channelData = await this.fetch('/channels', {
      part: 'contentDetails',
      id: channelId,
    });

    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return [];

    // Then get videos from that playlist
    const playlistData = await this.fetch('/playlistItems', {
      part: 'snippet',
      playlistId: uploadsPlaylistId,
      maxResults: maxResults.toString(),
    });

    return playlistData.items?.map((item: any) => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
    })) || [];
  }

  // Get comments for a video
  async getComments(videoId: string, maxResults: number = 20): Promise<YouTubeComment[]> {
    try {
      const data = await this.fetch('/commentThreads', {
        part: 'snippet,replies',
        videoId: videoId,
        maxResults: maxResults.toString(),
        order: 'relevance',
        textFormat: 'plainText',
      });

      return data.items?.map((item: any) => ({
        id: item.id,
        text: item.snippet.topLevelComment.snippet.textDisplay,
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        authorProfileImage: item.snippet.topLevelComment.snippet.authorProfileImageUrl,
        publishedAt: item.snippet.topLevelComment.snippet.publishedAt,
        likeCount: item.snippet.topLevelComment.snippet.likeCount || 0,
        isReply: false,
      })) || [];
    } catch (error) {
      // Comments might be disabled
      console.warn('Failed to fetch comments:', error);
      return [];
    }
  }

  // Get trending videos
  async getTrendingVideos(regionCode: string = 'US', maxResults: number = 20): Promise<YouTubeVideo[]> {
    const data = await this.fetch('/videos', {
      part: 'snippet,statistics,contentDetails',
      chart: 'mostPopular',
      regionCode: regionCode,
      maxResults: maxResults.toString(),
    });

    return data.items?.map((video: any) => ({
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      channelTitle: video.snippet.channelTitle,
      channelId: video.snippet.channelId,
      publishedAt: video.snippet.publishedAt,
      viewCount: formatNumber(video.statistics?.viewCount || '0'),
      likeCount: formatNumber(video.statistics?.likeCount || '0'),
      commentCount: formatNumber(video.statistics?.commentCount || '0'),
      duration: formatDuration(video.contentDetails?.duration || ''),
      tags: video.snippet.tags,
    })) || [];
  }

  // Get related videos (using search with related query)
  async getRelatedVideos(videoId: string, maxResults: number = 10): Promise<YouTubeSearchResult[]> {
    // First get video details to get title for related search
    const videoDetails = await this.getVideoDetails(videoId);
    if (!videoDetails) return [];

    // Use related query based on video title and channel
    const query = `${videoDetails.channelTitle} ${videoDetails.title.split(' ').slice(0, 5).join(' ')}`;
    
    return this.searchVideos(query, maxResults);
  }

  // Get suggestions for search
  async getSuggestions(query: string): Promise<string[]> {
    // YouTube doesn't have a suggestions API, so we'll return empty array
    // Could implement with autocomplete API if available
    return [];
  }
}

// Export singleton instance
export const youtubeAPI = new YouTubeAPI();