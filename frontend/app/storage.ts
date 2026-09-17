'use client';

// Local storage keys
const HISTORY_KEY = 'kvtube_history';
const SUBSCRIPTIONS_KEY = 'kvtube_subscriptions';
const SAVED_VIDEOS_KEY = 'kvtube_saved_videos';
const LIKED_VIDEOS_KEY = 'kvtube_liked_videos';
const DOWNLOADS_KEY = 'kvtube_downloads';
const PLAYLISTS_KEY = 'kvtube_local_playlists';
const NOTIFICATIONS_CACHE_KEY = 'kvtube_notifications_cache_v2';
const NOTIFICATIONS_LAST_SEEN_KEY = 'kvtube_notifications_last_seen';
const NOTIFICATIONS_READ_IDS_KEY = 'kvtube_notifications_read_ids';

export interface AppNotification {
  id: string;
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  channelAvatar?: string;
  thumbnail: string;
  published: number;
  publishedText: string;
}

export interface CachedNotificationsData {
  timestamp: number;
  notifications: AppNotification[];
}

export interface HistoryItem {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId?: string;
  channelAvatar?: string;
  duration?: string;
  viewCount?: number;
  uploadDate?: string;
  watchedAt: number;
}

export interface Subscription {
  channelId: string;
  channelName: string;
  channelAvatar: string;
  subscribedAt: number;
}

export interface SavedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId?: string;
  duration?: string;
  savedAt: number;
}

export interface LikedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId?: string;
  duration?: string;
  likedAt: number;
}

export interface DownloadItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  quality: string;
  type: 'video' | 'audio';
  container: string;
  timestamp: number;
}

export interface LocalPlaylistItem {
  videoId: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  duration?: string;
  addedAt: number;
}

export interface LocalPlaylist {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  videos: LocalPlaylistItem[];
}

// Get items from localStorage
function getFromStorage<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Save items to localStorage
function saveToStorage<T>(key: string, items: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    console.error('Storage error:', e);
  }
}

// ==================== HISTORY ====================

export function getHistory(limit: number = 100): HistoryItem[] {
  const history = getFromStorage<HistoryItem>(HISTORY_KEY);
  // Sort by most recent first
  return history.sort((a, b) => b.watchedAt - a.watchedAt).slice(0, limit);
}

export function addToHistory(video: {
  videoId: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  channelId?: string;
  channelAvatar?: string;
  duration?: string;
  viewCount?: number;
  uploadDate?: string;
}): void {
  const history = getFromStorage<HistoryItem>(HISTORY_KEY);

  // Remove duplicate if exists
  const filtered = history.filter((h) => h.videoId !== video.videoId);

  // Add new entry at the beginning
  const newItem: HistoryItem = {
    videoId: video.videoId,
    title: video.title || 'Untitled Video',
    thumbnail: video.thumbnail || `https://i.ytimg.com/vi_webp/${video.videoId}/hqdefault.webp`,
    channelTitle: video.channelTitle || 'Creator',
    channelId: video.channelId || '',
    channelAvatar: video.channelAvatar || '',
    duration: video.duration || '',
    viewCount: video.viewCount ?? 0,
    uploadDate: video.uploadDate || '',
    watchedAt: Date.now(),
  };

  // Keep only last 150 items
  const updated = [newItem, ...filtered].slice(0, 150);
  saveToStorage(HISTORY_KEY, updated);
}

export function removeFromHistory(videoId: string): void {
  const history = getFromStorage<HistoryItem>(HISTORY_KEY);
  const filtered = history.filter(h => h.videoId !== videoId);
  saveToStorage(HISTORY_KEY, filtered);
}

export function clearHistory(): void {
  saveToStorage(HISTORY_KEY, []);
}

// ==================== SUBSCRIPTIONS ====================

export function getSubscriptions(): Subscription[] {
  return getFromStorage<Subscription>(SUBSCRIPTIONS_KEY)
    .sort((a, b) => b.subscribedAt - a.subscribedAt);
}

export function subscribe(channel: { channelId: string; channelName: string; channelAvatar?: string }): void {
  const subs = getFromStorage<Subscription>(SUBSCRIPTIONS_KEY);
  
  // Check if already subscribed
  if (subs.some(s => s.channelId === channel.channelId)) return;
  
  const newSub: Subscription = {
    channelId: channel.channelId,
    channelName: channel.channelName,
    channelAvatar: channel.channelAvatar || '',
    subscribedAt: Date.now(),
  };
  
  saveToStorage(SUBSCRIPTIONS_KEY, [...subs, newSub]);
}

export function unsubscribe(channelId: string): void {
  const subs = getFromStorage<Subscription>(SUBSCRIPTIONS_KEY);
  const filtered = subs.filter(s => s.channelId !== channelId);
  saveToStorage(SUBSCRIPTIONS_KEY, filtered);
}

