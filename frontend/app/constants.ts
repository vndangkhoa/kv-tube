export const API_BASE = ''; // No backend needed - using public APIs

export interface VideoData {
    id: string;
    title: string;
    thumbnail: string;
    channelTitle?: string;
    channelId?: string;
    viewCount?: string;
    publishedAt?: string;
    duration: string;
    description?: string;
    // Legacy fields for compatibility
    uploader?: string;
    uploader_id?: string;
    channel_id?: string;
    view_count?: number;
    upload_date?: string;
    avatar_url?: string;
    channelAvatar?: string;
    list_id?: string;
    is_mix?: boolean;
}

export const CATEGORY_MAP: Record<string, string> = {
    'All': 'trending popular videos',
    'Watched': 'watched history',
    'Suggested': 'top popular trending',
    'Music': 'official music video top hits',
    'Gaming': 'gaming gameplay walkthrough',
    'Movies': 'official movie trailer teaser',
    'News': 'daily news world news breaking',
    'Tech': 'technology gadgets smartphone review tech',
    'Coding': 'software programming web development tutorial',
    'Sports': 'sports match highlights top plays',
    'Podcasts': 'podcast full episode interview show',
    'Live': 'live stream 24/7',
    'Comedy': 'stand up comedy sketches funny',
    'Food': 'cooking recipe street food delicious dish',
    'Travel': 'travel vlog guide city explore',
    'Trending': 'trending videos',
};

export const ALL_CATEGORY_SECTIONS = [
    { id: 'trending', title: 'Trending Now', query: 'trending videos' },
    { id: 'music', title: 'Music Hits', query: 'official music video top hits' },
    { id: 'tech', title: 'Tech & Gadgets', query: 'technology gadgets smartphone review tech' },
    { id: 'gaming', title: 'Gaming', query: 'gaming gameplay walkthrough' },
    { id: 'sports', title: 'Sports Highlights', query: 'sports match highlights top plays' },
    { id: 'news', title: 'Latest News', query: 'daily news world news breaking' },
];
