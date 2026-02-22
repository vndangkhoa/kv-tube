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

export async function fetchMoreVideos(currentCategory: string, regionLabel: string, page: number): Promise<VideoData[]> {
    const isAllCategory = currentCategory === 'All';
    let newVideos: VideoData[] = [];

    // Modify query slightly to simulate getting more pages
    const pageModifiers = ["", "", "more", "new", "update", "latest", "part 2", "HD", "review"];
    const modifier = page < pageModifiers.length ? pageModifiers[page] : `page ${page}`;

    if (isAllCategory) {
        const promises = ALL_CATEGORY_SECTIONS.map(async (sec) => {
            const q = addRegion(sec.query, regionLabel) + " " + modifier;
            // Fetch fewer items per section on subsequent pages to mitigate loading times
            return await getSearchVideos(q, 5);
        });
        const results = await Promise.all(promises);

        // Interleave the results
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