export function isSubscribed(channelId: string): boolean {
  const subs = getFromStorage<Subscription>(SUBSCRIPTIONS_KEY);
  return subs.some(s => s.channelId === channelId);
}

export function toggleSubscription(channel: { channelId: string; channelName: string; channelAvatar?: string }): boolean {
  if (isSubscribed(channel.channelId)) {
    unsubscribe(channel.channelId);
    return false;
  } else {
    subscribe(channel);
    return true;
  }
}

// ==================== SAVED VIDEOS (WATCH LATER) ====================

export function getSavedVideos(limit: number = 100): SavedVideo[] {
  const saved = getFromStorage<SavedVideo>(SAVED_VIDEOS_KEY);
  return saved.sort((a, b) => b.savedAt - a.savedAt).slice(0, limit);
}

export function saveVideo(video: {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
}): void {
  const saved = getFromStorage<SavedVideo>(SAVED_VIDEOS_KEY);
  const filtered = saved.filter(v => v.videoId !== video.videoId);

  const newVideo: SavedVideo = {
    videoId: video.videoId,
    title: video.title || 'Untitled Video',
    thumbnail: video.thumbnail || `https://i.ytimg.com/vi_webp/${video.videoId}/hqdefault.webp`,
    channelTitle: video.channelTitle || 'Creator',
    channelId: video.channelId || '',
    duration: video.duration || '',
    savedAt: Date.now(),
  };

  const updated = [newVideo, ...filtered].slice(0, 200);
  saveToStorage(SAVED_VIDEOS_KEY, updated);
}

export function unsaveVideo(videoId: string): void {
  const saved = getFromStorage<SavedVideo>(SAVED_VIDEOS_KEY);
  const filtered = saved.filter(v => v.videoId !== videoId);
  saveToStorage(SAVED_VIDEOS_KEY, filtered);
}

export function isVideoSaved(videoId: string): boolean {
  const saved = getFromStorage<SavedVideo>(SAVED_VIDEOS_KEY);
  return saved.some(v => v.videoId === videoId);
}

export function toggleSaveVideo(video: {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
}): boolean {
  if (isVideoSaved(video.videoId)) {
    unsaveVideo(video.videoId);
    return false;
  } else {
    saveVideo(video);
    return true;
  }
}

export function clearSavedVideos(): void {
  saveToStorage(SAVED_VIDEOS_KEY, []);
}

// ==================== LIKED VIDEOS ====================

export function getLikedVideos(limit: number = 100): LikedVideo[] {
  const liked = getFromStorage<LikedVideo>(LIKED_VIDEOS_KEY);
  return liked.sort((a, b) => b.likedAt - a.likedAt).slice(0, limit);
}

export function likeVideo(video: {
  videoId: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
}): void {
  const liked = getFromStorage<LikedVideo>(LIKED_VIDEOS_KEY);
  const filtered = liked.filter(v => v.videoId !== video.videoId);

  const newLiked: LikedVideo = {
    videoId: video.videoId,
    title: video.title || 'Untitled Video',
    thumbnail: video.thumbnail || `https://i.ytimg.com/vi_webp/${video.videoId}/hqdefault.webp`,
    channelTitle: video.channelTitle || 'Creator',
    channelId: video.channelId || '',
    duration: video.duration || '',
    likedAt: Date.now(),
  };

  const updated = [newLiked, ...filtered].slice(0, 200);
  saveToStorage(LIKED_VIDEOS_KEY, updated);
}

export function unlikeVideo(videoId: string): void {
  const liked = getFromStorage<LikedVideo>(LIKED_VIDEOS_KEY);
  const filtered = liked.filter(v => v.videoId !== videoId);
  saveToStorage(LIKED_VIDEOS_KEY, filtered);
}

export function isVideoLiked(videoId: string): boolean {
  const liked = getFromStorage<LikedVideo>(LIKED_VIDEOS_KEY);
  return liked.some(v => v.videoId === videoId);
}

export function toggleLikeVideo(video: {
  videoId: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
}): boolean {
  if (isVideoLiked(video.videoId)) {
    unlikeVideo(video.videoId);
    return false;
  } else {
    likeVideo(video);
    return true;
  }
}

export function clearLikedVideos(): void {
  saveToStorage(LIKED_VIDEOS_KEY, []);
}

// ==================== DOWNLOADS ====================

