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
    'All': 'trending videos 2025',
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
    { id: 'trending', title: 'Trending Now', query: 'trending videos 2025' },
    { id: 'music', title: 'Music Hits', query: 'music hits 2025' },
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

// Thumbnails are routed through the backend image proxy (/api/proxy) so they
// keep loading even when the browser cannot reach i.ytimg.com directly
// (ad blockers, DNS/referrer filters). The proxy fetches server-side and the
// browser caches the response for 24h.
const THUMB_SIZES = ['hqdefault', 'mqdefault', 'default'] as const;
export type ThumbSize = typeof THUMB_SIZES[number];

export function proxiedThumb(id: string, size: ThumbSize = 'hqdefault'): string {
    return `/api/proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/${size}.jpg`)}`;
}

export function proxiedImageUrl(raw: string | undefined | null): string {
    if (!raw) return '';
    return `/api/proxy?url=${encodeURIComponent(raw)}`;
}
