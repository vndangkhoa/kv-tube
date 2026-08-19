// Return YouTube Dislike (RYD) API Service
// Fetches accurate likes, dislikes, and rating ratio

export interface RYDData {
  id: string;
  dateCreated: string;
  likes: number;
  dislikes: number;
  rating: number;
  viewCount: number;
  deleted: boolean;
}

const DEFAULT_RYD_API = process.env.NEXT_PUBLIC_RYD_URL || 'https://returnyoutubedislikeapi.com';

export async function fetchDislikes(videoId: string): Promise<RYDData | null> {
  if (!videoId) return null;
  try {
    const url = `${DEFAULT_RYD_API}/votes?videoId=${encodeURIComponent(videoId)}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id || videoId,
      dateCreated: data.dateCreated || '',
      likes: data.likes ?? 0,
      dislikes: data.dislikes ?? 0,
      rating: data.rating ?? 0,
      viewCount: data.viewCount ?? 0,
      deleted: data.deleted ?? false,
    };
  } catch (err) {
    console.warn('[RYD] Failed to fetch dislikes:', err);
    return null;
  }
}