export function getDownloads(limit: number = 100): DownloadItem[] {
  const downloads = getFromStorage<DownloadItem>(DOWNLOADS_KEY);
  return downloads.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function addDownload(item: {
  videoId: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  quality: string;
  type: 'video' | 'audio';
  container: string;
}): void {
  const downloads = getFromStorage<DownloadItem>(DOWNLOADS_KEY);
  const filtered = downloads.filter(d => d.videoId !== item.videoId || d.quality !== item.quality);

  const newDownload: DownloadItem = {
    id: `${item.videoId}-${Date.now()}`,
    videoId: item.videoId,
    title: item.title || 'Untitled Video',
    thumbnail: item.thumbnail || `https://i.ytimg.com/vi_webp/${item.videoId}/hqdefault.webp`,
    channelTitle: item.channelTitle || 'Creator',
    quality: item.quality,
    type: item.type,
    container: item.container,
    timestamp: Date.now(),
  };

  const updated = [newDownload, ...filtered].slice(0, 100);
  saveToStorage(DOWNLOADS_KEY, updated);
}

export function removeDownload(id: string): void {
  const downloads = getFromStorage<DownloadItem>(DOWNLOADS_KEY);
  const filtered = downloads.filter(d => d.id !== id && d.videoId !== id);
  saveToStorage(DOWNLOADS_KEY, filtered);
}

export function clearDownloads(): void {
  saveToStorage(DOWNLOADS_KEY, []);
}

// ==================== LOCAL PLAYLISTS ====================

export function getLocalPlaylists(): LocalPlaylist[] {
  const playlists = getFromStorage<LocalPlaylist>(PLAYLISTS_KEY);
  return playlists.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLocalPlaylist(id: string): LocalPlaylist | null {
  const playlists = getFromStorage<LocalPlaylist>(PLAYLISTS_KEY);
  return playlists.find(p => p.id === id) || null;
}

export function createLocalPlaylist(title: string, description?: string): LocalPlaylist {
  const playlists = getFromStorage<LocalPlaylist>(PLAYLISTS_KEY);
  const newPl: LocalPlaylist = {
    id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: title.trim() || 'New Playlist',
    description: description?.trim() || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    videos: [],
  };
  saveToStorage(PLAYLISTS_KEY, [newPl, ...playlists]);
  return newPl;
}

export function deleteLocalPlaylist(id: string): void {
  const playlists = getFromStorage<LocalPlaylist>(PLAYLISTS_KEY);
  const filtered = playlists.filter(p => p.id !== id);
  saveToStorage(PLAYLISTS_KEY, filtered);
}

export function addVideoToLocalPlaylist(
  playlistId: string,
  video: { videoId: string; title: string; thumbnail?: string; channelTitle?: string; duration?: string }
): boolean {
  const playlists = getFromStorage<LocalPlaylist>(PLAYLISTS_KEY);
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return false;

  const pl = playlists[idx];
  if (pl.videos.some(v => v.videoId === video.videoId)) return false;

  const updatedItem: LocalPlaylistItem = {
    videoId: video.videoId,
    title: video.title || 'Untitled Video',
    thumbnail: video.thumbnail || `https://i.ytimg.com/vi_webp/${video.videoId}/hqdefault.webp`,
    channelTitle: video.channelTitle || 'Creator',
    duration: video.duration || '',
    addedAt: Date.now(),
  };

  playlists[idx] = {
    ...pl,
    updatedAt: Date.now(),
    videos: [updatedItem, ...pl.videos],
  };
  saveToStorage(PLAYLISTS_KEY, playlists);
  return true;
}

export function removeVideoFromLocalPlaylist(playlistId: string, videoId: string): boolean {
  const playlists = getFromStorage<LocalPlaylist>(PLAYLISTS_KEY);
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return false;

  const pl = playlists[idx];
  playlists[idx] = {
    ...pl,
    updatedAt: Date.now(),
    videos: pl.videos.filter(v => v.videoId !== videoId),
  };
  saveToStorage(PLAYLISTS_KEY, playlists);
  return true;
}

// Notification helpers
export function getNotificationLastSeen(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return Number(localStorage.getItem(NOTIFICATIONS_LAST_SEEN_KEY) || '0');
  } catch {
    return 0;
  }
}

export function setNotificationLastSeen(ts: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIFICATIONS_LAST_SEEN_KEY, String(ts));
  } catch {}
}

export function getReadNotificationIds(): string[] {
  return getFromStorage<string>(NOTIFICATIONS_READ_IDS_KEY);
}

export function markNotificationAsRead(videoId: string): void {
  const readIds = getReadNotificationIds();
  if (!readIds.includes(videoId)) {
    saveToStorage(NOTIFICATIONS_READ_IDS_KEY, [...readIds, videoId]);
  }
}

export function markAllNotificationsAsRead(videoIds: string[]): void {
  const readIds = new Set(getReadNotificationIds());
  videoIds.forEach(id => readIds.add(id));
  saveToStorage(NOTIFICATIONS_READ_IDS_KEY, Array.from(readIds));
  setNotificationLastSeen(Date.now());
}

export function getCachedNotifications(): CachedNotificationsData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedNotifications(notifications: AppNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedNotificationsData = {
      timestamp: Date.now(),
      notifications,
    };
    localStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

