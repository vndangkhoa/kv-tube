export interface VideoData {
    id: string;
    title: string;
    uploader: string;
    thumbnail: string;
    view_count: number;
    duration: string;
    avatar_url?: string;
}

export const CATEGORY_MAP: Record<string, string> = {
    'All': 'trending videos',
    'Watched': 'watched history',
    'Suggested': 'suggested videos',
    'Tech': 'latest smart technology gadgets reviews',
    'Music': 'music hits',
    'Movies': 'movie trailers',
    'News': 'latest news',
    'Trending': 'trending videos',
    'Podcasts': 'popular podcasts',
    'Live': 'live stream',
    'Gaming': 'gaming trending',
    'Sports': 'sports highlights'
};

export const ALL_CATEGORY_SECTIONS = [
    { id: 'trending', title: 'Trending Now', query: 'trending videos' },
    { id: 'music', title: 'Music Hits', query: 'music hits' },
    { id: 'tech', title: 'Tech & Gadgets', query: 'latest smart technology gadgets reviews' },
    { id: 'gaming', title: 'Gaming', query: 'gaming trending' },
    { id: 'sports', title: 'Sports Highlights', query: 'sports highlights' },
    { id: 'news', title: 'Latest News', query: 'latest news' },
];

export function addRegion(query: string, regionLabel: string): string {
    if (!regionLabel) return query;
    return `${query} ${regionLabel}`;
}

const RANDOM_MODIFIERS = ['viral', 'popular', 'new', 'best', 'top', 'hot', 'fresh', 'amazing', 'awesome', 'cool'];

export function getRandomModifier(): string {
    return RANDOM_MODIFIERS[Math.floor(Math.random() * RANDOM_MODIFIERS.length)];
}

const THUMB_SIZES = ['hq720', 'hqdefault', 'mqdefault', 'default', 'maxresdefault'] as const;
export type ThumbSize = typeof THUMB_SIZES[number];

/**
 * Returns optimal YouTube CDN thumbnail URL with fallback cascade stages.
 * Stage 0: hq720 WebP (1280x720 HD, ~28KB)
 * Stage 1: hqdefault WebP (480x360 WebP, ~10KB, 100% available)
 * Stage 2: hqdefault JPG (480x360 legacy JPG fallback)
 * Stage 3: mqdefault JPG (320x180 legacy JPG fallback)
 * Stage 4: Proxied via backend
 */
export function getThumbnailCascade(id: string, stage: number = 0): string {
    if (!id) return '';
    switch (stage) {
        case 0:
            return `https://i.ytimg.com/vi_webp/${id}/hq720.webp`;
        case 1:
            return `https://i.ytimg.com/vi_webp/${id}/hqdefault.webp`;
        case 2:
            return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        case 3:
            return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
        case 4:
            return `/api/proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}`;
        default:
            return '';
    }
}

/**
 * Returns direct, high-speed YouTube / Invidious CDN thumbnail URL (defaults to lightweight WebP)
 */
export function proxiedThumb(id: string, size: ThumbSize = 'hqdefault', format: 'webp' | 'jpg' = 'webp'): string {
    if (!id) return '';
    if (format === 'webp') {
        return `https://i.ytimg.com/vi_webp/${id}/${size}.webp`;
    }
    return `https://i.ytimg.com/vi/${id}/${size}.jpg`;
}

/**
 * Normalizes any image URL (handles relative URLs, WebP, Invidious thumbnails).
 * Automatically redirects Invidious-hosted or fragile /vi/ thumbnail URLs
 * directly to YouTube CDN (WebP), bypassing ORB and 502/404 errors.
 */
export function proxiedImageUrl(raw: string | undefined | null, videoId?: string): string {
    if (!raw && !videoId) return '';
    if (!raw && videoId) return `https://i.ytimg.com/vi_webp/${videoId}/hq720.webp`;
    let url = raw!.trim();
    if (url.startsWith('//')) url = `https:${url}`;

    // Extract video ID from any /vi/ or /vi_webp/ path
    const viMatch = url.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})/);
    const resolvedId = viMatch ? viMatch[1] : videoId;

    if (resolvedId) {
        // If served by an Invidious instance (e.g. yt.khoavo.myds.me, localhost, relative path)
        // or requesting maxres.jpg (which frequently 404s on non-HD/shorts), rewrite to YouTube's edge CDN
        const isInvidiousHost = !url.includes('i.ytimg.com') && (url.includes('/vi/') || !url.startsWith('http'));
        const isMaxres = url.includes('maxres');

        if (isInvidiousHost || isMaxres) {
            return `https://i.ytimg.com/vi_webp/${resolvedId}/hq720.webp`;
        }
    }

    return url;
}

/**
 * Formats relative time from publishedText or numeric timestamp.
 * Sanitizes any raw Arabic RTL text that Invidious might return.
 */
export function formatRelativeTime(
    publishedText?: string | null,
    publishedSec?: number | null,
    locale: string = 'vi'
): string {
    if (typeof publishedSec === 'number' && publishedSec > 0) {
        const diff = Math.max(0, Math.floor(Date.now() / 1000) - publishedSec);
        const isVi = locale.toLowerCase().includes('vi') || locale.toUpperCase() === 'VN';
        if (diff < 60) return isVi ? 'Vừa xong' : 'Just now';
        if (diff < 3600) {
            const m = Math.floor(diff / 60);
            return isVi ? `${m} phút trước` : `${m} minute${m > 1 ? 's' : ''} ago`;
        }
        if (diff < 86400) {
            const h = Math.floor(diff / 3600);
            return isVi ? `${h} giờ trước` : `${h} hour${h > 1 ? 's' : ''} ago`;
        }
        if (diff < 7 * 86400) {
            const d = Math.floor(diff / 86400);
            return isVi ? `${d} ngày trước` : `${d} day${d > 1 ? 's' : ''} ago`;
        }
        if (diff < 30 * 86400) {
            const w = Math.floor(diff / (7 * 86400));
            return isVi ? `${w} tuần trước` : `${w} week${w > 1 ? 's' : ''} ago`;
        }
        if (diff < 365 * 86400) {
            const mo = Math.floor(diff / (30 * 86400));
            return isVi ? `${mo} tháng trước` : `${mo} month${mo > 1 ? 's' : ''} ago`;
        }
        const y = Math.floor(diff / (365 * 86400));
        return isVi ? `${y} năm trước` : `${y} year${y > 1 ? 's' : ''} ago`;
    }

    if (publishedText && typeof publishedText === 'string') {
        if (!/[\u0600-\u06FF]/.test(publishedText)) {
            return publishedText;
        }
    }

    return '';
}

/**
 * Determines whether a video is a YouTube Short based on duration (<= 90s)
 * or explicit title/hashtag markers (#shorts, #short).
 */
export function isShortVideo(video: { lengthSeconds?: number; duration?: string; title?: string } | null | undefined): boolean {
    if (!video) return false;

    // Check duration in seconds
    if (typeof video.lengthSeconds === 'number' && video.lengthSeconds > 0) {
        if (video.lengthSeconds <= 90) return true;
    }

    // Check duration formatted string (e.g., "0:30", "0:59")
    if (typeof video.duration === 'string') {
        const parts = video.duration.trim().split(':').map(Number);
        if (parts.length === 2 && !parts.some(isNaN)) {
            const totalSec = parts[0] * 60 + parts[1];
            if (totalSec > 0 && totalSec <= 90) return true;
        }
    }

    // Check title markers
    const title = (video.title || '').toLowerCase();
    if (title.includes('#shorts') || title.includes('#short') || /\bshorts\b/i.test(title)) {
        return true;
    }

    return false;
}
