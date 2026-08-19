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

const THUMB_SIZES = ['hqdefault', 'mqdefault', 'default'] as const;
export type ThumbSize = typeof THUMB_SIZES[number];

/**
 * Returns direct, high-speed YouTube / Invidious CDN thumbnail URL
 */
export function proxiedThumb(id: string, size: ThumbSize = 'hqdefault'): string {
    if (!id) return '';
    return `https://i.ytimg.com/vi/${id}/${size}.jpg`;
}

/**
 * Normalizes any image URL (handles relative URLs, WebP, Invidious thumbnails)
 */
export function proxiedImageUrl(raw: string | undefined | null): string {
    if (!raw) return '';
    if (raw.startsWith('//')) return `https:${raw}`;
    return raw;
}
