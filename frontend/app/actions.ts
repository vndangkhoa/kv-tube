"use server";

import { VideoData, CATEGORY_MAP, ALL_CATEGORY_SECTIONS, API_BASE } from './constants';
import { addRegion } from './utils';

export async function getSearchVideos(query: string, limit: number = 20): Promise<VideoData[]> {
    try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`, { cache: 'no-store' });
        if (!res.ok) return [];
        return res.json() as Promise<VideoData[]>;
    } catch (e) {
        console.error(e);
        return [];
    }
}

export async function getHistoryVideos(limit: number = 20): Promise<VideoData[]> {
    try {
        const res = await fetch(`${API_BASE}/api/history?limit=${limit}`, { cache: 'no-store' });
        if (!res.ok) return [];
        return res.json() as Promise<VideoData[]>;
    } catch (e) {
        console.error("Failed to get history:", e);
        return [];
    }
}

export async function getSuggestedVideos(limit: number = 20): Promise<VideoData[]> {
    try {
        const res = await fetch(`${API_BASE}/api/suggestions?limit=${limit}`, { cache: 'no-store' });
        if (!res.ok) return [];
        return res.json() as Promise<VideoData[]>;
    } catch (e) {
        console.error("Failed to get suggestions:", e);
        return [];
    }
}

export async function getRelatedVideos(videoId: string, limit: number = 10): Promise<VideoData[]> {
    try {
        const res = await fetch(`${API_BASE}/api/related?video_id=${encodeURIComponent(videoId)}&limit=${limit}`, { cache: 'no-store' });
        if (!res.ok) return [];
        return res.json() as Promise<VideoData[]>;
    } catch (e) {
        console.error("Failed to get related videos:", e);
        return [];
    }
}

export async function getRecentHistory(): Promise<VideoData | null> {
    try {
        const res = await fetch(`${API_BASE}/api/history?limit=1`, { cache: 'no-store' });
        if (!res.ok) return null;
        const history: VideoData[] = await res.json();
        return history.length > 0 ? history[0] : null;
    } catch (e) {
        console.error("Failed to get recent history:", e);
        return null;
    }
}

export async function fetchMoreVideos(currentCategory: string, regionLabel: string, page: number, contextVideoId?: string): Promise<VideoData[]> {
    const isAllCategory = currentCategory === 'All';
    let newVideos: VideoData[] = [];

    // Modify query slightly to simulate getting more pages
    const pageModifiers = ["", "", "more", "new", "update", "latest", "part 2", "HD", "review"];
    const modifier = page < pageModifiers.length ? pageModifiers[page] : `page ${page}`;

    if (isAllCategory) {
        const recentVideo = await getRecentHistory();
        if (recentVideo) {
            const promises = [
                getSearchVideos(addRegion("recommended for you", regionLabel) + " " + modifier, 8),
                getSearchVideos(addRegion(recentVideo.title, regionLabel) + " " + modifier, 8),
                getSearchVideos(addRegion("trending", regionLabel) + " " + modifier, 4)
            ];
            const results = await Promise.all(promises);

            const interleavedList: VideoData[] = [];
            const seenIds = new Set<string>();
            let sIdx = 0, rIdx = 0, tIdx = 0;
            const suggestedRes = results[0];
            const relatedRes = results[1];
            const trendingRes = results[2];

            while (sIdx < suggestedRes.length || rIdx < relatedRes.length || tIdx < trendingRes.length) {
                for (let i = 0; i < 2 && sIdx < suggestedRes.length; i++) {
                    const v = suggestedRes[sIdx++];
                    if (!seenIds.has(v.id)) { interleavedList.push(v); seenIds.add(v.id); }
                }
                for (let i = 0; i < 2 && rIdx < relatedRes.length; i++) {
                    const v = relatedRes[rIdx++];
                    if (!seenIds.has(v.id)) { interleavedList.push(v); seenIds.add(v.id); }
                }
                for (let i = 0; i < 1 && tIdx < trendingRes.length; i++) {
                    const v = trendingRes[tIdx++];
                    if (!seenIds.has(v.id)) { interleavedList.push(v); seenIds.add(v.id); }
                }
            }
            newVideos = interleavedList;
        } else {
            const promises = ALL_CATEGORY_SECTIONS.map(async (sec) => {
                const q = addRegion(sec.query, regionLabel) + " " + modifier;
                return await getSearchVideos(q, 5);
            });
            const results = await Promise.all(promises);

            const maxLen = Math.max(...results.map(arr => arr.length));
            const interleavedList: VideoData[] = [];
            const seenIds = new Set<string>();

            for (let i = 0; i < maxLen; i++) {
                for (const categoryResult of results) {
                    if (i < categoryResult.length) {
                        const video = categoryResult[i];
                        if (!seenIds.has(video.id)) {
                            interleavedList.push(video);
                            seenIds.add(video.id);
                        }
                    }
                }
            }
            newVideos = interleavedList;
        }
    } else if (currentCategory === 'WatchRelated' && contextVideoId) {
        // Mock infinite pagination for related
        const q = addRegion("related to " + contextVideoId, regionLabel) + " " + modifier;
        newVideos = await getSearchVideos(q, 20);
    } else if (currentCategory === 'WatchForYou') {
        const q = addRegion("recommended for you", regionLabel) + " " + modifier;
        newVideos = await getSearchVideos(q, 20);
    } else if (currentCategory === 'WatchAll' && contextVideoId) {
        // Implement 40:40:20 mix logic for watch page
        const promises = [
            getSearchVideos(addRegion("recommended for you", regionLabel) + " " + modifier, 8),
            getSearchVideos(addRegion("related to " + contextVideoId, regionLabel) + " " + modifier, 8),
            getSearchVideos(addRegion("trending", regionLabel) + " " + modifier, 4)
        ];
        const results = await Promise.all(promises);

        const interleavedList: VideoData[] = [];
        const seenIds = new Set<string>();
        let sIdx = 0, rIdx = 0, tIdx = 0;
        const suggestedRes = results[0];
        const relatedRes = results[1];
        const trendingRes = results[2];

        while (sIdx < suggestedRes.length || rIdx < relatedRes.length || tIdx < trendingRes.length) {
            for (let i = 0; i < 2 && sIdx < suggestedRes.length; i++) {
                const v = suggestedRes[sIdx++];
                if (!seenIds.has(v.id)) { interleavedList.push(v); seenIds.add(v.id); }
            }
            for (let i = 0; i < 2 && rIdx < relatedRes.length; i++) {
                const v = relatedRes[rIdx++];
                if (!seenIds.has(v.id)) { interleavedList.push(v); seenIds.add(v.id); }
            }
            for (let i = 0; i < 1 && tIdx < trendingRes.length; i++) {
                const v = trendingRes[tIdx++];
                if (!seenIds.has(v.id)) { interleavedList.push(v); seenIds.add(v.id); }
            }
        }
        newVideos = interleavedList;
    } else if (currentCategory === 'Watched') {
        // Fetch from history, offset by page if desired (backend doesn't support offset yet, so just increase limit)
        // If the backend returned all items, we'd normally paginate here. For now just mock it or return empty array to prevent infinite duplicating history scroll
        if (page > 1) return []; // History is just 1 page for now
        newVideos = await getHistoryVideos(50);
    } else if (currentCategory === 'Suggested') {
        const q = addRegion("popular videos", regionLabel) + " " + modifier;
        newVideos = await getSearchVideos(q, 10); // Or we could make suggestions return more things
    } else {
        const baseQuery = CATEGORY_MAP[currentCategory] || CATEGORY_MAP['All'];
        const q = addRegion(baseQuery, regionLabel) + " " + modifier;
        newVideos = await getSearchVideos(q, 20);
    }

    return newVideos;
}

export interface CommentData {
    id: string;
    text: string;
    author: string;
    author_id: string;
    author_thumbnail: string;
    likes: number;
    is_reply: boolean;
    parent: string;
    timestamp: string;
}

export async function getVideoComments(videoId: string, limit: number = 30): Promise<CommentData[]> {
    try {
        const res = await fetch(`${API_BASE}/api/comments?v=${videoId}&limit=${limit}`, { cache: 'no-store' });
        if (!res.ok) {
            console.error('Comments API error:', res.status, res.statusText);
            return [];
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            console.error('Comments API returned non-array:', data);
            return [];
        }
        return data;
    } catch (err) {
        console.error('Failed to fetch comments:', err);
        return [];
    }
}
