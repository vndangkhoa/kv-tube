// SponsorBlock API Integration
// Fetches crowdsourced skip segments for YouTube videos

export interface SponsorSegment {
  category: string;
  actionType: 'skip' | 'mute' | 'full';
  segment: [number, number]; // [startTime, endTime] in seconds
  UUID: string;
}

export const SPONSOR_CATEGORY_COLORS: Record<string, { label: string; color: string; border: string }> = {
  sponsor: { label: 'Sponsor', color: '#00d66c', border: '#00b359' },
  selfpromo: { label: 'Self Promotion', color: '#ffff00', border: '#cccc00' },
  interaction: { label: 'Interaction Reminder', color: '#cc00ff', border: '#9900cc' },
  intro: { label: 'Intro Animation', color: '#00ffff', border: '#00cccc' },
  outro: { label: 'Outro / Credits', color: '#0202ed', border: '#0202aa' },
  preview: { label: 'Preview / Recap', color: '#008fd6', border: '#006fa6' },
  music_offtopic: { label: 'Non-Music Section', color: '#ff9900', border: '#cc7a00' },
};

const DEFAULT_SPONSORBLOCK_API = process.env.NEXT_PUBLIC_SPONSORBLOCK_URL || 'https://sponsor.ajay.app';

export async function fetchSponsorSegments(videoId: string): Promise<SponsorSegment[]> {
  if (!videoId) return [];
  try {
    const categories = encodeURIComponent(
      JSON.stringify(['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic'])
    );
    const url = `${DEFAULT_SPONSORBLOCK_API}/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${categories}`;
    
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) {
      if (res.status === 404) return []; // No segments found for this video
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => ({
      category: item.category,
      actionType: item.actionType || 'skip',
      segment: item.segment,
      UUID: item.UUID,
    }));
  } catch (error) {
    console.warn('[SponsorBlock] Failed to fetch skip segments:', error);
    return [];
  }
}
