"use server";

import { VideoData, CATEGORY_MAP, ALL_CATEGORY_SECTIONS } from './constants';
import { addRegion } from './utils';
import { invidious } from './services/invidious';

export async function getSearchVideos(query: string, limit: number = 20): Promise<VideoData[]> {
    try {
        const results = await invidious.search(query, { type: 'video' });
        if (!Array.isArray(results)) return [];
        return results.slice(0, limit).map((v: any) => ({
            id: v.videoId || v.id,
            title: v.title || '',
            uploader: v.author || v.uploader || 'Creator',
            channel_id: v.authorId || '',
            thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId || v.id}/mqdefault.jpg`,
            duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
            view_count: v.viewCount ?? 0,
            upload_date: v.publishedText || '',
            publishedAt: v.publishedText || '',
            avatar_url: v.authorThumbnails?.[0]?.url || v.authorThumbnail || '',
        }));
    } catch (e) {
        console.error('[actions] Search error:', e);
        return [];
    }
}

export async function getHistoryVideos(limit: number = 20): Promise<VideoData[]> {
    try {
        const history = await invidious.getAuthHistory();
        if (!Array.isArray(history)) return [];
        return history.slice(0, limit).map((v: any) => ({
            id: v.videoId || v.id,
            title: v.title || '',
            uploader: v.author || v.uploader || 'Creator',
            channel_id: v.authorId || '',
            thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId || v.id}/mqdefault.jpg`,
            duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
            view_count: v.viewCount ?? 0,
            upload_date: v.publishedText || '',
            publishedAt: v.publishedText || '',
            avatar_url: v.authorThumbnails?.[0]?.url || v.authorThumbnail || '',
        }));
    } catch (e) {
        console.error('[actions] History error:', e);
        return [];
    }
}

export async function getSuggestedVideos(limit: number = 20): Promise<VideoData[]> {
    try {
        const trending = await invidious.getTrending();
        if (!Array.isArray(trending)) return [];
        return trending.slice(0, limit).map((v: any) => ({
            id: v.videoId || v.id,
            title: v.title || '',
            uploader: v.author || v.uploader || 'Creator',
            channel_id: v.authorId || '',
            thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId || v.id}/mqdefault.jpg`,
            duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
            view_count: v.viewCount ?? 0,
            upload_date: v.publishedText || '',
            publishedAt: v.publishedText || '',
            avatar_url: v.authorThumbnails?.[0]?.url || v.authorThumbnail || '',
        }));
    } catch (e) {
        console.error('[actions] Suggested error:', e);
        return [];
    }
}

export async function getRelatedVideos(videoId: string, limit: number = 10): Promise<VideoData[]> {
    try {
        const video = await invidious.getVideo(videoId);
        if (!video || !Array.isArray(video.recommendedVideos)) return [];
        return video.recommendedVideos.slice(0, limit).map((v: any) => ({
            id: v.videoId || v.id,
            title: v.title || '',
            uploader: v.author || v.uploader || 'Creator',
            channel_id: v.authorId || '',
            thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId || v.id}/mqdefault.jpg`,
            duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${(v.lengthSeconds % 60).toString().padStart(2, '0')}` : '',
            view_count: v.viewCount ?? 0,
            upload_date: '',
            publishedAt: '',
            avatar_url: v.authorThumbnails?.[0]?.url || v.authorThumbnail || '',
        }));
    } catch (e) {
        console.error('[actions] Related videos error:', e);
        return [];
    }
}

export async function getRecentHistory(): Promise<VideoData | null> {
    try {
        const history = await getHistoryVideos(1);
        return history.length > 0 ? history[0] : null;
    } catch {
        return null;
    }
}

export async function fetchMoreVideos(currentCategory: string, regionLabel: string, page: number, contextVideoId?: string): Promise<VideoData[]> {
    const isAllCategory = currentCategory === 'All';
    let newVideos: VideoData[] = [];

    const pageModifiers = ["", "", "more", "new", "update", "latest", "part 2", "HD", "review"];
    const modifier = page < pageModifiers.length ? pageModifiers[page] : `page ${page}`;

    if (isAllCategory) {
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
    } else if (currentCategory === 'WatchRelated' && contextVideoId) {
        newVideos = await getRelatedVideos(contextVideoId, 20);
        if (newVideos.length === 0) {
            const q = addRegion("related to " + contextVideoId, regionLabel) + " " + modifier;
            newVideos = await getSearchVideos(q, 20);
        }
    } else if (currentCategory === 'WatchForYou') {
        const q = addRegion("recommended for you", regionLabel) + " " + modifier;
        newVideos = await getSearchVideos(q, 20);
    } else if (currentCategory === 'Watched') {
        if (page > 1) return [];
        newVideos = await getHistoryVideos(50);
    } else if (currentCategory === 'Suggested') {
        newVideos = await getSuggestedVideos(20);
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
        const res = await invidious.getComments(videoId);
        if (!res || !Array.isArray(res.comments)) return [];
        return res.comments.slice(0, limit).map((c: any) => ({
            id: c.commentId || '',
            text: c.contentHtml || c.content || '',
            author: c.author || '',
            author_id: c.authorId || '',
            author_thumbnail: c.authorThumbnails?.[0]?.url || '',
            likes: c.likeCount || 0,
            is_reply: !!c.isReply,
            parent: '',
            timestamp: c.publishedText || '',
        }));
    } catch (err) {
        console.error('[actions] Comments error:', err);
        return [];
    }
}
