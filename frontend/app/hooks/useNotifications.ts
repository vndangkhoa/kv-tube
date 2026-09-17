'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppNotification,
  getCachedNotifications,
  saveCachedNotifications,
  getReadNotificationIds,
  markNotificationAsRead as storageMarkAsRead,
  markAllNotificationsAsRead as storageMarkAllAsRead,
  getNotificationLastSeen,
  setNotificationLastSeen,
  getSubscriptions,
} from '../storage';
import { invidious } from '../services/invidious';
import { formatRelativeTime, proxiedImageUrl } from '../utils';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SUBS_TO_POLL = 15;
const MAX_NOTIFICATIONS = 30;

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);

  // Helper to compute unread notifications count
  const computeUnread = useCallback(
    (notifs: AppNotification[], currentReadIds: Set<string>, lastSeen: number) => {
      const now = Date.now();
      const fortyEightHoursAgo = now - 48 * 60 * 60 * 1000;
      const effectiveLastSeen = lastSeen > 0 ? lastSeen : fortyEightHoursAgo;

      let count = 0;
      for (const n of notifs) {
        if (currentReadIds.has(n.id)) continue;
        const pubMs = n.published > 10000000000 ? n.published : n.published * 1000;
        if (pubMs > 0) {
          if (pubMs > effectiveLastSeen) {
            count++;
          }
        } else {
          // If no numeric timestamp available, count if not read
          count++;
        }
      }
      return count;
    },
    []
  );

  // Fetch notifications from Invidious account or Subscriptions
  const fetchNotifications = useCallback(
    async (force = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsLoading(true);

      try {
        const currentReadIds = new Set(getReadNotificationIds());
        setReadIds(currentReadIds);
        const lastSeen = getNotificationLastSeen();

        // Check cache first unless forced
        const cached = getCachedNotifications();
        if (!force && cached && cached.notifications.length > 0) {
          const isFresh = Date.now() - cached.timestamp < REFRESH_INTERVAL_MS;
          if (isFresh) {
            setNotifications(cached.notifications);
            setUnreadCount(computeUnread(cached.notifications, currentReadIds, lastSeen));
            setIsLoading(false);
            isFetchingRef.current = false;
            return;
          }
        }

        let freshNotifs: AppNotification[] = [];

        // 1. Try Invidious account notifications if user is authenticated
        const token = invidious.getToken();
        if (token) {
          try {
            const authNotifs = await invidious.getAuthNotifications();
            if (Array.isArray(authNotifs) && authNotifs.length > 0) {
              freshNotifs = authNotifs.map((item: any) => {
                const videoId = item.videoId || item.id || '';
                const pubSec = typeof item.published === 'number' ? item.published : 0;
                const channelId = item.authorId || item.channelId || '';
                const rawAvatar = item.authorThumbnails?.[0]?.url || item.authorThumbnail || '';
                const rawThumb = item.videoThumbnails?.[0]?.url || item.thumbnail;
                return {
                  id: videoId || item.notificationId || Math.random().toString(),
                  videoId,
                  title: item.title || 'New video',
                  channelTitle: item.author || item.channelName || 'Creator',
                  channelId,
                  channelAvatar:
                    rawAvatar ||
                    (channelId ? `/api/channel-avatar?id=${encodeURIComponent(channelId)}` : ''),
                  thumbnail:
                    proxiedImageUrl(rawThumb, videoId) ||
                    (videoId ? `https://i.ytimg.com/vi_webp/${videoId}/hqdefault.webp` : ''),
                  published: pubSec > 0 ? pubSec * 1000 : Date.now(),
                  publishedText: formatRelativeTime(item.publishedText, pubSec) || item.publishedText || '',
                };
              });
            }
          } catch (e) {
            console.warn('[Notifications] Auth notification fetch error:', e);
          }
        }

        // 2. If no auth notifications found, generate from local subscriptions
        if (freshNotifs.length === 0) {
          const subs = getSubscriptions();
          if (subs && subs.length > 0) {
            const targetSubs = subs.slice(0, MAX_SUBS_TO_POLL);
            const results = await Promise.allSettled(
              targetSubs.map(async (sub) => {
                try {
                  const res = await invidious.getChannelVideos(sub.channelId, undefined, 'newest');
                  const vids = Array.isArray(res) ? res : res?.videos || [];
                  return { sub, videos: vids.slice(0, 2) };
                } catch {
                  return { sub, videos: [] };
                }
              })
            );

            const rawList: AppNotification[] = [];
            results.forEach((r) => {
              if (r.status === 'fulfilled' && r.value.videos.length > 0) {
                const { sub, videos } = r.value;
                videos.forEach((v: any) => {
                  const vidId = v.videoId || v.id;
                  if (!vidId) return;
                  const pubSec = typeof v.published === 'number' ? v.published : 0;
                  const channelId = sub.channelId || v.authorId || '';
                  const rawAvatar = sub.channelAvatar || v.authorThumbnails?.[0]?.url || v.authorThumbnail || '';
                  const rawThumb = v.videoThumbnails?.[0]?.url || v.thumbnail;
                  rawList.push({
                    id: vidId,
                    videoId: vidId,
                    title: v.title || 'New video',
                    channelTitle: sub.channelName || v.author || 'Creator',
                    channelId,
                    channelAvatar:
                      rawAvatar ||
                      (channelId ? `/api/channel-avatar?id=${encodeURIComponent(channelId)}` : ''),
                    thumbnail:
                      proxiedImageUrl(rawThumb, vidId) ||
                      `https://i.ytimg.com/vi_webp/${vidId}/hqdefault.webp`,
                    published: pubSec > 0 ? pubSec * 1000 : 0,
                    publishedText:
                      formatRelativeTime(v.publishedText, pubSec) || v.publishedText || '',
                  });
                });
              }
            });

            // Sort descending: newest first
            rawList.sort((a, b) => b.published - a.published);
            freshNotifs = rawList.slice(0, MAX_NOTIFICATIONS);
          }
        }

        if (freshNotifs.length > 0) {
          saveCachedNotifications(freshNotifs);
          setNotifications(freshNotifs);
          setUnreadCount(computeUnread(freshNotifs, currentReadIds, lastSeen));
        } else if (cached && cached.notifications.length > 0) {
          setNotifications(cached.notifications);
          setUnreadCount(computeUnread(cached.notifications, currentReadIds, lastSeen));
        } else {
          setNotifications([]);
          setUnreadCount(0);
        }
      } catch (err) {
        console.error('[Notifications] Refresh failed:', err);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    },
    [computeUnread]
  );

  // Mark single notification as read
  const markAsRead = useCallback((videoId: string) => {
    storageMarkAsRead(videoId);
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(videoId);
      return next;
    });
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    const allIds = notifications.map((n) => n.id);
    storageMarkAllAsRead(allIds);
    setReadIds((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => next.add(id));
      return next;
    });
    setNotificationLastSeen(Date.now());
    setUnreadCount(0);
  }, [notifications]);

  // Initial load & polling
  useEffect(() => {
    // Immediate sync from cache
    const currentReadIds = new Set(getReadNotificationIds());
    setReadIds(currentReadIds);
    const lastSeen = getNotificationLastSeen();
    const cached = getCachedNotifications();
    if (cached && cached.notifications.length > 0) {
      setNotifications(cached.notifications);
      setUnreadCount(computeUnread(cached.notifications, currentReadIds, lastSeen));
    }

    // Fetch fresh data
    fetchNotifications();

    // Interval polling
    const interval = setInterval(() => {
      fetchNotifications(true);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchNotifications, computeUnread]);

  return {
    notifications,
    unreadCount,
    readIds,
    isLoading,
    markAsRead,
    markAllAsRead,
    refresh: () => fetchNotifications(true),
  };
}
